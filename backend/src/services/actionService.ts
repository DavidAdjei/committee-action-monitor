import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { Errors } from "../lib/http";
import { buildActionNotifications } from "./notificationService";
import { auditRow } from "./auditService";
import type { ActionStatus, StakeholderType } from "@prisma/client";

/** Optimistic-concurrency updates throw P2025 when the version has moved on. */
function asConflictOnMissingRecord(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    throw Errors.versionConflict(
      "This action point was updated by someone else just now. Reload it and try again.",
    );
  }
  throw err;
}

export async function nextReferenceNo(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.actionPoint.count({
    where: { referenceNo: { startsWith: `AP-${year}-` } },
  });
  const seq = String(count + 1).padStart(3, "0");
  return `AP-${year}-${seq}`;
}

export interface CreateActionPointInput {
  meetingId: number;
  committeeId: number;
  title: string;
  description?: string;
  /** Primary owner (legacy / required). Prefer ownerIds when multiple. */
  ownerId: number;
  /** All owners — each stored as ACTION_OWNER stakeholder; ownerId defaults to first. */
  ownerIds?: number[];
  dateRaised: Date;
  deadline: Date;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  minutesReference?: string;
  additionalStakeholderIds?: number[];
  createdById: number;
}

/**
 * Mirrors mysql/create_action_point.sql: validate the meeting belongs to the
 * committee, insert the action, auto-populate the mandatory stakeholder set
 * (Chairperson, Secretary, Owner, Central Committee representative) plus any
 * additional selected stakeholders, and queue immediate notifications for
 * all of them — all inside one transaction.
 */
export async function createActionPoint(input: CreateActionPointInput) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: input.meetingId },
    include: { committee: true },
  });
  if (!meeting) throw Errors.notFound("Meeting");
  if (meeting.committeeId !== input.committeeId) {
    throw Errors.badRequest("The selected meeting does not belong to this committee.");
  }
  if (input.deadline < input.dateRaised) {
    throw Errors.badRequest("Deadline cannot precede the date raised.");
  }

  const referenceNo = await nextReferenceNo();
  const committee = meeting.committee;

  return prisma.$transaction(async (tx) => {
    const action = await tx.actionPoint.create({
      data: {
        referenceNo,
        meetingId: input.meetingId,
        committeeId: input.committeeId,
        title: input.title,
        description: input.description,
        minutesReference: input.minutesReference,
        ownerId: (input.ownerIds && input.ownerIds[0]) || input.ownerId,
        dateRaised: input.dateRaised,
        deadline: input.deadline,
        priority: input.priority ?? "MEDIUM",
        status: "OPEN",
        createdById: input.createdById,
      },
    });

    const ownerIds = [...new Set([...(input.ownerIds ?? []), input.ownerId].filter(Boolean))];
    const mandatory: { userId: number; stakeholderType: StakeholderType }[] = [
      { userId: committee.chairpersonId, stakeholderType: "CHAIRPERSON" },
      { userId: committee.secretaryId, stakeholderType: "SECRETARY" },
      ...(committee.centralRepId
        ? [{ userId: committee.centralRepId, stakeholderType: "CENTRAL_COMMITTEE" as const }]
        : []),
      ...ownerIds.map((userId) => ({ userId, stakeholderType: "ACTION_OWNER" as StakeholderType })),
    ];
    const additional = (input.additionalStakeholderIds ?? [])
      .filter((id) => !mandatory.some((m) => m.userId === id))
      .map((userId) => ({ userId, stakeholderType: "OTHER" as StakeholderType }));

    const stakeholders = [...mandatory, ...additional];
    // De-duplicate by userId (a person can only appear once per action).
    const seen = new Set<number>();
    const uniqueStakeholders = stakeholders.filter((s) => {
      if (seen.has(s.userId)) return false;
      seen.add(s.userId);
      return true;
    });

    await tx.actionStakeholder.createMany({
      data: uniqueStakeholders.map((s) => ({ actionPointId: action.id, ...s })),
    });

    await tx.notification.createMany({
      data: buildActionNotifications({
        actionPointId: action.id,
        recipientIds: uniqueStakeholders.map((s) => s.userId),
        notificationType: "CREATED",
      }),
      skipDuplicates: true,
    });

    await tx.auditEvent.create({
      data: auditRow({
        actorUserId: input.createdById,
        action: "action_point.create",
        resourceType: "action_point",
        resourceId: action.id,
        committeeId: input.committeeId,
        actionPointId: action.id,
        after: { referenceNo, title: input.title, ownerId: input.ownerId, deadline: input.deadline },
        result: "SUCCESS",
      }),
    });

    return action;
  });
}

export interface RecordActionUpdateInput {
  actionPointId: number;
  authorId: number;
  status: ActionStatus; // IN_PROGRESS | PENDING_VERIFICATION | OVERDUE (reported blocker) | CANCELLED
  progress: number;
  note: string;
  revisedDeadline?: Date;
  evidenceLink?: string;
  evidenceFiles?: { storageKey: string; filename: string; mediaType: string; sizeBytes: number }[];
  /** Client-supplied optimistic concurrency token (ActionDetail.version). */
  expectedVersion?: number;
}

/**
 * Mirrors the "Update an action and evidence" workflow: append-only history,
 * Completed requires evidence and moves to Pending Verification rather than
 * closing outright, and stakeholders are notified of the change.
 */
export async function recordActionUpdate(input: RecordActionUpdateInput) {
  const action = await prisma.actionPoint.findUnique({ where: { id: input.actionPointId } });
  if (!action) throw Errors.notFound("Action point");
  const isTerminal = ["COMPLETED", "CANCELLED"].includes(action.status);
  // Normal updates cannot touch closed actions. Reopen is a dedicated path (see reopenAction).
  if (isTerminal) {
    throw Errors.conflict("This action is already closed. Use reopen if governance allows it.");
  }
  if (input.progress < 0 || input.progress > 100) {
    throw Errors.badRequest("Progress must be between 0 and 100.");
  }

  // "Completed" in the UI means the owner asserts completion; the record is
  // held at Pending Verification until the Chairperson/Secretary approves —
  // per section 3.7 and the action lifecycle table.
  const assertingComplete = input.status === "COMPLETED";
  if (assertingComplete && !input.evidenceLink && !(input.evidenceFiles && input.evidenceFiles.length)) {
    throw Errors.badRequest("Evidence (a file or a link) is required to submit a completed action.");
  }
  const nextStatus: ActionStatus = assertingComplete ? "PENDING_VERIFICATION" : input.status;

  const expectedVersion = input.expectedVersion ?? action.version;
  if (input.expectedVersion !== undefined && input.expectedVersion !== action.version) {
    throw Errors.versionConflict(
      "This action point was updated by someone else. Reload it and try again.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const update = await tx.actionUpdate.create({
      data: {
        actionPointId: input.actionPointId,
        authorId: input.authorId,
        status: nextStatus,
        progress: assertingComplete ? 100 : input.progress,
        note: input.note,
        revisedDeadline: input.revisedDeadline,
        evidenceLink: input.evidenceLink,
      },
    });

    if (input.evidenceFiles?.length) {
      await tx.evidenceFile.createMany({
        data: input.evidenceFiles.map((f) => ({
          actionUpdateId: update.id,
          storageKey: f.storageKey,
          filename: f.filename,
          mediaType: f.mediaType,
          sizeBytes: f.sizeBytes,
          uploadedById: input.authorId,
          scanResult: process.env.DEV_AUTH_ENABLED === "true" ? "CLEAN" : "PENDING",
        })),
      });
    }

    const updated = await tx.actionPoint
      .update({
        where: { id: input.actionPointId, version: expectedVersion },
        data: {
          status: nextStatus,
          progress: assertingComplete ? 100 : input.progress,
          // OVERDUE from the UI is a reported blocker; deadline-driven overdue is set by the scheduler.
          statusReason:
            nextStatus === "OVERDUE"
              ? (input.note.startsWith("[Blocker]") ? input.note : `[Blocker] ${input.note}`)
              : nextStatus === "CANCELLED"
                ? input.note
                : action.statusReason,
          revisedDeadline: input.revisedDeadline ?? action.revisedDeadline,
          version: { increment: 1 },
        },
      })
      .catch(asConflictOnMissingRecord);

    const stakeholders = await tx.actionStakeholder.findMany({
      where: { actionPointId: input.actionPointId },
      select: { userId: true },
    });

    await tx.notification.createMany({
      data: buildActionNotifications({
        actionPointId: input.actionPointId,
        recipientIds: stakeholders.map((s) => s.userId),
        notificationType: assertingComplete ? "EVIDENCE_SUBMITTED" : "STATUS_CHANGE",
      }),
      skipDuplicates: true,
    });

    await tx.auditEvent.create({
      data: auditRow({
        actorUserId: input.authorId,
        action: "action_point.update",
        resourceType: "action_point",
        resourceId: input.actionPointId,
        actionPointId: input.actionPointId,
        before: { status: action.status, progress: action.progress },
        after: { status: nextStatus, progress: updated.progress },
        result: "SUCCESS",
      }),
    });

    return updated;
  });
}

/**
 * Chairperson/Secretary approval of a Pending Verification action —
 * completes the lifecycle to Completed and notifies the owner and
 * stakeholders (Evidence verified event).
 */
export async function verifyActionEvidence(params: {
  actionPointId: number;
  verifiedById: number;
  approve: boolean;
  note?: string;
  expectedVersion?: number;
}) {
  const action = await prisma.actionPoint.findUnique({ where: { id: params.actionPointId } });
  if (!action) throw Errors.notFound("Action point");
  if (action.status !== "PENDING_VERIFICATION") {
    throw Errors.conflict("Only an action pending verification can be verified.");
  }

  if (params.approve) {
    // Completion evidence must be present and not infected (docs §3.7 / §9).
    const latestWithFiles = await prisma.actionUpdate.findFirst({
      where: { actionPointId: params.actionPointId },
      orderBy: { createdAt: "desc" },
      include: { evidenceFiles: true },
    });
    const files = latestWithFiles?.evidenceFiles ?? [];
    const hasLink = Boolean(latestWithFiles?.evidenceLink);
    if (files.length === 0 && !hasLink) {
      throw Errors.badRequest("Cannot approve completion without evidence files or an evidence link.");
    }
    if (files.some((f) => f.scanResult === "INFECTED")) {
      throw Errors.conflict("Cannot approve while evidence failed malware scanning.");
    }
    const allowPending =
      process.env.DEV_AUTH_ENABLED === "true" && process.env.EVIDENCE_ALLOW_PENDING_DOWNLOAD === "true";
    if (
      files.length > 0 &&
      files.some((f) => f.scanResult !== "CLEAN") &&
      !(allowPending && files.every((f) => f.scanResult === "PENDING" || f.scanResult === "CLEAN"))
    ) {
      throw Errors.conflict("Evidence is still scanning or not clean. Wait for a clean scan before approving.");
    }
  }

  const expectedVersion = params.expectedVersion ?? action.version;
  if (params.expectedVersion !== undefined && params.expectedVersion !== action.version) {
    throw Errors.versionConflict(
      "This action point was updated by someone else. Reload it and try again.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.actionPoint
      .update({
        where: { id: action.id, version: expectedVersion },
        data: params.approve
          ? {
              status: "COMPLETED",
              completedAt: new Date(),
              verifiedById: params.verifiedById,
              verifiedAt: new Date(),
              completionNote: params.note,
              version: { increment: 1 },
            }
          : {
              status: "IN_PROGRESS",
              statusReason: params.note ?? "Evidence rejected; further work required.",
              version: { increment: 1 },
            },
      })
      .catch(asConflictOnMissingRecord);

    const stakeholders = await tx.actionStakeholder.findMany({
      where: { actionPointId: action.id },
      select: { userId: true },
    });

    await tx.notification.createMany({
      data: buildActionNotifications({
        actionPointId: action.id,
        recipientIds: stakeholders.map((s) => s.userId),
        notificationType: params.approve ? "EVIDENCE_VERIFIED" : "STATUS_CHANGE",
      }),
      skipDuplicates: true,
    });

    await tx.auditEvent.create({
      data: auditRow({
        actorUserId: params.verifiedById,
        action: params.approve ? "action_point.verify_approve" : "action_point.verify_reject",
        resourceType: "action_point",
        resourceId: action.id,
        actionPointId: action.id,
        result: "SUCCESS",
      }),
    });

    return updated;
  });
}

/**
 * Formal reopen of a Completed or Cancelled action (docs §5 — terminal unless
 * formally reopened). Restricted to committee officers at the HTTP layer.
 */
export async function reopenAction(params: {
  actionPointId: number;
  reopenedById: number;
  note: string;
  expectedVersion?: number;
}) {
  const action = await prisma.actionPoint.findUnique({ where: { id: params.actionPointId } });
  if (!action) throw Errors.notFound("Action point");
  if (!["COMPLETED", "CANCELLED"].includes(action.status)) {
    throw Errors.conflict("Only completed or cancelled actions can be reopened.");
  }
  if (!params.note?.trim()) {
    throw Errors.badRequest("A reason for reopening is required.");
  }

  const expectedVersion = params.expectedVersion ?? action.version;
  if (params.expectedVersion !== undefined && params.expectedVersion !== action.version) {
    throw Errors.versionConflict(
      "This action point was updated by someone else. Reload it and try again.",
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.actionUpdate.create({
      data: {
        actionPointId: params.actionPointId,
        authorId: params.reopenedById,
        status: "IN_PROGRESS",
        progress: action.progress < 100 ? action.progress : 0,
        note: params.note.trim(),
      },
    });

    const updated = await tx.actionPoint
      .update({
        where: { id: action.id, version: expectedVersion },
        data: {
          status: "IN_PROGRESS",
          completedAt: null,
          verifiedById: null,
          verifiedAt: null,
          statusReason: params.note.trim(),
          version: { increment: 1 },
        },
      })
      .catch(asConflictOnMissingRecord);

    const stakeholders = await tx.actionStakeholder.findMany({
      where: { actionPointId: action.id },
      select: { userId: true },
    });

    await tx.notification.createMany({
      data: buildActionNotifications({
        actionPointId: action.id,
        recipientIds: stakeholders.map((s) => s.userId),
        notificationType: "STATUS_CHANGE",
      }),
      skipDuplicates: true,
    });

    await tx.auditEvent.create({
      data: auditRow({
        actorUserId: params.reopenedById,
        action: "action_point.reopen",
        resourceType: "action_point",
        resourceId: action.id,
        actionPointId: action.id,
        before: { status: action.status },
        after: { status: "IN_PROGRESS", note: params.note.trim() },
        result: "SUCCESS",
      }),
    });

    return updated;
  });
}

/**
 * Structural edit of an action (title, description, owner, deadline, priority).
 * Chairperson/Secretary only — enforced at the HTTP layer.
 */
export async function updateActionMetadata(params: {
  actionPointId: number;
  actorUserId: number;
  expectedVersion?: number;
  title?: string;
  description?: string | null;
  ownerId?: number;
  deadline?: Date;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  minutesReference?: string | null;
}) {
  const action = await prisma.actionPoint.findUnique({ where: { id: params.actionPointId } });
  if (!action) throw Errors.notFound("Action point");
  if (["COMPLETED", "CANCELLED"].includes(action.status)) {
    throw Errors.conflict("Closed actions cannot be modified. Reopen first if governance allows.");
  }

  const expectedVersion = params.expectedVersion ?? action.version;
  if (params.expectedVersion !== undefined && params.expectedVersion !== action.version) {
    throw Errors.versionConflict(
      "This action point was updated by someone else. Reload it and try again.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.actionPoint
      .update({
        where: { id: action.id, version: expectedVersion },
        data: {
          title: params.title ?? action.title,
          description: params.description !== undefined ? params.description : action.description,
          ownerId: params.ownerId ?? action.ownerId,
          deadline: params.deadline ?? action.deadline,
          priority: params.priority ?? action.priority,
          minutesReference:
            params.minutesReference !== undefined ? params.minutesReference : action.minutesReference,
          version: { increment: 1 },
        },
      })
      .catch(asConflictOnMissingRecord);

    await tx.auditEvent.create({
      data: auditRow({
        actorUserId: params.actorUserId,
        action: "action_point.modify",
        resourceType: "action_point",
        resourceId: action.id,
        actionPointId: action.id,
        committeeId: action.committeeId,
        before: {
          title: action.title,
          ownerId: action.ownerId,
          deadline: action.deadline,
          priority: action.priority,
        },
        after: {
          title: updated.title,
          ownerId: updated.ownerId,
          deadline: updated.deadline,
          priority: updated.priority,
        },
        result: "SUCCESS",
      }),
    });

    return updated;
  });
}

/**
 * Soft-close via cancel semantics, or hard-remove if still OPEN with no updates.
 * Prefer CANCELLED for auditability; DELETE only when never progressed.
 */
export async function deleteActionPoint(params: {
  actionPointId: number;
  actorUserId: number;
  expectedVersion?: number;
  hardDelete?: boolean;
}) {
  const action = await prisma.actionPoint.findUnique({
    where: { id: params.actionPointId },
    include: { _count: { select: { updates: true } } },
  });
  if (!action) throw Errors.notFound("Action point");

  const expectedVersion = params.expectedVersion ?? action.version;
  if (params.expectedVersion !== undefined && params.expectedVersion !== action.version) {
    throw Errors.versionConflict(
      "This action point was updated by someone else. Reload it and try again.",
    );
  }

  // Prefer cancel over hard delete when there is history
  if (!params.hardDelete || action._count.updates > 0 || action.status !== "OPEN") {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.actionPoint
        .update({
          where: { id: action.id, version: expectedVersion },
          data: {
            status: "CANCELLED",
            statusReason: "Cancelled by committee officers",
            version: { increment: 1 },
          },
        })
        .catch(asConflictOnMissingRecord);

      await tx.actionUpdate.create({
        data: {
          actionPointId: action.id,
          authorId: params.actorUserId,
          status: "CANCELLED",
          progress: action.progress,
          note: "Action cancelled by committee officers",
        },
      });

      await tx.auditEvent.create({
        data: auditRow({
          actorUserId: params.actorUserId,
          action: "action_point.cancel",
          resourceType: "action_point",
          resourceId: action.id,
          actionPointId: action.id,
          committeeId: action.committeeId,
          before: { status: action.status },
          after: { status: "CANCELLED" },
          result: "SUCCESS",
        }),
      });

      return { mode: "cancelled" as const, action: updated };
    });
  }

  return prisma.$transaction(async (tx) => {
    await tx.actionStakeholder.deleteMany({ where: { actionPointId: action.id } });
    await tx.notification.deleteMany({ where: { actionPointId: action.id } });
    await tx.actionPoint.delete({ where: { id: action.id } });
    await tx.auditEvent.create({
      data: auditRow({
        actorUserId: params.actorUserId,
        action: "action_point.delete",
        resourceType: "action_point",
        resourceId: action.id,
        committeeId: action.committeeId,
        before: { referenceNo: action.referenceNo, title: action.title },
        result: "SUCCESS",
      }),
    });
    return { mode: "deleted" as const, action: null };
  });
}

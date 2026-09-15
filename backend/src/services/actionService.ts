import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { Errors } from "../lib/http";
import { buildActionNotifications } from "./notificationService";
import { auditRow } from "./auditService";
import type { ActionStatus, StakeholderType } from "@prisma/client";

/** Optimistic-concurrency updates throw P2025 when the version has moved on. */
function asConflictOnMissingRecord(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    throw Errors.conflict(
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
  ownerId: number;
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
        ownerId: input.ownerId,
        dateRaised: input.dateRaised,
        deadline: input.deadline,
        priority: input.priority ?? "MEDIUM",
        status: "OPEN",
        createdById: input.createdById,
      },
    });

    const mandatory: { userId: number; stakeholderType: StakeholderType }[] = [
      { userId: committee.chairpersonId, stakeholderType: "CHAIRPERSON" },
      { userId: committee.secretaryId, stakeholderType: "SECRETARY" },
      { userId: input.ownerId, stakeholderType: "ACTION_OWNER" },
      { userId: committee.centralRepId, stakeholderType: "CENTRAL_COMMITTEE" },
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
}

/**
 * Mirrors the "Update an action and evidence" workflow: append-only history,
 * Completed requires evidence and moves to Pending Verification rather than
 * closing outright, and stakeholders are notified of the change.
 */
export async function recordActionUpdate(input: RecordActionUpdateInput) {
  const action = await prisma.actionPoint.findUnique({ where: { id: input.actionPointId } });
  if (!action) throw Errors.notFound("Action point");
  if (["COMPLETED", "CANCELLED"].includes(action.status)) {
    throw Errors.conflict("This action is already closed and cannot be updated.");
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
        })),
      });
    }

    const updated = await tx.actionPoint
      .update({
        where: { id: input.actionPointId, version: action.version },
        data: {
          status: nextStatus,
          progress: assertingComplete ? 100 : input.progress,
          statusReason: nextStatus === "OVERDUE" ? input.note : action.statusReason,
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
}) {
  const action = await prisma.actionPoint.findUnique({ where: { id: params.actionPointId } });
  if (!action) throw Errors.notFound("Action point");
  if (action.status !== "PENDING_VERIFICATION") {
    throw Errors.conflict("Only an action pending verification can be verified.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.actionPoint
      .update({
        where: { id: action.id, version: action.version },
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

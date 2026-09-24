import { prisma } from "../lib/prisma";
import { Errors } from "../lib/http";
import { auditRow } from "./auditService";
import { createActionPoint } from "./actionService";
import type { MinutesSource } from "@prisma/client";

export interface ImportActionDraft {
  title: string;
  description?: string;
  /** One or more owners — first is primary ownerId for legacy fields */
  ownerIds: number[];
  deadline?: string | Date;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status?: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE" | "PENDING_VERIFICATION" | "CANCELLED";
  progress?: number;
}

export interface ImportMinutesInput {
  meetingId: number;
  discussion: string;
  documentUrl?: string;
  sourcePopulation?: MinutesSource;
  actions: ImportActionDraft[];
  createdById: number;
  /** If true, only resolve/create actions — do not create minutes pack */
  actionsOnly?: boolean;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[*_]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find an existing committee action that matches title + at least one owner.
 */
export async function findMatchingAction(params: {
  committeeId: number;
  title: string;
  ownerIds: number[];
}) {
  const norm = normalizeTitle(params.title);
  if (!norm || params.ownerIds.length === 0) return null;

  const candidates = await prisma.actionPoint.findMany({
    where: {
      committeeId: params.committeeId,
      OR: [
        { ownerId: { in: params.ownerIds } },
        {
          stakeholders: {
            some: {
              stakeholderType: "ACTION_OWNER",
              userId: { in: params.ownerIds },
            },
          },
        },
      ],
    },
    include: {
      stakeholders: { where: { stakeholderType: "ACTION_OWNER" } },
      owner: true,
    },
    take: 50,
  });

  return (
    candidates.find((a) => normalizeTitle(a.title) === norm) ??
    candidates.find((a) => {
      const t = normalizeTitle(a.title);
      return t.includes(norm) || norm.includes(t);
    }) ??
    null
  );
}

/**
 * Import minutes and/or action points:
 * - For each draft action, match by title + owner(s) within the committee
 * - Reuse existing action or create a new one (multi-owner supported)
 * - Optionally create a draft minutes pack linked to those actions
 */
export async function importMinutesWithActions(input: ImportMinutesInput) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: input.meetingId },
    include: { committee: true },
  });
  if (!meeting) throw Errors.notFound("Meeting");

  if (!input.actionsOnly) {
    const existingMinutes = await prisma.meetingMinutes.findUnique({
      where: { meetingId: input.meetingId },
    });
    if (existingMinutes) {
      throw Errors.conflict("This meeting already has minutes. Only one minutes pack is allowed per meeting.");
    }
    if (!input.discussion?.trim()) {
      throw Errors.badRequest("discussion is required when importing minutes.");
    }
  }

  const resolved: {
    actionId: number;
    created: boolean;
    title: string;
  }[] = [];

  for (const draft of input.actions) {
    const title = draft.title?.trim();
    const ownerIds = [...new Set((draft.ownerIds ?? []).filter((id) => Number.isInteger(id)))];
    if (!title || ownerIds.length === 0) {
      throw Errors.badRequest("Each action requires a title and at least one ownerId.");
    }

    const match = await findMatchingAction({
      committeeId: meeting.committeeId,
      title,
      ownerIds,
    });

    if (match) {
      // Ensure all requested owners are ACTION_OWNER stakeholders
      for (const uid of ownerIds) {
        await prisma.actionStakeholder.upsert({
          where: {
            actionPointId_userId: { actionPointId: match.id, userId: uid },
          },
          create: {
            actionPointId: match.id,
            userId: uid,
            stakeholderType: "ACTION_OWNER",
          },
          update: { stakeholderType: "ACTION_OWNER" },
        });
      }
      resolved.push({ actionId: match.id, created: false, title: match.title });
      continue;
    }

    const deadline =
      draft.deadline != null
        ? new Date(draft.deadline)
        : new Date(Date.now() + 14 * 24 * 3600_000);

    const created = await createActionPoint({
      meetingId: input.meetingId,
      committeeId: meeting.committeeId,
      title,
      description: draft.description,
      ownerId: ownerIds[0],
      ownerIds,
      dateRaised: new Date(),
      deadline,
      priority: draft.priority,
      status: draft.status,
      progress: draft.progress,
      createdById: input.createdById,
    });

    resolved.push({ actionId: created.id, created: true, title: created.title });
  }

  if (input.actionsOnly) {
    await prisma.auditEvent.create({
      data: auditRow({
        actorUserId: input.createdById,
        action: "action_point.bulk_import",
        resourceType: "committee",
        resourceId: meeting.committeeId,
        committeeId: meeting.committeeId,
        after: {
          meetingId: input.meetingId,
          created: resolved.filter((r) => r.created).length,
          linked: resolved.filter((r) => !r.created).length,
        },
        result: "SUCCESS",
      }),
    });
    return {
      minutes: null as null,
      actions: resolved,
    };
  }

  if (resolved.length === 0) {
    throw Errors.badRequest("Minutes import requires at least one action point to link.");
  }

  const actionIds = resolved.map((r) => r.actionId);
  const actions = await prisma.actionPoint.findMany({
    where: { id: { in: actionIds } },
  });

  const minutes = await prisma.$transaction(async (tx) => {
    const row = await tx.meetingMinutes.create({
      data: {
        meetingId: input.meetingId,
        sourcePopulation: input.sourcePopulation ?? "LATEST_MEETING",
        discussion: input.discussion.trim(),
        documentUrl: input.documentUrl,
        createdById: input.createdById,
        status: "DRAFT",
      },
    });

    await tx.minuteActionSnapshot.createMany({
      data: actions.map((a) => ({
        minutesId: row.id,
        actionPointId: a.id,
        sourceMeetingId: a.meetingId,
        actionStatus: a.status,
        progressPercent: a.progress,
        ownerRemarks: a.statusReason,
      })),
    });

    await tx.auditEvent.create({
      data: auditRow({
        actorUserId: input.createdById,
        action: "minutes.import",
        resourceType: "meeting_minutes",
        resourceId: row.id,
        committeeId: meeting.committeeId,
        after: {
          meetingId: input.meetingId,
          actionCount: actions.length,
          createdActions: resolved.filter((r) => r.created).length,
          linkedExisting: resolved.filter((r) => !r.created).length,
        },
        result: "SUCCESS",
      }),
    });

    return row;
  });

  return { minutes, actions: resolved };
}

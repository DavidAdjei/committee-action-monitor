import { prisma } from "../lib/prisma";
import { Errors } from "../lib/http";
import { buildActionNotifications } from "./notificationService";
import { auditRow } from "./auditService";
import type { MinutesSource } from "@prisma/client";

export interface CreateMinutesInput {
  meetingId: number;
  sourcePopulation: MinutesSource;
  discussion: string;
  includedActionPointIds: number[];
  createdById: number;
  documentUrl?: string;
}

/**
 * Mirrors "Produce minutes": the selected actions' current status/progress
 * are captured as an immutable snapshot at creation time. Later changes to
 * the live action must never rewrite these rows — that is what makes issued
 * minutes historically trustworthy.
 */
export async function createDraftMinutes(input: CreateMinutesInput) {
  const meeting = await prisma.meeting.findUnique({ where: { id: input.meetingId } });
  if (!meeting) throw Errors.notFound("Meeting");

  const actions = await prisma.actionPoint.findMany({
    where: { id: { in: input.includedActionPointIds }, committeeId: meeting.committeeId },
    include: { owner: true },
  });
  if (actions.length !== input.includedActionPointIds.length) {
    throw Errors.badRequest("One or more selected actions do not belong to this committee.");
  }

  return prisma.$transaction(async (tx) => {
    const minutes = await tx.meetingMinutes.create({
      data: {
        meetingId: input.meetingId,
        sourcePopulation: input.sourcePopulation,
        discussion: input.discussion,
        documentUrl: input.documentUrl,
        createdById: input.createdById,
        status: "DRAFT",
      },
    });

    await tx.minuteActionSnapshot.createMany({
      data: actions.map((a) => ({
        minutesId: minutes.id,
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
        action: "minutes.create_draft",
        resourceType: "meeting_minutes",
        resourceId: minutes.id,
        committeeId: meeting.committeeId,
        after: { meetingId: input.meetingId, actionCount: actions.length },
        result: "SUCCESS",
      }),
    });

    return minutes;
  });
}

export async function issueMinutes(minutesId: number, issuedById: number, documentUrl?: string) {
  const minutes = await prisma.meetingMinutes.findUnique({
    where: { id: minutesId },
    include: {
      meeting: { include: { committee: true } },
      snapshots: { include: { actionPoint: true } },
    },
  });
  if (!minutes) throw Errors.notFound("Minutes");
  if (minutes.status !== "DRAFT") throw Errors.conflict("Only draft minutes can be issued.");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.meetingMinutes.update({
      where: { id: minutesId },
      data: {
        status: "ISSUED",
        issuedAt: new Date(),
        documentUrl: documentUrl ?? minutes.documentUrl,
      },
    });

    const committee = minutes.meeting.committee;
    const recipientIds = new Set<number>([
      committee.chairpersonId,
      committee.secretaryId,
      committee.centralRepId,
    ]);
    for (const s of minutes.snapshots) recipientIds.add(s.actionPoint.ownerId);

    for (const actionPointId of minutes.snapshots.map((s) => s.actionPointId)) {
      await tx.notification.createMany({
        data: buildActionNotifications({
          actionPointId,
          recipientIds: Array.from(recipientIds),
          notificationType: "MINUTES_ISSUED",
        }),
        skipDuplicates: true,
      });
    }

    await tx.auditEvent.create({
      data: auditRow({
        actorUserId: issuedById,
        action: "minutes.issue",
        resourceType: "meeting_minutes",
        resourceId: minutesId,
        committeeId: committee.id,
        result: "SUCCESS",
      }),
    });

    return updated;
  });
}

export async function approveMinutes(minutesId: number, approvedById: number) {
  const minutes = await prisma.meetingMinutes.findUnique({
    where: { id: minutesId },
    include: { meeting: true },
  });
  if (!minutes) throw Errors.notFound("Minutes");
  if (minutes.status !== "ISSUED") throw Errors.conflict("Only issued minutes can be approved.");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.meetingMinutes.update({
      where: { id: minutesId },
      data: { status: "APPROVED", approvedAt: new Date() },
    });

    await tx.auditEvent.create({
      data: auditRow({
        actorUserId: approvedById,
        action: "minutes.approve",
        resourceType: "meeting_minutes",
        resourceId: minutesId,
        committeeId: minutes.meeting.committeeId,
        result: "SUCCESS",
      }),
    });

    return updated;
  });
}

/** Full minutes detail with immutable snapshots and action labels for the UI. */
export async function getMinutesDetail(minutesId: number) {
  const minutes = await prisma.meetingMinutes.findUnique({
    where: { id: minutesId },
    include: {
      meeting: true,
      createdBy: true,
      snapshots: {
        include: {
          actionPoint: {
            include: { owner: true },
          },
        },
      },
    },
  });
  if (!minutes) throw Errors.notFound("Minutes");
  return serializeMinutesDetail(minutes);
}

export function serializeMinutesDetail(minutes: {
  id: number;
  meetingId: number;
  status: string;
  sourcePopulation: string;
  discussion: string | null;
  documentUrl: string | null;
  createdById: number;
  issuedAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
  meeting: { id: number; title: string; reference: string; startsAt: Date; committeeId: number };
  createdBy: { id: number; fullName: string };
  snapshots: {
    minutesId: number;
    actionPointId: number;
    sourceMeetingId: number | null;
    actionStatus: string;
    progressPercent: number;
    ownerRemarks: string | null;
    capturedAt: Date;
    actionPoint: {
      id: number;
      referenceNo: string;
      title: string;
      owner: { id: number; fullName: string };
    };
  }[];
}) {
  return {
    id: minutes.id,
    meetingId: minutes.meetingId,
    status: minutes.status,
    sourcePopulation: minutes.sourcePopulation,
    discussion: minutes.discussion,
    documentUrl: minutes.documentUrl,
    createdBy: { id: minutes.createdBy.id, fullName: minutes.createdBy.fullName },
    issuedAt: minutes.issuedAt,
    approvedAt: minutes.approvedAt,
    createdAt: minutes.createdAt,
    meeting: {
      id: minutes.meeting.id,
      title: minutes.meeting.title,
      reference: minutes.meeting.reference,
      startsAt: minutes.meeting.startsAt,
      committeeId: minutes.meeting.committeeId,
    },
    snapshots: minutes.snapshots.map((s) => ({
      actionPointId: s.actionPointId,
      referenceNo: s.actionPoint.referenceNo,
      title: s.actionPoint.title,
      owner: { id: s.actionPoint.owner.id, fullName: s.actionPoint.owner.fullName },
      actionStatus: s.actionStatus,
      progressPercent: s.progressPercent,
      ownerRemarks: s.ownerRemarks,
      capturedAt: s.capturedAt,
      sourceMeetingId: s.sourceMeetingId,
    })),
  };
}

export async function listMinutesForMeeting(meetingId: number) {
  const rows = await prisma.meetingMinutes.findMany({
    where: { meetingId },
    include: {
      createdBy: true,
      meeting: true,
      snapshots: {
        include: {
          actionPoint: { include: { owner: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeMinutesDetail);
}

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
      data: { status: "ISSUED", issuedAt: new Date(), documentUrl },
    });

    const committee = minutes.meeting.committee;
    const recipientIds = new Set<number>([committee.chairpersonId, committee.secretaryId, committee.centralRepId]);
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
  const minutes = await prisma.meetingMinutes.findUnique({ where: { id: minutesId } });
  if (!minutes) throw Errors.notFound("Minutes");
  if (minutes.status !== "ISSUED") throw Errors.conflict("Only issued minutes can be approved.");

  return prisma.meetingMinutes.update({
    where: { id: minutesId },
    data: { status: "APPROVED", approvedAt: new Date() },
  });
}

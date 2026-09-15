import { prisma } from "../lib/prisma";
import { buildActionNotifications } from "./notificationService";

const ACTIVE_STATUSES = ["OPEN", "IN_PROGRESS", "PENDING_VERIFICATION"] as const;

/**
 * Run once daily (see functions/dailyReminderTimer.ts). Reproduces
 * mysql/daily_reminder.sql using the application layer so it participates
 * in the same Prisma transaction semantics and notification outbox as
 * every other write path:
 *   1. Queue one reminder per stakeholder per day, from 14 days before the
 *      deadline through the deadline, for every still-active action.
 *   2. Move any action whose deadline has passed into OVERDUE and queue an
 *      escalation notification for every stakeholder.
 * Idempotency keys are date-scoped, so re-running this on the same day is
 * always a safe no-op for actions already processed today.
 */
export async function runDailyReminderAndEscalation(): Promise<{
  remindersQueued: number;
  escalated: number;
}> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const in14Days = new Date(today);
  in14Days.setUTCDate(in14Days.getUTCDate() + 14);

  const dueForReminder = await prisma.actionPoint.findMany({
    where: {
      status: { in: [...ACTIVE_STATUSES] },
      deadline: { gte: today, lte: in14Days },
    },
    include: { stakeholders: true },
  });

  let remindersQueued = 0;
  for (const action of dueForReminder) {
    const result = await prisma.notification.createMany({
      data: buildActionNotifications({
        actionPointId: action.id,
        recipientIds: action.stakeholders.map((s) => s.userId),
        notificationType: "DAILY_REMINDER",
        scheduledFor: today,
      }),
      skipDuplicates: true,
    });
    remindersQueued += result.count;
  }

  const overdueCandidates = await prisma.actionPoint.findMany({
    where: {
      status: { in: [...ACTIVE_STATUSES] },
      deadline: { lt: today },
    },
    include: { stakeholders: true },
  });

  let escalated = 0;
  for (const action of overdueCandidates) {
    await prisma.$transaction(async (tx) => {
      await tx.actionPoint.update({
        where: { id: action.id, version: action.version },
        data: { status: "OVERDUE", version: { increment: 1 } },
      });
      await tx.notification.createMany({
        data: buildActionNotifications({
          actionPointId: action.id,
          recipientIds: action.stakeholders.map((s) => s.userId),
          notificationType: "OVERDUE_ESCALATION",
          scheduledFor: today,
        }),
        skipDuplicates: true,
      });
    });
    escalated += 1;
  }

  return { remindersQueued, escalated };
}

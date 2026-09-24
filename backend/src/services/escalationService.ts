import { prisma } from "../lib/prisma";
import { buildActionNotifications } from "./notificationService";

/** Work still owned by the action owner — subject to daily reminders + auto-overdue. */
const WORK_IN_PROGRESS_STATUSES = ["OPEN", "IN_PROGRESS"] as const;

/**
 * Run once daily (see functions/dailyReminderTimer.ts). Reproduces
 * mysql/daily_reminder.sql using the application layer so it participates
 * in the same Prisma transaction semantics and notification outbox as
 * every other write path:
 *   1. Queue one reminder per stakeholder per day, from 14 days before the
 *      deadline through the deadline, for OPEN / IN_PROGRESS actions only.
 *   2. Move OPEN / IN_PROGRESS past deadline into OVERDUE and queue escalation.
 *   PENDING_VERIFICATION is excluded: approval is with Chair/Secretary; auto-overdue
 *   would remove items from the verification queue and block approve.
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
      status: { in: [...WORK_IN_PROGRESS_STATUSES] },
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
      status: { in: [...WORK_IN_PROGRESS_STATUSES] },
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

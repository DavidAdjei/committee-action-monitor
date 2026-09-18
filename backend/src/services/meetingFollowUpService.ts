import { prisma } from "../lib/prisma";

/**
 * Post-meeting secretary follow-ups (email + in-app):
 *
 * 1. Day after the meeting (by the 07:00 job): if the meeting has zero action
 *    points, notify the committee secretary to create them.
 * 2. Day after that actions reminder (meeting day + 2): if the meeting still
 *    has no minutes pack, notify the secretary to create and issue minutes.
 *
 * Idempotency keys are scoped by meeting + calendar day + channel so a
 * re-run of the job never doubles the alert.
 */

function utcDayStart(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function dayKey(d: Date): string {
  return utcDayStart(d).toISOString().slice(0, 10);
}

async function queueSecretaryAlert(params: {
  meetingId: number;
  secretaryId: number;
  notificationType: "MEETING_ACTIONS_REMINDER" | "MEETING_MINUTES_REMINDER";
  scheduledFor: Date;
}): Promise<number> {
  const day = dayKey(params.scheduledFor);
  const channels = ["EMAIL", "IN_APP"] as const;
  let created = 0;
  for (const channel of channels) {
    try {
      await prisma.notification.create({
        data: {
          actionPointId: null,
          recipientId: params.secretaryId,
          channel,
          notificationType: params.notificationType,
          idempotencyKey: `meeting:${params.meetingId}:${params.notificationType}:${channel}:${day}`,
          scheduledFor: params.scheduledFor,
          deliveryStatus: "PENDING",
        },
      });
      created += 1;
    } catch {
      // Unique idempotency key → already queued
    }
  }
  return created;
}

/**
 * Run from the daily timer (target 07:00). Uses the meeting's startsAt calendar
 * day as "meeting day". Meetings without a secretary are skipped.
 */
export async function runMeetingFollowUpReminders(now = new Date()): Promise<{
  actionsReminders: number;
  minutesReminders: number;
}> {
  const today = utcDayStart(now);
  const meetingDayForActionsReminder = addUtcDays(today, -1); // meetings that ran yesterday
  const meetingDayForMinutesReminder = addUtcDays(today, -2); // meetings from 2 days ago

  const endOf = (day: Date) => {
    const e = new Date(day);
    e.setUTCHours(23, 59, 59, 999);
    return e;
  };

  let actionsReminders = 0;
  let minutesReminders = 0;

  // --- 1) Actions reminder: meeting yesterday, zero action points ---
  const meetingsNeedingActions = await prisma.meeting.findMany({
    where: {
      startsAt: {
        gte: meetingDayForActionsReminder,
        lte: endOf(meetingDayForActionsReminder),
      },
      actionPoints: { none: {} },
    },
    include: {
      committee: { select: { id: true, name: true, secretaryId: true } },
    },
  });

  for (const m of meetingsNeedingActions) {
    if (!m.committee.secretaryId) continue;
    actionsReminders += await queueSecretaryAlert({
      meetingId: m.id,
      secretaryId: m.committee.secretaryId,
      notificationType: "MEETING_ACTIONS_REMINDER",
      scheduledFor: today,
    });
  }

  // --- 2) Minutes reminder: meeting two days ago, no minutes yet ---
  //    (runs the day after the actions reminder window)
  const meetingsNeedingMinutes = await prisma.meeting.findMany({
    where: {
      startsAt: {
        gte: meetingDayForMinutesReminder,
        lte: endOf(meetingDayForMinutesReminder),
      },
      minutes: { none: {} },
    },
    include: {
      committee: { select: { id: true, name: true, secretaryId: true } },
    },
  });

  for (const m of meetingsNeedingMinutes) {
    if (!m.committee.secretaryId) continue;
    minutesReminders += await queueSecretaryAlert({
      meetingId: m.id,
      secretaryId: m.committee.secretaryId,
      notificationType: "MEETING_MINUTES_REMINDER",
      scheduledFor: today,
    });
  }

  return { actionsReminders, minutesReminders };
}

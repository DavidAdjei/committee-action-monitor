import { app, InvocationContext, Timer } from "@azure/functions";
import { runDailyReminderAndEscalation } from "../services/escalationService";
import { runMeetingFollowUpReminders } from "../services/meetingFollowUpService";

/**
 * Daily 07:00 UTC job:
 *  - Action deadline reminders + overdue escalations
 *  - Post-meeting secretary alerts:
 *      • Day after meeting, 07:00 — no action points yet → MEETING_ACTIONS_REMINDER
 *      • Two days after meeting — no minutes yet → MEETING_MINUTES_REMINDER
 */
async function dailyReminderTimer(_timer: Timer, ctx: InvocationContext): Promise<void> {
  const actionResult = await runDailyReminderAndEscalation();
  const meetingResult = await runMeetingFollowUpReminders();
  ctx.log(
    `Daily job complete: ${actionResult.remindersQueued} action reminders, ${actionResult.escalated} escalated; ` +
    `${meetingResult.actionsReminders} meeting-actions alerts, ${meetingResult.minutesReminders} minutes alerts queued.`,
  );
}

app.timer("dailyReminderTimer", {
  schedule: "0 0 7 * * *",
  handler: dailyReminderTimer,
});

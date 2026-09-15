import { app, InvocationContext, Timer } from "@azure/functions";
import { runDailyReminderAndEscalation } from "../services/escalationService";

/**
 * Runs at 08:00 UTC daily — matches the documented "daily reminders begin
 * 14 days before the deadline" and "escalated without duplicate
 * notifications" rules (mysql/daily_reminder.sql, now implemented as an
 * application-layer job with the same idempotency guarantees).
 * Adjust the CRON to the Bank's preferred local business-hours equivalent.
 */
async function dailyReminderTimer(_timer: Timer, ctx: InvocationContext): Promise<void> {
  const result = await runDailyReminderAndEscalation();
  ctx.log(
    `Daily reminder/escalation run complete: ${result.remindersQueued} reminders queued, ${result.escalated} actions escalated to OVERDUE.`,
  );
}

app.timer("dailyReminderTimer", {
  schedule: "0 0 8 * * *",
  handler: dailyReminderTimer,
});

import { app, HttpRequest, HttpResponseInit, InvocationContext, Timer } from "@azure/functions";
import { processPendingEmailQueue } from "../services/emailDispatchService";
import { ok, errorResponse, preflight } from "../lib/http";
import { requireUser } from "../lib/auth";

/**
 * Frequent worker that drains the notification outbox (EMAIL via Graph sendMail,
 * IN_APP marked delivered). Runs every 2 minutes.
 */
async function notificationDispatchTimer(_timer: Timer, ctx: InvocationContext): Promise<void> {
  const result = await processPendingEmailQueue(150);
  ctx.log(
    `Notification dispatch: sent=${result.sent} failed=${result.failed}`,
  );
}

app.timer("notificationDispatchTimer", {
  schedule: "0 */2 * * * *",
  handler: notificationDispatchTimer,
});

/**
 * Manual flush for ops / local testing: POST /api/notifications/dispatch
 * Admin only when not in DEV_AUTH mode.
 */
async function dispatchNowHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    if (!user.isAdmin && process.env.DEV_AUTH_ENABLED !== "true") {
      return errorResponse(new Error("Only administrators may trigger notification dispatch."));
    }
    const result = await processPendingEmailQueue(200);
    return ok(result);
  } catch (err) {
    return errorResponse(err);
  }
}

app.http("notificationsDispatch", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "notifications/dispatch",
  handler: dispatchNowHandler,
});

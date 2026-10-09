import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { isPlatformAdmin } from "../lib/authorize";
import { ok, errorResponse, preflight, Errors } from "../lib/http";
import { getOpsSnapshot } from "../lib/opsMetrics";

/** Public liveness — no auth. */
async function healthLive(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  return ok({ status: "ok", service: "committee-action-monitor-api" });
}

/**
 * Ops metrics for platform admins (or DEV_AUTH).
 * Combines in-process counters (since last restart) with durable FAILED outbox counts.
 */
async function healthMetrics(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    if (!isPlatformAdmin(user) && process.env.DEV_AUTH_ENABLED !== "true") {
      throw Errors.forbidden("Only a platform administrator may view ops metrics.");
    }

    const snapshot = getOpsSnapshot();

    const [failedEmail, pendingEmail, failedInApp] = await Promise.all([
      prisma.notification.count({
        where: { channel: "EMAIL", deliveryStatus: "FAILED" },
      }),
      prisma.notification.count({
        where: { channel: "EMAIL", deliveryStatus: "PENDING" },
      }),
      prisma.notification.count({
        where: { deliveryStatus: "FAILED" },
      }),
    ]);

    return ok({
      ...snapshot,
      outbox: {
        emailFailed: failedEmail,
        emailPending: pendingEmail,
        anyFailed: failedInApp,
      },
      notes: [
        "mail.* and teams.* counters reset when the Functions host restarts",
        "outbox.* counts are durable in the database",
        "Use POST /notifications/outbox/retry to requeue FAILED emails",
      ],
    });
  } catch (err) {
    return errorResponse(err);
  }
}

app.http("healthLive", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "health",
  handler: healthLive,
});

app.http("healthMetrics", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "health/metrics",
  handler: healthMetrics,
});

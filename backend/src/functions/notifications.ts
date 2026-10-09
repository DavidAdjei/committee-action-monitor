import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { ok, errorResponse, preflight, Errors } from "../lib/http";
import { isPlatformAdmin } from "../lib/authorize";
import { processPendingEmailQueue } from "../services/emailDispatchService";

async function listNotifications(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const notifications = await prisma.notification.findMany({
      where: { recipientId: user.id },
      include: { actionPoint: { include: { committee: true } } },
      orderBy: { scheduledFor: "desc" },
      take: 100,
    });

    // For ACTION_COMMENT, resolve who commented (stored in idempotency key as action-comment:{id})
    const commentIds = new Set<number>();
    for (const n of notifications) {
      if (n.notificationType !== "ACTION_COMMENT") continue;
      const m = /action-comment:(\d+)/.exec(n.idempotencyKey ?? "");
      if (m) commentIds.add(Number(m[1]));
    }
    const comments =
      commentIds.size > 0
        ? await prisma.actionComment.findMany({
            where: { id: { in: [...commentIds] } },
            include: { author: { select: { fullName: true } } },
          })
        : [];
    const commentById = new Map(comments.map((c) => [c.id, c]));

    return ok(
      notifications.map((n) => {
        let summary: string | null = null;
        if (n.notificationType === "ACTION_COMMENT") {
          const m = /action-comment:(\d+)/.exec(n.idempotencyKey ?? "");
          const comment = m ? commentById.get(Number(m[1])) : undefined;
          const who = comment?.author.fullName;
          const ref = n.actionPoint?.referenceNo;
          summary = who
            ? `${who} commented on action ${ref ?? ""}`.trim()
            : "A Central Committee member commented on an action";
        }
        return {
          id: n.id,
          notificationType: n.notificationType,
          deliveryStatus: n.deliveryStatus,
          channel: n.channel,
          errorMessage: n.errorMessage,
          scheduledFor: n.scheduledFor,
          sentAt: n.sentAt,
          readAt: n.readAt,
          summary,
          action: n.actionPoint
            ? {
                id: n.actionPoint.id,
                referenceNo: n.actionPoint.referenceNo,
                title: n.actionPoint.title,
                committee: n.actionPoint.committee.name,
              }
            : null,
        };
      }),
    );
  } catch (err) {
    return errorResponse(err);
  }
}

async function markRead(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw Errors.badRequest("Invalid notification id.");

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.recipientId !== user.id) throw Errors.notFound("Notification");

    const updated = await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    return ok(updated);
  } catch (err) {
    return errorResponse(err);
  }
}

async function markAllRead(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    await prisma.notification.updateMany({
      where: { recipientId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return ok({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}

app.http("listNotifications", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "notifications",
  handler: listNotifications,
});

app.http("markNotificationRead", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "notifications/{id}/read",
  handler: markRead,
});

app.http("markAllNotificationsRead", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "notifications/read-all",
  handler: markAllRead,
});

/** Platform admin: recent notification outbox (email + in-app delivery status). */
async function listNotificationOutbox(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    if (!isPlatformAdmin(user) && process.env.DEV_AUTH_ENABLED !== "true") {
      throw Errors.forbidden("Only a platform administrator may view the notification outbox.");
    }
    const take = Math.min(100, Math.max(1, Number(req.query.get("limit") ?? 50)));
    const rows = await prisma.notification.findMany({
      where: {},
      orderBy: { scheduledFor: "desc" },
      take,
      include: {
        recipient: { select: { id: true, fullName: true, email: true } },
        actionPoint: { select: { id: true, referenceNo: true, title: true } },
      },
    });
    return ok(
      rows.map((n) => ({
        id: n.id,
        channel: n.channel,
        notificationType: n.notificationType,
        deliveryStatus: n.deliveryStatus,
        errorMessage: n.errorMessage,
        scheduledFor: n.scheduledFor,
        sentAt: n.sentAt,
        recipient: n.recipient,
        actionPoint: n.actionPoint,
        actionPointId: n.actionPointId,
      })),
    );
  } catch (err) {
    return errorResponse(err);
  }
}

async function retryFailedNotifications(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    if (!isPlatformAdmin(user) && process.env.DEV_AUTH_ENABLED !== "true") {
      throw Errors.forbidden("Only a platform administrator may retry notification delivery.");
    }
    // Reset FAILED email rows to PENDING so the dispatcher can try again
    const reset = await prisma.notification.updateMany({
      where: { deliveryStatus: "FAILED", channel: "EMAIL" },
      data: { deliveryStatus: "PENDING", errorMessage: null },
    });
    const result = await processPendingEmailQueue(100);
    return ok({ reset: reset.count, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}

app.http("notificationOutbox", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "notifications/outbox",
  handler: listNotificationOutbox,
});

app.http("notificationOutboxRetry", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "notifications/outbox/retry",
  handler: retryFailedNotifications,
});

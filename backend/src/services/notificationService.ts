import type { Prisma, NotificationType } from "@prisma/client";

/**
 * Builds notification rows to be created inside the *same* transaction as
 * the business event they describe (per the documented "queue notifications
 * transactionally" delivery control). `idempotencyKey` is unique, so a
 * retried request or a duplicate scheduler run cannot create a duplicate
 * send — `skipDuplicates: true` on createMany turns a repeat into a no-op.
 */
export function buildActionNotifications(params: {
  actionPointId: number;
  /** In-app recipients (typically all stakeholders) */
  recipientIds: number[];
  /**
   * Email recipients. When set, only these users get EMAIL rows.
   * When omitted, every recipientIds user also gets EMAIL.
   * Use for action-owner-only mail (CREATED / DAILY_REMINDER / OVERDUE).
   */
  emailRecipientIds?: number[];
  notificationType: NotificationType;
  scheduledFor?: Date;
  /** Optional prefix for one-off events (e.g. per-comment) so the same day can notify again */
  idempotencyPrefix?: string;
}): Prisma.NotificationCreateManyInput[] {
  const scheduledFor = params.scheduledFor ?? new Date();
  const uniqueRecipients = Array.from(new Set(params.recipientIds));
  const emailSet = new Set(
    params.emailRecipientIds != null
      ? params.emailRecipientIds
      : uniqueRecipients,
  );
  return uniqueRecipients.flatMap((recipientId) => {
    const dayKey = `${params.actionPointId}:${recipientId}:${params.notificationType}:${scheduledFor
      .toISOString()
      .slice(0, 10)}`;
    const key = params.idempotencyPrefix
      ? `${params.idempotencyPrefix}:${recipientId}`
      : dayKey;
    const rows: Prisma.NotificationCreateManyInput[] = [
      {
        actionPointId: params.actionPointId,
        recipientId,
        channel: "IN_APP" as const,
        notificationType: params.notificationType,
        idempotencyKey: `inapp:${key}`,
        scheduledFor,
      },
    ];
    if (emailSet.has(recipientId)) {
      rows.unshift({
        actionPointId: params.actionPointId,
        recipientId,
        channel: "EMAIL" as const,
        notificationType: params.notificationType,
        idempotencyKey: `email:${key}`,
        scheduledFor,
      });
    }
    return rows;
  });
}

export type OutboundNotification = {
  id: number;
  recipientId: number;
  notificationType: string;
  attachments?: { filename: string; contentType: string; content: string; encoding: "utf-8" | "base64" }[];
};

/**
 * Drain the outbox using Graph sendMail (see emailDispatchService).
 * Prefer calling `triggerEmailDispatchAsync()` after enqueueing notifications.
 */
export async function dispatchPendingNotifications(): Promise<{ sent: number; failed: number }> {
  const { processPendingEmailQueue } = await import("./emailDispatchService");
  const result = await processPendingEmailQueue(200);
  return { sent: result.sent, failed: result.failed };
}

export { triggerEmailDispatchAsync } from "./emailDispatchService";

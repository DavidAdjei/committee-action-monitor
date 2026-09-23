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
  recipientIds: number[];
  notificationType: NotificationType;
  scheduledFor?: Date;
  /** Optional prefix for one-off events (e.g. per-comment) so the same day can notify again */
  idempotencyPrefix?: string;
}): Prisma.NotificationCreateManyInput[] {
  const scheduledFor = params.scheduledFor ?? new Date();
  const uniqueRecipients = Array.from(new Set(params.recipientIds));
  return uniqueRecipients.flatMap((recipientId) => {
    const dayKey = `${params.actionPointId}:${recipientId}:${params.notificationType}:${scheduledFor
      .toISOString()
      .slice(0, 10)}`;
    const key = params.idempotencyPrefix
      ? `${params.idempotencyPrefix}:${recipientId}`
      : dayKey;
    // Queue both EMAIL and IN_APP so portal + mail delivery workers can pick them up
    return [
      {
        actionPointId: params.actionPointId,
        recipientId,
        channel: "EMAIL" as const,
        notificationType: params.notificationType,
        idempotencyKey: `email:${key}`,
        scheduledFor,
      },
      {
        actionPointId: params.actionPointId,
        recipientId,
        channel: "IN_APP" as const,
        notificationType: params.notificationType,
        idempotencyKey: `inapp:${key}`,
        scheduledFor,
      },
    ];
  });
}

/**
 * Actually dispatching email/Teams messages is an integration concern
 * (Microsoft Graph `sendMail`, SMTP relay, etc.) that depends on
 * Bank-approved credentials and templates — see section 7 of the system
 * documentation. This function is the single seam a delivery worker plugs
 * into; it deliberately does not import any Graph SDK so the API stays
 * deployable without those credentials configured.
 */
export type OutboundNotification = {
  id: number;
  recipientId: number;
  notificationType: string;
  /** Optional file attachments (e.g. attendance CSV on MINUTES_ISSUED). */
  attachments?: { filename: string; contentType: string; content: string; encoding: "utf-8" | "base64" }[];
};

export async function dispatchPendingNotifications(
  send: (n: OutboundNotification) => Promise<void>,
  prismaClient: Prisma.TransactionClient | typeof import("../lib/prisma").prisma,
): Promise<{ sent: number; failed: number }> {
  const pending = await prismaClient.notification.findMany({
    where: { deliveryStatus: "PENDING", scheduledFor: { lte: new Date() } },
    take: 200,
  });

  let sent = 0;
  let failed = 0;
  for (const n of pending) {
    try {
      let attachments: OutboundNotification["attachments"];
      // Minutes-issued emails attach the meeting attendance register as CSV.
      if (n.notificationType === "MINUTES_ISSUED") {
        try {
          const match = /^minutes:(\d+):/.exec(n.idempotencyKey ?? "");
          if (match) {
            const minutesId = Number(match[1]);
            const { buildMinutesIssuedMail } = await import("./minutesMailService");
            const mail = await buildMinutesIssuedMail(minutesId);
            attachments = mail.attachments;
          }
        } catch {
          attachments = undefined;
        }
      }
      await send({
        id: n.id,
        recipientId: n.recipientId,
        notificationType: n.notificationType,
        attachments,
      });
      await prismaClient.notification.update({
        where: { id: n.id },
        data: { deliveryStatus: "SENT", sentAt: new Date() },
      });
      sent += 1;
    } catch (err) {
      await prismaClient.notification.update({
        where: { id: n.id },
        data: { deliveryStatus: "FAILED", errorMessage: String(err).slice(0, 500) },
      });
      failed += 1;
    }
  }
  return { sent, failed };
}

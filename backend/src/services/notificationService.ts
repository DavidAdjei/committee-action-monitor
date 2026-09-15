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
}): Prisma.NotificationCreateManyInput[] {
  const scheduledFor = params.scheduledFor ?? new Date();
  const uniqueRecipients = Array.from(new Set(params.recipientIds));
  return uniqueRecipients.map((recipientId) => ({
    actionPointId: params.actionPointId,
    recipientId,
    channel: "EMAIL" as const,
    notificationType: params.notificationType,
    idempotencyKey: `${params.actionPointId}:${recipientId}:${params.notificationType}:${scheduledFor
      .toISOString()
      .slice(0, 10)}`,
    scheduledFor,
  }));
}

/**
 * Actually dispatching email/Teams messages is an integration concern
 * (Microsoft Graph `sendMail`, SMTP relay, etc.) that depends on
 * Bank-approved credentials and templates — see section 7 of the system
 * documentation. This function is the single seam a delivery worker plugs
 * into; it deliberately does not import any Graph SDK so the API stays
 * deployable without those credentials configured.
 */
export async function dispatchPendingNotifications(
  send: (n: { id: number; recipientId: number; notificationType: string }) => Promise<void>,
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
      await send({ id: n.id, recipientId: n.recipientId, notificationType: n.notificationType });
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

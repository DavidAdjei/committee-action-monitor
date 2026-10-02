/**
 * Outbound email delivery via Microsoft Graph sendMail (app-only).
 *
 * Requires:
 *   - Application permission Mail.Send (admin consent)
 *   - ENTRA_GRAPH_MAIL_SENDER = UPN of a licensed mailbox the app may send as
 *   - Same ENTRA_GRAPH_* app credentials as directory / Teams
 *
 * Dev fallback: when Graph is not configured and MAIL_DEV_LOG=true,
 * messages are logged and marked sent (no real delivery).
 */
import { prisma } from "../lib/prisma";
import { graphEnv, graphFetch, isGraphAppConfigured } from "../lib/graphClient";
import type { OutboundNotification } from "./notificationService";

export type MailAttachment = {
  filename: string;
  contentType: string;
  /** base64 content */
  contentBytes: string;
};

function appBaseUrl(): string {
  return (
    process.env.APP_PUBLIC_URL?.replace(/\/$/, "") ||
    process.env.CORS_ALLOWED_ORIGIN?.replace(/\/$/, "") ||
    "http://localhost:5173"
  );
}

const TYPE_SUBJECT: Record<string, string> = {
  CREATED: "New action point assigned",
  DAILY_REMINDER: "Action point reminder — due soon or outstanding",
  OVERDUE_ESCALATION: "Action point overdue — escalation",
  STATUS_CHANGE: "Action point status updated",
  EVIDENCE_SUBMITTED: "Action completion submitted for verification",
  EVIDENCE_VERIFIED: "Action completion verified",
  MINUTES_ISSUED: "Meeting minutes issued",
  MEETING_ACTIONS_REMINDER: "Reminder: raise action points for recent meeting",
  MEETING_MINUTES_REMINDER: "Reminder: upload minutes for recent meeting",
  ACTION_COMMENT: "New comment on an action point",
};

function subjectFor(type: string, reference?: string | null): string {
  const base = TYPE_SUBJECT[type] ?? `CAM notification (${type})`;
  return reference ? `[CAM] ${base}: ${reference}` : `[CAM] ${base}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function buildEmailContent(n: {
  id: number;
  recipientId: number;
  notificationType: string;
  actionPointId: number | null;
}): Promise<{
  toEmail: string;
  toName: string;
  subject: string;
  html: string;
  text: string;
}> {
  const recipient = await prisma.user.findUnique({ where: { id: n.recipientId } });
  if (!recipient?.email) {
    throw new Error(`Recipient ${n.recipientId} has no email address.`);
  }

  let action: {
    id: number;
    referenceNo: string;
    title: string;
    status: string;
    progress: number;
    deadline: Date | null;
    committee: { name: string; code: string };
    owner: { fullName: string };
  } | null = null;

  if (n.actionPointId) {
    action = await prisma.actionPoint.findUnique({
      where: { id: n.actionPointId },
      select: {
        id: true,
        referenceNo: true,
        title: true,
        status: true,
        progress: true,
        deadline: true,
        committee: { select: { name: true, code: true } },
        owner: { select: { fullName: true } },
      },
    });
  }

  const portal = appBaseUrl();
  const actionLink = action ? `${portal}/actions/${action.id}` : portal;
  const subject = subjectFor(n.notificationType, action?.referenceNo);

  const lines: string[] = [];
  lines.push(`Hello ${recipient.fullName},`);
  lines.push("");

  switch (n.notificationType) {
    case "CREATED":
      lines.push("A new action point has been assigned or linked to you.");
      break;
    case "DAILY_REMINDER":
      lines.push("This is a reminder about an outstanding action point.");
      break;
    case "OVERDUE_ESCALATION":
      lines.push("An action point is overdue and has been escalated for attention.");
      break;
    case "STATUS_CHANGE":
      lines.push("The status of an action point has changed.");
      break;
    case "EVIDENCE_SUBMITTED":
      lines.push("Completion has been submitted and is awaiting verification by the Chair or Secretary.");
      break;
    case "EVIDENCE_VERIFIED":
      lines.push("Completion evidence has been reviewed (approved or returned).");
      break;
    case "ACTION_COMMENT":
      lines.push("There is a new comment on an action point.");
      break;
    case "MEETING_ACTIONS_REMINDER":
      lines.push(
        "A recent committee meeting still has no action points recorded. Please raise or import any actions.",
      );
      break;
    case "MEETING_MINUTES_REMINDER":
      lines.push(
        "A recent committee meeting still has no minutes document. Please upload draft or final minutes.",
      );
      break;
    case "MINUTES_ISSUED":
      lines.push("Meeting minutes have been issued.");
      break;
    default:
      lines.push(`You have a new notification (${n.notificationType}).`);
  }

  if (action) {
    lines.push("");
    lines.push(`Reference: ${action.referenceNo}`);
    lines.push(`Title: ${action.title}`);
    lines.push(`Committee: ${action.committee.name} (${action.committee.code})`);
    lines.push(`Owner: ${action.owner.fullName}`);
    lines.push(`Status: ${action.status} · Progress: ${action.progress}%`);
    if (action.deadline) {
      lines.push(`Deadline: ${action.deadline.toISOString().slice(0, 10)}`);
    }
    lines.push("");
    lines.push(`Open in CAM: ${actionLink}`);
  } else {
    lines.push("");
    lines.push(`Open CAM: ${portal}`);
  }

  lines.push("");
  lines.push("— Committee Action Monitor");
  lines.push("This is an automated message. Please do not reply to this email.");

  const text = lines.join("\n");
  const html = `
<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.5">
  <p>Hello ${escapeHtml(recipient.fullName)},</p>
  <p>${escapeHtml(lines[2] || "")}</p>
  ${
    action
      ? `<table style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:4px 12px 4px 0;color:#64748b">Reference</td><td><b>${escapeHtml(action.referenceNo)}</b></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b">Title</td><td>${escapeHtml(action.title)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b">Committee</td><td>${escapeHtml(action.committee.name)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b">Owner</td><td>${escapeHtml(action.owner.fullName)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b">Status</td><td>${escapeHtml(action.status)} · ${action.progress}%</td></tr>
    ${
      action.deadline
        ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Deadline</td><td>${action.deadline.toISOString().slice(0, 10)}</td></tr>`
        : ""
    }
  </table>
  <p><a href="${escapeHtml(actionLink)}" style="color:#1d4ed8">Open action in CAM</a></p>`
      : `<p><a href="${escapeHtml(portal)}" style="color:#1d4ed8">Open CAM</a></p>`
  }
  <p style="color:#94a3b8;font-size:12px;margin-top:24px">Committee Action Monitor · Automated notification</p>
</body></html>`.trim();

  return {
    toEmail: recipient.email,
    toName: recipient.fullName,
    subject,
    html,
    text,
  };
}

export function isMailSendConfigured(): boolean {
  if (!isGraphAppConfigured()) return false;
  return Boolean(graphEnv("ENTRA_GRAPH_MAIL_SENDER", ["GRAPH_MAIL_SENDER", "MAIL_SENDER"]));
}

/**
 * Send one email via Graph as the configured sender mailbox.
 */
export async function sendGraphMail(params: {
  toEmail: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
}): Promise<void> {
  const sender = graphEnv("ENTRA_GRAPH_MAIL_SENDER", ["GRAPH_MAIL_SENDER", "MAIL_SENDER"]);
  if (!sender) {
    throw new Error(
      "ENTRA_GRAPH_MAIL_SENDER is not set (mailbox UPN the app sends as). Required for Graph sendMail.",
    );
  }

  const message: Record<string, unknown> = {
    subject: params.subject,
    body: {
      contentType: "HTML",
      content: params.html,
    },
    toRecipients: [
      {
        emailAddress: {
          address: params.toEmail,
          name: params.toName || params.toEmail,
        },
      },
    ],
  };

  if (params.attachments?.length) {
    message.attachments = params.attachments.map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.filename,
      contentType: a.contentType,
      contentBytes: a.contentBytes,
    }));
  }

  const res = await graphFetch(`/users/${encodeURIComponent(sender)}/sendMail`, {
    method: "POST",
    body: JSON.stringify({
      message,
      saveToSentItems: true,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Graph sendMail failed: ${res.status} ${t.slice(0, 400)}`);
  }
}

/**
 * Deliver a single outbox row (EMAIL channel uses Graph; IN_APP is marked delivered).
 */
export async function deliverNotification(n: {
  id: number;
  recipientId: number;
  channel: string;
  notificationType: string;
  actionPointId: number | null;
}): Promise<void> {
  if (n.channel === "IN_APP" || n.channel === "TEAMS") {
    // In-app is already visible in the portal once the row exists; mark delivered.
    return;
  }

  if (n.channel !== "EMAIL") {
    throw new Error(`Unsupported notification channel: ${n.channel}`);
  }

  const content = await buildEmailContent(n);

  if (!isMailSendConfigured()) {
    if (process.env.MAIL_DEV_LOG === "true" || process.env.DEV_AUTH_ENABLED === "true") {
      // eslint-disable-next-line no-console
      console.info(
        `[mail:dev] To=${content.toEmail} Subject=${content.subject}\n${content.text.slice(0, 500)}`,
      );
      return;
    }
    throw new Error(
      "Email is not configured. Set ENTRA_GRAPH_MAIL_SENDER and Graph app credentials (Mail.Send permission).",
    );
  }

  await sendGraphMail({
    toEmail: content.toEmail,
    toName: content.toName,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });
}

/**
 * Process pending outbox rows. Safe to call from a timer or after enqueue.
 */
export async function processPendingEmailQueue(limit = 100): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  const pending = await prisma.notification.findMany({
    where: {
      deliveryStatus: "PENDING",
      scheduledFor: { lte: new Date() },
    },
    orderBy: { scheduledFor: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const n of pending) {
    try {
      await deliverNotification({
        id: n.id,
        recipientId: n.recipientId,
        channel: n.channel,
        notificationType: n.notificationType,
        actionPointId: n.actionPointId,
      });
      await prisma.notification.update({
        where: { id: n.id },
        data: { deliveryStatus: "SENT", sentAt: new Date(), errorMessage: null },
      });
      sent += 1;
    } catch (err) {
      const msg = String(err).slice(0, 500);
      await prisma.notification.update({
        where: { id: n.id },
        data: { deliveryStatus: "FAILED", errorMessage: msg },
      });
      failed += 1;
      // eslint-disable-next-line no-console
      console.error(`[mail] notification ${n.id} failed:`, msg);
    }
  }

  if (pending.length === 0) skipped = 0;

  return { sent, failed, skipped };
}

/** Fire-and-forget queue flush (does not block the HTTP response). */
export function triggerEmailDispatchAsync(): void {
  void processPendingEmailQueue().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[mail] background dispatch error:", err);
  });
}

import { prisma } from "../lib/prisma";
import { Errors } from "../lib/http";
import { storeEvidenceFile, readEvidenceFile } from "./storageService";
import { auditRow } from "./auditService";
import { sendGraphMail, isMailSendConfigured } from "./emailDispatchService";
import { triggerEmailDispatchAsync } from "./notificationService";

export async function addMeetingPaper(params: {
  meetingId: number;
  actorUserId: number;
  filename: string;
  mediaType: string;
  buffer: Buffer;
}) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: params.meetingId },
    include: { committee: true },
  });
  if (!meeting) throw Errors.notFound("Meeting");

  const stored = await storeEvidenceFile({
    filename: params.filename,
    mediaType: params.mediaType,
    buffer: params.buffer,
  });

  const row = await prisma.meetingPaper.create({
    data: {
      meetingId: params.meetingId,
      storageKey: stored.storageKey,
      filename: params.filename,
      mediaType: params.mediaType || "application/octet-stream",
      sizeBytes: stored.sizeBytes,
      uploadedById: params.actorUserId,
    },
  });

  await prisma.auditEvent.create({
    data: auditRow({
      actorUserId: params.actorUserId,
      action: "meeting.paper_upload",
      resourceType: "meeting",
      resourceId: params.meetingId,
      committeeId: meeting.committeeId,
      after: { filename: params.filename, paperId: row.id },
      result: "SUCCESS",
    }),
  });

  return row;
}

export async function listMeetingPapers(meetingId: number) {
  return prisma.meetingPaper.findMany({
    where: { meetingId },
    orderBy: { createdAt: "asc" },
    include: { uploadedBy: { select: { id: true, fullName: true } } },
  });
}

/**
 * Email committee officers + members with meeting details and paper attachments.
 * Best-effort: failures are logged; meeting creation is not rolled back.
 */
export async function emailMeetingPapersToCommittee(meetingId: number): Promise<{
  sent: number;
  failed: number;
}> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      committee: {
        include: {
          memberships: { include: { user: true } },
          chairperson: true,
          secretary: true,
        },
      },
      papers: true,
      createdBy: true,
    },
  });
  if (!meeting) throw Errors.notFound("Meeting");

  const recipients = new Map<string, string>();
  for (const m of meeting.committee.memberships) {
    if (m.user.active && m.user.email) recipients.set(m.user.email, m.user.fullName);
  }
  if (meeting.committee.chairperson?.email) {
    recipients.set(meeting.committee.chairperson.email, meeting.committee.chairperson.fullName);
  }
  if (meeting.committee.secretary?.email) {
    recipients.set(meeting.committee.secretary.email, meeting.committee.secretary.fullName);
  }

  const attachments: { filename: string; contentType: string; contentBytes: string }[] = [];
  for (const p of meeting.papers) {
    try {
      const buf = await readEvidenceFile(p.storageKey);
      attachments.push({
        filename: p.filename,
        contentType: p.mediaType || "application/octet-stream",
        contentBytes: buf.toString("base64"),
      });
    } catch {
      // skip missing file
    }
  }

  const when = meeting.startsAt.toISOString().replace("T", " ").slice(0, 16);
  const subject = `[CAM] Meeting papers: ${meeting.reference} — ${meeting.title}`;
  const html = `
<p>You are invited to note the following committee meeting in <b>${escape(meeting.committee.name)}</b>.</p>
<table style="border-collapse:collapse">
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Reference</td><td><b>${escape(meeting.reference)}</b></td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Title</td><td>${escape(meeting.title)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b">When</td><td>${escape(when)} UTC</td></tr>
${meeting.venue ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Venue</td><td>${escape(meeting.venue)}</td></tr>` : ""}
${meeting.teamsJoinUrl ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Teams</td><td><a href="${escape(meeting.teamsJoinUrl)}">Join online meeting</a></td></tr>` : ""}
</table>
${meeting.agenda ? `<p><b>Agenda</b></p><pre style="white-space:pre-wrap;font-family:inherit">${escape(meeting.agenda)}</pre>` : ""}
${
  attachments.length
    ? `<p><b>${attachments.length}</b> meeting paper(s) attached.</p>`
    : `<p>No meeting papers were attached.</p>`
}
<p style="color:#94a3b8;font-size:12px">Committee Action Monitor · ${escape(meeting.createdBy.fullName)}</p>
`.trim();

  let sent = 0;
  let failed = 0;

  if (!isMailSendConfigured() && process.env.MAIL_DEV_LOG !== "true" && process.env.DEV_AUTH_ENABLED !== "true") {
    return { sent: 0, failed: recipients.size };
  }

  for (const [email, name] of recipients) {
    try {
      if (!isMailSendConfigured()) {
        // eslint-disable-next-line no-console
        console.info(`[mail:dev] Meeting papers to ${email} subject=${subject} attachments=${attachments.length}`);
        sent += 1;
        continue;
      }
      await sendGraphMail({
        toEmail: email,
        toName: name,
        subject,
        html,
        text: `${meeting.title} (${meeting.reference}) on ${when}`,
        attachments,
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      // eslint-disable-next-line no-console
      console.error(`[mail] meeting papers to ${email} failed`, err);
    }
  }

  triggerEmailDispatchAsync();
  return { sent, failed };
}

function escape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

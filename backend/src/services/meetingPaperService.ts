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

export async function downloadMeetingPaper(paperId: number) {
  const row = await prisma.meetingPaper.findUnique({ where: { id: paperId } });
  if (!row) throw Errors.notFound("Meeting paper");
  const buffer = await readEvidenceFile(row.storageKey);
  return {
    buffer,
    filename: row.filename || `paper-${paperId}`,
    contentType: row.mediaType || "application/octet-stream",
  };
}

/**
 * Email chair, secretary, central rep, active members (+ other stakeholders) in ONE message.
 * Includes Teams join link when present and attaches meeting papers.
 */
export async function emailMeetingPapersToCommittee(meetingId: number): Promise<{
  sent: number;
  failed: number;
  recipientCount: number;
}> {
  return emailMeetingInvitation(meetingId);
}

export async function emailMeetingInvitation(meetingId: number): Promise<{
  sent: number;
  failed: number;
  recipientCount: number;
}> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      committee: {
        include: {
          memberships: { where: { active: true }, include: { user: true } },
          chairperson: true,
          secretary: true,
          centralRep: true,
        },
      },
      papers: true,
      createdBy: true,
    },
  });
  if (!meeting) throw Errors.notFound("Meeting");

  const recipients = new Map<string, string>();
  const add = (email: string | null | undefined, name: string | null | undefined) => {
    if (!email || !email.includes("@")) return;
    const key = email.trim().toLowerCase();
    if (!recipients.has(key)) recipients.set(key, name || email);
  };

  // Prefer distribution list when set; otherwise expand to all members/officers
  const distro = (meeting.committee as { distributionEmail?: string | null }).distributionEmail;
  if (distro) {
    add(distro, meeting.committee.name);
  } else {
    add(meeting.committee.chairperson?.email, meeting.committee.chairperson?.fullName);
    add(meeting.committee.secretary?.email, meeting.committee.secretary?.fullName);
    add(meeting.committee.centralRep?.email, meeting.committee.centralRep?.fullName);
    for (const m of meeting.committee.memberships) {
      if (m.user.active) add(m.user.email, m.user.fullName);
    }
  }
  add(meeting.createdBy?.email, meeting.createdBy?.fullName);

  const toList = [...recipients.entries()].map(([email, name]) => ({ email, name }));
  if (toList.length === 0) {
    return { sent: 0, failed: 0, recipientCount: 0 };
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
  const end = meeting.endsAt
    ? meeting.endsAt.toISOString().replace("T", " ").slice(0, 16)
    : null;
  const subject = `[CAM] Meeting invitation: ${meeting.reference} — ${meeting.title}`;
  const teamsBlock = meeting.teamsJoinUrl
    ? `<p style="margin:16px 0"><a href="${escape(meeting.teamsJoinUrl)}" style="display:inline-block;background:#5b21b6;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Join Microsoft Teams meeting</a></p>
       <p style="font-size:12px;color:#64748b;word-break:break-all">${escape(meeting.teamsJoinUrl)}</p>`
    : `<p style="color:#64748b">No Teams join link is attached to this meeting.</p>`;

  const papersBlock = attachments.length
    ? `<p><b>${attachments.length}</b> meeting paper(s) attached to this email.</p>
       <ul>${attachments.map((a) => `<li>${escape(a.filename)}</li>`).join("")}</ul>`
    : `<p style="color:#64748b">No meeting papers were attached.</p>`;

  const html = `
<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.5">
  <p>You are invited to a committee meeting of <b>${escape(meeting.committee.name)}</b> (${escape(meeting.committee.code)}).</p>
  <table style="border-collapse:collapse;margin:12px 0">
    <tr><td style="padding:4px 16px 4px 0;color:#64748b">Reference</td><td><b>${escape(meeting.reference)}</b></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748b">Title</td><td>${escape(meeting.title)}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748b">When</td><td>${escape(when)} UTC${end ? ` – ${escape(end)} UTC` : ""}</td></tr>
    ${meeting.venue ? `<tr><td style="padding:4px 16px 4px 0;color:#64748b">Venue</td><td>${escape(meeting.venue)}</td></tr>` : ""}
  </table>
  ${teamsBlock}
  ${meeting.agenda ? `<p><b>Agenda</b></p><pre style="white-space:pre-wrap;font-family:inherit;background:#f8fafc;padding:12px;border-radius:8px">${escape(meeting.agenda)}</pre>` : ""}
  ${papersBlock}
  <p style="color:#94a3b8;font-size:12px;margin-top:24px">Committee Action Monitor · Scheduled by ${escape(meeting.createdBy.fullName)}</p>
</div>
`.trim();

  const text = [
    `Meeting: ${meeting.title} (${meeting.reference})`,
    `Committee: ${meeting.committee.name}`,
    `When: ${when} UTC`,
    meeting.venue ? `Venue: ${meeting.venue}` : "",
    meeting.teamsJoinUrl ? `Teams: ${meeting.teamsJoinUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (!isMailSendConfigured() && process.env.MAIL_DEV_LOG !== "true" && process.env.DEV_AUTH_ENABLED !== "true") {
    console.warn(`[mail] Meeting ${meetingId}: mail not configured; invitation not sent to ${toList.length} recipients`);
    return { sent: 0, failed: toList.length, recipientCount: toList.length };
  }

  try {
    if (!isMailSendConfigured()) {
      console.info(
        `[mail:dev] Meeting invitation to ${toList.length} recipients together: ${toList.map((r) => r.email).join(", ")} subject=${subject} attachments=${attachments.length}`,
      );
      return { sent: 1, failed: 0, recipientCount: toList.length };
    }
    await sendGraphMail({
      toRecipients: toList,
      subject,
      html,
      text,
      attachments,
    });
    console.info(`[mail] Meeting ${meetingId}: invitation sent to ${toList.length} recipients in one message`);
    triggerEmailDispatchAsync();
    return { sent: 1, failed: 0, recipientCount: toList.length };
  } catch (err) {
    console.error(`[mail] Meeting ${meetingId}: invitation failed`, err);
    return { sent: 0, failed: 1, recipientCount: toList.length };
  }
}

function escape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

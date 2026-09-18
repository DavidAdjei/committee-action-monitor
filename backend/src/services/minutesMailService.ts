import { prisma } from "../lib/prisma";
import { Errors } from "../lib/http";

export interface MailAttachment {
  filename: string;
  contentType: string;
  /** UTF-8 text or base64 depending on encoding */
  content: string;
  encoding: "utf-8" | "base64";
}

export interface MinutesIssuedMail {
  subject: string;
  htmlBody: string;
  textBody: string;
  attachments: MailAttachment[];
  recipientUserIds: number[];
  meetingId: number;
  minutesId: number;
  committeeId: number;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Build a CSV attendance register for a meeting (used as the email attachment). */
export async function buildAttendanceCsvAttachment(meetingId: number): Promise<MailAttachment> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { reference: true, title: true },
  });
  if (!meeting) throw Errors.notFound("Meeting");

  const rows = await prisma.meetingAttendance.findMany({
    where: { meetingId },
    include: { user: { select: { fullName: true, email: true, department: true } } },
    orderBy: { markedAt: "asc" },
  });

  const header = ["Full name", "Email", "Department", "Method", "Marked at", "Note"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        csvEscape(r.user.fullName),
        csvEscape(r.user.email),
        csvEscape(r.user.department ?? ""),
        csvEscape(r.method),
        csvEscape(r.markedAt.toISOString()),
        csvEscape(r.note ?? ""),
      ].join(","),
    ),
  ];

  const safeRef = meeting.reference.replace(/[^a-zA-Z0-9_-]+/g, "_");
  return {
    filename: `attendance-${safeRef}.csv`,
    contentType: "text/csv; charset=utf-8",
    content: lines.join("\r\n") + "\r\n",
    encoding: "utf-8",
  };
}

/**
 * Compose the minutes-issued email: body + attendance CSV attachment.
 * A Graph / SMTP worker should call this (or use the payload returned from issue)
 * and pass `attachments` into sendMail.
 */
export async function buildMinutesIssuedMail(minutesId: number): Promise<MinutesIssuedMail> {
  const minutes = await prisma.meetingMinutes.findUnique({
    where: { id: minutesId },
    include: {
      meeting: { include: { committee: true } },
      snapshots: {
        include: {
          actionPoint: { include: { owner: true } },
        },
      },
      createdBy: true,
    },
  });
  if (!minutes) throw Errors.notFound("Minutes");

  const committee = minutes.meeting.committee;
  const attendanceAttachment = await buildAttendanceCsvAttachment(minutes.meetingId);

  const attendanceRows = await prisma.meetingAttendance.findMany({
    where: { meetingId: minutes.meetingId },
    include: { user: true },
    orderBy: { markedAt: "asc" },
  });

  const actionLines = minutes.snapshots
    .map(
      (s) =>
        `• ${s.actionPoint.referenceNo} — ${s.actionPoint.title} (Owner: ${s.actionPoint.owner.fullName}, ${s.progressPercent}%, ${s.actionStatus})`,
    )
    .join("\n");

  const attendanceNames = attendanceRows.map((a) => a.user.fullName).join(", ");

  const subject = `Minutes issued: ${minutes.meeting.reference} — ${minutes.meeting.title}`;

  const textBody = [
    `Minutes have been issued for ${minutes.meeting.title} (${minutes.meeting.reference}).`,
    `Committee: ${committee.name}`,
    "",
    "1. Attendance",
    attendanceRows.length
      ? `See attached file: ${attendanceAttachment.filename}`
      : "No attendance was recorded for this meeting.",
    attendanceNames ? `Present: ${attendanceNames}` : "",
    "",
    "2. Discussion, decisions & resolutions",
    minutes.discussion ?? "—",
    "",
    "3. Action points",
    actionLines || "—",
    "",
    "The attendance register is attached as a CSV file.",
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  const htmlBody = `
    <div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.5">
      <h2 style="margin:0 0 4px 0">${escapeHtml(minutes.meeting.title)}</h2>
      <p style="margin:0 0 16px 0;color:#64748b">
        ${escapeHtml(minutes.meeting.reference)} · ${escapeHtml(committee.name)}
      </p>
      <h3 style="margin:16px 0 8px 0">1. Attendance</h3>
      <p style="margin:0 0 8px 0">
        ${
          attendanceRows.length
            ? `The attendance register is <strong>attached</strong> as <code>${escapeHtml(attendanceAttachment.filename)}</code>.`
            : "No attendance was recorded for this meeting."
        }
      </p>
      ${
        attendanceRows.length
          ? `<p style="margin:0 0 12px 0;color:#475569">${escapeHtml(attendanceNames)}</p>`
          : ""
      }
      <h3 style="margin:16px 0 8px 0">2. Discussion, decisions &amp; resolutions</h3>
      <pre style="white-space:pre-wrap;font-family:inherit;margin:0 0 12px 0">${escapeHtml(minutes.discussion ?? "—")}</pre>
      <h3 style="margin:16px 0 8px 0">3. Action points</h3>
      <ul style="margin:0;padding-left:18px">
        ${
          minutes.snapshots.length
            ? minutes.snapshots
                .map(
                  (s) =>
                    `<li><strong>${escapeHtml(s.actionPoint.referenceNo)}</strong> — ${escapeHtml(s.actionPoint.title)}
                    <span style="color:#64748b">(${escapeHtml(s.actionPoint.owner.fullName)}, ${s.progressPercent}%, ${escapeHtml(s.actionStatus)})</span></li>`,
                )
                .join("")
            : "<li>—</li>"
        }
      </ul>
      <p style="margin-top:20px;font-size:12px;color:#94a3b8">
        Sent by the Committee Action Monitor. Attendance is provided as a CSV attachment.
      </p>
    </div>
  `.trim();

  const recipientUserIds = Array.from(
    new Set<number>([
      committee.chairpersonId,
      committee.secretaryId,
      ...(committee.centralRepId ? [committee.centralRepId] : []),
      ...minutes.snapshots.map((s) => s.actionPoint.ownerId),
      ...attendanceRows.map((a) => a.userId),
    ]),
  );

  return {
    subject,
    htmlBody,
    textBody,
    attachments: [attendanceAttachment],
    recipientUserIds,
    meetingId: minutes.meetingId,
    minutesId: minutes.id,
    committeeId: committee.id,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Microsoft Graph sendMail shape helper — maps our attachment to Graph fileAttachment.
 * The delivery worker should POST this under message.attachments.
 */
export function toGraphFileAttachment(att: MailAttachment): {
  "@odata.type": string;
  name: string;
  contentType: string;
  contentBytes: string;
} {
  const contentBytes =
    att.encoding === "base64"
      ? att.content
      : Buffer.from(att.content, "utf-8").toString("base64");
  return {
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: att.filename,
    contentType: att.contentType.split(";")[0],
    contentBytes,
  };
}

/**
 * Builds a UMB-style Minutes of Meeting Word document (.docx)
 * aligned with the bank template (Meeting details, Attendance,
 * Opening, Agenda, Action tracker, Sign-off, Document control).
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  VerticalAlign,
} from "docx";
import { prisma } from "../lib/prisma";
import { Errors } from "../lib/http";

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };

function cell(text: string, opts?: { bold?: boolean; width?: number; shading?: string }) {
  return new TableCell({
    borders: BORDERS,
    width: { size: opts?.width ?? 2400, type: WidthType.DXA },
    shading: opts?.shading ? { fill: opts.shading } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        children: [new TextRun({ text: text || " ", bold: opts?.bold, size: 18, font: "Calibri" })],
      }),
    ],
  });
}

function p(text: string, opts?: { bold?: boolean; center?: boolean; size?: number; spacingAfter?: number }) {
  return new Paragraph({
    alignment: opts?.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { after: opts?.spacingAfter ?? 120 },
    children: [
      new TextRun({
        text,
        bold: opts?.bold,
        size: opts?.size ?? 20,
        font: "Calibri",
      }),
    ],
  });
}

function heading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 22, font: "Calibri" })],
  });
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export async function buildMinutesDocx(minutesId: number): Promise<{
  buffer: Buffer;
  filename: string;
  contentType: string;
}> {
  const minutes = await prisma.meetingMinutes.findUnique({
    where: { id: minutesId },
    include: {
      meeting: {
        include: {
          committee: {
            include: { chairperson: true, secretary: true },
          },
          attendance: {
            include: { user: { select: { fullName: true, email: true, department: true } } },
            orderBy: { markedAt: "asc" },
          },
        },
      },
      createdBy: true,
      snapshots: {
        include: {
          actionPoint: {
            include: {
              owner: true,
              stakeholders: {
                where: { stakeholderType: "ACTION_OWNER" },
                include: { user: true },
              },
            },
          },
        },
      },
    },
  });
  if (!minutes) throw Errors.notFound("Minutes");

  const meeting = minutes.meeting;
  const committee = meeting.committee;
  const attendance = meeting.attendance ?? [];

  const detailsTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          cell("Item", { bold: true, width: 2800, shading: "E8E8E8" }),
          cell("Details", { bold: true, width: 6560, shading: "E8E8E8" }),
        ],
      }),
      new TableRow({
        children: [
          cell("Meeting Title", { bold: true, width: 2800 }),
          cell(meeting.title, { width: 6560 }),
        ],
      }),
      new TableRow({
        children: [
          cell("Meeting Type", { bold: true, width: 2800 }),
          cell(committee.name, { width: 6560 }),
        ],
      }),
      new TableRow({
        children: [
          cell("Date", { bold: true, width: 2800 }),
          cell(fmtDate(meeting.startsAt), { width: 6560 }),
        ],
      }),
      new TableRow({
        children: [
          cell("Start / End", { bold: true, width: 2800 }),
          cell(
            `Start: ${fmtTime(meeting.startsAt)}${
              meeting.endsAt ? `   End: ${fmtTime(meeting.endsAt)}` : ""
            }`,
            { width: 6560 },
          ),
        ],
      }),
      new TableRow({
        children: [
          cell("Venue", { bold: true, width: 2800 }),
          cell(meeting.venue || "—", { width: 6560 }),
        ],
      }),
      new TableRow({
        children: [
          cell("Chairperson", { bold: true, width: 2800 }),
          cell(committee.chairperson.fullName, { width: 6560 }),
        ],
      }),
      new TableRow({
        children: [
          cell("Secretary", { bold: true, width: 2800 }),
          cell(committee.secretary.fullName, { width: 6560 }),
        ],
      }),
      new TableRow({
        children: [
          cell("Reference", { bold: true, width: 2800 }),
          cell(meeting.reference, { width: 6560 }),
        ],
      }),
    ],
  });

  const attendanceRows = [
    new TableRow({
      children: [
        cell("NAME", { bold: true, width: 4680, shading: "E8E8E8" }),
        cell("ROLES / METHOD", { bold: true, width: 4680, shading: "E8E8E8" }),
      ],
    }),
    ...attendance.map(
      (a) =>
        new TableRow({
          children: [
            cell(a.user.fullName, { width: 4680 }),
            cell(
              [a.user.department, a.method, a.note].filter(Boolean).join(" · ") || a.method,
              { width: 4680 },
            ),
          ],
        }),
    ),
  ];
  if (attendance.length === 0) {
    attendanceRows.push(
      new TableRow({
        children: [
          cell("No attendance recorded in the system.", { width: 4680 }),
          cell("", { width: 4680 }),
        ],
      }),
    );
  }
  const attendanceTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    rows: attendanceRows,
  });

  const actionHeader = new TableRow({
    children: [
      cell("No.", { bold: true, width: 600, shading: "E8E8E8" }),
      cell("Decision / Action", { bold: true, width: 4200, shading: "E8E8E8" }),
      cell("Owner", { bold: true, width: 2200, shading: "E8E8E8" }),
      cell("Due Date", { bold: true, width: 1200, shading: "E8E8E8" }),
      cell("Status", { bold: true, width: 1160, shading: "E8E8E8" }),
    ],
  });

  const actionRows = minutes.snapshots.map((s, i) => {
    const ap = s.actionPoint;
    const owners =
      ap.stakeholders?.length > 0
        ? ap.stakeholders.map((st) => st.user.fullName).join(" / ")
        : ap.owner.fullName;
    return new TableRow({
      children: [
        cell(String(i + 1), { width: 600 }),
        cell(ap.title, { width: 4200 }),
        cell(owners, { width: 2200 }),
        cell(fmtDate(ap.revisedDeadline ?? ap.deadline), { width: 1200 }),
        cell(String(s.actionStatus).replace(/_/g, " "), { width: 1160 }),
      ],
    });
  });

  const actionTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    rows: [actionHeader, ...(actionRows.length ? actionRows : [
      new TableRow({
        children: [
          cell("—", { width: 600 }),
          cell("No action points linked.", { width: 4200 }),
          cell("", { width: 2200 }),
          cell("", { width: 1200 }),
          cell("", { width: 1160 }),
        ],
      }),
    ])],
  });

  const discussionParas = (minutes.discussion || "")
    .split(/\n+/)
    .filter((l) => l.trim())
    .map((line) => p(line.trim(), { size: 18 }));

  const signOffTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          cell("Role", { bold: true, width: 2340, shading: "E8E8E8" }),
          cell("Name", { bold: true, width: 2340, shading: "E8E8E8" }),
          cell("Signature", { bold: true, width: 2340, shading: "E8E8E8" }),
          cell("Date", { bold: true, width: 2340, shading: "E8E8E8" }),
        ],
      }),
      new TableRow({
        children: [
          cell("Secretary", { width: 2340 }),
          cell(committee.secretary.fullName, { width: 2340 }),
          cell("", { width: 2340 }),
          cell(fmtDate(minutes.issuedAt ?? minutes.createdAt), { width: 2340 }),
        ],
      }),
      new TableRow({
        children: [
          cell("Chairperson", { width: 2340 }),
          cell(committee.chairperson.fullName, { width: 2340 }),
          cell("", { width: 2340 }),
          cell("", { width: 2340 }),
        ],
      }),
    ],
  });

  const docControl = new Table({
    width: { size: 9360, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          cell("Item", { bold: true, width: 2800, shading: "E8E8E8" }),
          cell("Details", { bold: true, width: 6560, shading: "E8E8E8" }),
        ],
      }),
      new TableRow({
        children: [
          cell("Prepared By", { bold: true, width: 2800 }),
          cell(minutes.createdBy.fullName, { width: 6560 }),
        ],
      }),
      new TableRow({
        children: [
          cell("Reviewed By", { bold: true, width: 2800 }),
          cell(committee.chairperson.fullName, { width: 6560 }),
        ],
      }),
      new TableRow({
        children: [
          cell("Status", { bold: true, width: 2800 }),
          cell(minutes.status, { width: 6560 }),
        ],
      }),
      new TableRow({
        children: [
          cell("Circulation", { bold: true, width: 2800 }),
          cell(committee.name, { width: 6560 }),
        ],
      }),
      new TableRow({
        children: [
          cell("Classification", { bold: true, width: 2800 }),
          cell("Restricted", { width: 6560 }),
        ],
      }),
    ],
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: [
          p("UNIVERSAL MERCHANT BANK PLC", { bold: true, center: true, size: 28 }),
          p("MINUTES OF MEETING", { bold: true, center: true, size: 26, spacingAfter: 240 }),

          heading("1. MEETING DETAILS"),
          detailsTable,
          new Paragraph({ spacing: { after: 200 }, children: [] }),

          heading("2. ATTENDANCE"),
          attendanceTable,
          new Paragraph({ spacing: { after: 80 }, children: [] }),
          p("2.1 Apologies", { bold: true }),
          p("Recorded offline / not captured in system unless noted in discussion.", { size: 18 }),
          p("2.2 Quorum", { bold: true }),
          p("☐ Confirmed          ☐ Not Confirmed", { size: 18 }),

          heading("3. OPENING"),
          p(
            `The Chairperson called the meeting to order at ${fmtTime(meeting.startsAt)} and welcomed members.`,
            { size: 18 },
          ),

          heading("4. AGENDA FOR THE MEETING"),
          ...(meeting.agenda
            ? meeting.agenda.split(/\n+/).filter(Boolean).map((l) => p(l, { size: 18 }))
            : [p("As circulated.", { size: 18 })]),

          heading("5. DISCUSSION / AGENDA ITEMS"),
          ...(discussionParas.length ? discussionParas : [p("No discussion text recorded.", { size: 18 })]),

          heading("6. ANY OTHER BUSINESS (AOB)"),
          p("As recorded in discussion, if any.", { size: 18 }),

          heading("7. SUMMARY OF DECISIONS & ACTION TRACKER"),
          p("This section is critical for accountability and audit trail.", {
            size: 18,
            spacingAfter: 80,
          }),
          actionTable,
          new Paragraph({ spacing: { after: 200 }, children: [] }),

          heading("8. DATE OF NEXT MEETING"),
          p("To be confirmed by the Secretary.", { size: 18 }),

          heading("SIGN-OFF"),
          signOffTable,
          new Paragraph({ spacing: { after: 200 }, children: [] }),

          heading("DOCUMENT CONTROL"),
          docControl,
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const safeRef = meeting.reference.replace(/[^\w.-]+/g, "_");
  const filename = `Minutes_${safeRef}_${minutes.id}.docx`;

  return {
    buffer: Buffer.from(buffer),
    filename,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}

/** Base64 payload for Graph/mail attachments */
export async function buildMinutesDocxAttachment(minutesId: number) {
  const doc = await buildMinutesDocx(minutesId);
  return {
    filename: doc.filename,
    contentType: doc.contentType,
    contentBase64: doc.buffer.toString("base64"),
    content: doc.buffer.toString("base64"),
    encoding: "base64" as const,
  };
}

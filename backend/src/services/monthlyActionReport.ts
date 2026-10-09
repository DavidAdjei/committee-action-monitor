import { prisma } from "../lib/prisma";
import { ActionStatus } from "@prisma/client";

export type MonthlyActionRow = {
  referenceNo: string;
  title: string;
  committee: string;
  committeeCode: string;
  owner: string;
  status: string;
  priority: string;
  progress: number;
  deadline: string;
  dateRaised: string;
  revisedDeadline: string;
};

export type MonthlyActionReport = {
  year: number;
  month: number;
  monthLabel: string;
  periodStart: string;
  periodEnd: string;
  total: number;
  completed: number;
  open: number;
  inProgress: number;
  overdue: number;
  completionRate: number;
  avgProgress: number;
  byCommittee: {
    committeeId: number;
    name: string;
    code: string;
    total: number;
    completed: number;
    completionRate: number;
  }[];
  byStatus: { status: string; count: number }[];
  rows: MonthlyActionRow[];
};

const COMPLETED: ActionStatus[] = ["COMPLETED"];

export async function buildMonthlyActionReport(
  year: number,
  month: number,
): Promise<MonthlyActionReport> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Invalid year");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Invalid month");
  }

  const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const actions = await prisma.actionPoint.findMany({
    where: {
      dateRaised: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
    include: {
      owner: { select: { fullName: true } },
      committee: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ committeeId: "asc" }, { referenceNo: "asc" }],
    take: 10000,
  });

  const total = actions.length;
  const completed = actions.filter((a) => COMPLETED.includes(a.status)).length;
  const open = actions.filter((a) => a.status === "OPEN").length;
  const inProgress = actions.filter((a) => a.status === "IN_PROGRESS").length;
  const now = new Date();
  const overdue = actions.filter(
    (a) =>
      !COMPLETED.includes(a.status) &&
      (a.revisedDeadline ?? a.deadline) < now,
  ).length;
  const completionRate = total === 0 ? 0 : Math.round((completed / total) * 1000) / 10;
  const avgProgress =
    total === 0 ? 0 : Math.round((actions.reduce((s, a) => s + a.progress, 0) / total) * 10) / 10;

  const committeeMap = new Map<
    number,
    { committeeId: number; name: string; code: string; total: number; completed: number }
  >();
  for (const a of actions) {
    const cur = committeeMap.get(a.committeeId) ?? {
      committeeId: a.committeeId,
      name: a.committee.name,
      code: a.committee.code,
      total: 0,
      completed: 0,
    };
    cur.total += 1;
    if (COMPLETED.includes(a.status)) cur.completed += 1;
    committeeMap.set(a.committeeId, cur);
  }
  const byCommittee = [...committeeMap.values()]
    .map((c) => ({
      ...c,
      completionRate: c.total === 0 ? 0 : Math.round((c.completed / c.total) * 1000) / 10,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const statusCounts = new Map<string, number>();
  for (const a of actions) {
    statusCounts.set(a.status, (statusCounts.get(a.status) ?? 0) + 1);
  }
  const byStatus = [...statusCounts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  const monthLabel = periodStart.toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const rows: MonthlyActionRow[] = actions.map((a) => ({
    referenceNo: a.referenceNo,
    title: a.title,
    committee: a.committee.name,
    committeeCode: a.committee.code,
    owner: a.owner.fullName,
    status: a.status,
    priority: a.priority,
    progress: a.progress,
    deadline: a.deadline.toISOString().slice(0, 10),
    dateRaised: a.dateRaised.toISOString().slice(0, 10),
    revisedDeadline: a.revisedDeadline ? a.revisedDeadline.toISOString().slice(0, 10) : "",
  }));

  return {
    year,
    month,
    monthLabel,
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
    total,
    completed,
    open,
    inProgress,
    overdue,
    completionRate,
    avgProgress,
    byCommittee,
    byStatus,
    rows,
  };
}

export function reportToCsv(report: MonthlyActionReport): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines: string[] = [];
  lines.push(`Monthly Action Points Report,${esc(report.monthLabel)}`);
  lines.push(`Period,${report.periodStart},${report.periodEnd}`);
  lines.push(`Total,${report.total}`);
  lines.push(`Completed,${report.completed}`);
  lines.push(`Completion rate %,${report.completionRate}`);
  lines.push(`Average progress %,${report.avgProgress}`);
  lines.push(`Open,${report.open}`);
  lines.push(`In progress,${report.inProgress}`);
  lines.push(`Overdue,${report.overdue}`);
  lines.push("");
  lines.push("Committee,Code,Total,Completed,Completion rate %");
  for (const c of report.byCommittee) {
    lines.push(
      [c.name, c.code, c.total, c.completed, c.completionRate].map(esc).join(","),
    );
  }
  lines.push("");
  lines.push(
    "Reference,Title,Committee,Code,Owner,Status,Priority,Progress %,Deadline,Date raised,Revised deadline",
  );
  for (const r of report.rows) {
    lines.push(
      [
        r.referenceNo,
        r.title,
        r.committee,
        r.committeeCode,
        r.owner,
        r.status,
        r.priority,
        r.progress,
        r.deadline,
        r.dateRaised,
        r.revisedDeadline,
      ]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

/** Excel-compatible SpreadsheetML (.xls). */
export function reportToSpreadsheetMl(report: MonthlyActionReport): string {
  const cell = (v: string | number) => {
    const s = String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const type = typeof v === "number" ? "Number" : "String";
    return `<Cell><Data ss:Type="${type}">${s}</Data></Cell>`;
  };
  const row = (cells: (string | number)[]) =>
    `<Row>${cells.map(cell).join("")}</Row>`;

  const summaryRows = [
    row(["Monthly Action Points Report", report.monthLabel]),
    row(["Period", report.periodStart, "to", report.periodEnd]),
    row(["Total actions", report.total]),
    row(["Completed", report.completed]),
    row(["Completion rate (%)", report.completionRate]),
    row(["Average progress (%)", report.avgProgress]),
    row(["Open", report.open]),
    row(["In progress", report.inProgress]),
    row(["Overdue", report.overdue]),
    row([]),
    row(["Committee", "Code", "Total", "Completed", "Completion rate (%)"]),
    ...report.byCommittee.map((c) =>
      row([c.name, c.code, c.total, c.completed, c.completionRate]),
    ),
    row([]),
    row([
      "Reference",
      "Title",
      "Committee",
      "Code",
      "Owner",
      "Status",
      "Priority",
      "Progress %",
      "Deadline",
      "Date raised",
      "Revised deadline",
    ]),
    ...report.rows.map((r) =>
      row([
        r.referenceNo,
        r.title,
        r.committee,
        r.committeeCode,
        r.owner,
        r.status,
        r.priority,
        r.progress,
        r.deadline,
        r.dateRaised,
        r.revisedDeadline,
      ]),
    ),
  ];

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Monthly report">
  <Table>
${summaryRows.join("\n")}
  </Table>
 </Worksheet>
</Workbook>
`;
}

/**
 * Branded multi-page PDF (no external deps).
 * Header, KPI cards, status/completion bars, committee bars, action table.
 */
export function reportToPdf(report: MonthlyActionReport): Buffer {
  return buildBrandedPdf(report);
}

function pdfSafe(s: string): string {
  return String(s ?? "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

type Rgb = [number, number, number];

function rgbOp(c: Rgb, fill: boolean): string {
  const [r, g, b] = c;
  return fill ? `${r} ${g} ${b} rg` : `${r} ${g} ${b} RG`;
}

function rect(x: number, y: number, w: number, h: number, fill: Rgb, stroke?: Rgb): string[] {
  const ops = [rgbOp(fill, true), `${x} ${y} ${w} ${h} re`, "f"];
  if (stroke) {
    ops.push(rgbOp(stroke, false), "0.5 w", `${x} ${y} ${w} ${h} re`, "S");
  }
  return ops;
}

function textAt(
  x: number,
  y: number,
  text: string,
  size: number,
  color: Rgb = [0.1, 0.12, 0.18],
  font = "F1",
): string[] {
  return [
    "BT",
    rgbOp(color, true),
    `/${font} ${size} Tf`,
    `${x} ${y} Td`,
    `(${pdfSafe(text)}) Tj`,
    "ET",
  ];
}

function hBar(
  x: number,
  y: number,
  maxW: number,
  h: number,
  pct: number,
  fill: Rgb,
  track: Rgb = [0.9, 0.92, 0.95],
): string[] {
  const w = (Math.max(0, Math.min(100, pct)) / 100) * maxW;
  const ops = [...rect(x, y, maxW, h, track)];
  if (w > 0) ops.push(...rect(x, y, w, h, fill));
  return ops;
}

function buildBrandedPdf(report: MonthlyActionReport): Buffer {
  const brand: Rgb = [0.05, 0.35, 0.65];
  const brandLight: Rgb = [0.75, 0.85, 0.95];
  const emerald: Rgb = [0.02, 0.55, 0.35];
  const amber: Rgb = [0.85, 0.5, 0.05];
  const rose: Rgb = [0.75, 0.15, 0.2];
  const slate: Rgb = [0.4, 0.45, 0.52];
  const ink: Rgb = [0.1, 0.12, 0.18];
  const white: Rgb = [1, 1, 1];
  const rowAlt: Rgb = [0.96, 0.97, 0.98];
  const trackGrey: Rgb = [0.9, 0.92, 0.95];

  const pageW = 612;
  const pageH = 792;
  const margin = 40;
  const contentW = pageW - margin * 2;

  const pages: string[][] = [];
  const p1: string[] = [];

  p1.push(...rect(0, pageH - 72, pageW, 72, brand));
  p1.push(...textAt(margin, pageH - 32, "Committee Action Monitor", 11, white, "F1"));
  p1.push(...textAt(margin, pageH - 52, "Monthly Action Points Report", 18, white, "F2"));
  p1.push(...textAt(pageW - margin - 100, pageH - 40, report.monthLabel, 12, white, "F2"));

  let y = pageH - 96;
  p1.push(
    ...textAt(
      margin,
      y,
      `Period ${report.periodStart}  to  ${report.periodEnd}   |   Central Committee oversight`,
      9,
      slate,
    ),
  );

  y = pageH - 200;
  const cardW = (contentW - 18) / 4;
  const cardH = 78;
  const kpis: { label: string; value: string; sub: string; accent: Rgb }[] = [
    { label: "CREATED", value: String(report.total), sub: "actions this month", accent: brand },
    {
      label: "COMPLETED",
      value: String(report.completed),
      sub: `${report.completionRate}% rate`,
      accent: emerald,
    },
    {
      label: "OVERDUE",
      value: String(report.overdue),
      sub: "past deadline",
      accent: report.overdue > 0 ? rose : emerald,
    },
    {
      label: "AVG PROGRESS",
      value: `${report.avgProgress}%`,
      sub: "mean progress",
      accent: amber,
    },
  ];
  kpis.forEach((k, i) => {
    const x = margin + i * (cardW + 6);
    p1.push(...rect(x, y, cardW, cardH, white, [0.88, 0.9, 0.93]));
    p1.push(...rect(x, y + cardH - 4, cardW, 4, k.accent));
    p1.push(...textAt(x + 10, y + cardH - 22, k.label, 7, slate, "F1"));
    p1.push(...textAt(x + 10, y + 28, k.value, 22, ink, "F2"));
    p1.push(...textAt(x + 10, y + 12, k.sub, 8, slate, "F1"));
  });

  y = y - 36;
  p1.push(...textAt(margin, y, "Status mix", 11, ink, "F2"));
  y -= 18;
  const barMax = Math.max(report.total, 1);
  const barH = 14;
  const barY = y - 4;
  p1.push(...rect(margin, barY, contentW, barH, trackGrey));
  let segX = margin;
  for (const s of [
    { n: report.open, c: brand },
    { n: report.inProgress, c: amber },
    { n: report.completed, c: emerald },
  ] as { n: number; c: Rgb }[]) {
    const w = (s.n / barMax) * contentW;
    if (w > 0.5) {
      p1.push(...rect(segX, barY, w, barH, s.c));
      segX += w;
    }
  }
  y = barY - 16;
  let legendX = margin;
  for (const s of [
    { label: "Open", count: report.open, color: brand },
    { label: "In progress", count: report.inProgress, color: amber },
    { label: "Completed", count: report.completed, color: emerald },
    { label: "Overdue", count: report.overdue, color: rose },
  ] as { label: string; count: number; color: Rgb }[]) {
    p1.push(...rect(legendX, y - 1, 8, 8, s.color));
    p1.push(...textAt(legendX + 12, y, `${s.label}: ${s.count}`, 8, slate));
    legendX += 100;
  }
  y -= 14;
  p1.push(
    ...textAt(
      margin,
      y,
      "Overdue counts non-completed items past deadline (can overlap Open / In progress).",
      7,
      slate,
    ),
  );

  y -= 28;
  p1.push(...textAt(margin, y, "Overall completion rate", 11, ink, "F2"));
  y -= 8;
  p1.push(...hBar(margin, y - 12, contentW - 50, 12, report.completionRate, emerald));
  p1.push(...textAt(margin + contentW - 42, y - 10, `${report.completionRate}%`, 10, emerald, "F2"));

  y -= 36;
  p1.push(...textAt(margin, y, "By committee", 11, ink, "F2"));
  y -= 6;
  const committees = report.byCommittee.slice(0, 12);
  if (committees.length === 0) {
    y -= 14;
    p1.push(...textAt(margin, y, "No actions created in this period.", 9, slate));
  } else {
    const maxTotal = Math.max(...committees.map((c) => c.total), 1);
    for (const c of committees) {
      y -= 22;
      if (y < 80) break;
      const label = `${c.code}  ${c.name}`.slice(0, 42);
      p1.push(...textAt(margin, y + 6, label, 8, ink));
      p1.push(
        ...textAt(
          margin + contentW - 70,
          y + 6,
          `${c.completed}/${c.total}  ${c.completionRate}%`,
          8,
          slate,
        ),
      );
      const fullTrack = contentW * 0.55;
      p1.push(...rect(margin, y - 6, fullTrack, 6, trackGrey));
      const volW = fullTrack * (c.total / maxTotal);
      if (volW > 0.5) {
        p1.push(...rect(margin, y - 6, volW, 6, brandLight));
        const fillW = volW * (Math.max(0, Math.min(100, c.completionRate)) / 100);
        if (fillW > 0.5) p1.push(...rect(margin, y - 6, fillW, 6, emerald));
      }
    }
    if (report.byCommittee.length > committees.length) {
      y -= 16;
      p1.push(
        ...textAt(
          margin,
          y,
          `+ ${report.byCommittee.length - committees.length} more committees (see Excel/CSV for full list)`,
          8,
          slate,
        ),
      );
    }
  }

  p1.push(...rect(0, 0, pageW, 36, [0.96, 0.97, 0.98]));
  p1.push(
    ...textAt(margin, 14, "Committee Action Monitor  |  Confidential  |  Page 1", 8, slate),
  );
  pages.push(p1);

  const colX = {
    ref: margin,
    title: margin + 78,
    committee: margin + 250,
    owner: margin + 330,
    status: margin + 430,
    prog: margin + 490,
    due: margin + 530,
  };
  const rowH = 16;
  const headerH = 20;
  const tableTop = pageH - 100;
  const tableBottom = 50;

  const drawTableHeader = (ops: string[], topY: number) => {
    ops.push(...rect(margin, topY - 4, contentW, headerH, brand));
    const hy = topY + 2;
    ops.push(...textAt(colX.ref, hy, "Reference", 8, white, "F2"));
    ops.push(...textAt(colX.title, hy, "Title", 8, white, "F2"));
    ops.push(...textAt(colX.committee, hy, "Committee", 8, white, "F2"));
    ops.push(...textAt(colX.owner, hy, "Owner", 8, white, "F2"));
    ops.push(...textAt(colX.status, hy, "Status", 8, white, "F2"));
    ops.push(...textAt(colX.prog, hy, "%", 8, white, "F2"));
    ops.push(...textAt(colX.due, hy, "Deadline", 8, white, "F2"));
  };

  const statusColor = (s: string): Rgb => {
    const u = s.toUpperCase();
    if (u === "COMPLETED") return emerald;
    if (u === "IN_PROGRESS") return amber;
    if (u === "OPEN") return brand;
    return slate;
  };

  if (report.rows.length === 0) {
    const pEmpty: string[] = [];
    pEmpty.push(...rect(0, pageH - 56, pageW, 56, brand));
    pEmpty.push(...textAt(margin, pageH - 36, "Action points detail", 14, white, "F2"));
    pEmpty.push(
      ...textAt(margin, pageH - 90, "No action points were created in this period.", 10, slate),
    );
    pEmpty.push(...rect(0, 0, pageW, 36, [0.96, 0.97, 0.98]));
    pEmpty.push(...textAt(margin, 14, "Committee Action Monitor  |  Page 2", 8, slate));
    pages.push(pEmpty);
  } else {
    let rowIndex = 0;
    let pageNum = 2;
    while (rowIndex < report.rows.length) {
      const ops: string[] = [];
      ops.push(...rect(0, pageH - 56, pageW, 56, brand));
      ops.push(...textAt(margin, pageH - 28, "Action points detail", 14, white, "F2"));
      ops.push(
        ...textAt(
          margin,
          pageH - 44,
          `${report.monthLabel}  |  ${report.rows.length} action(s)`,
          9,
          brandLight,
        ),
      );

      let ty = tableTop;
      drawTableHeader(ops, ty);
      ty -= headerH + 4;

      while (rowIndex < report.rows.length && ty >= tableBottom) {
        const r = report.rows[rowIndex];
        if (rowIndex % 2 === 1) {
          ops.push(...rect(margin, ty - 4, contentW, rowH, rowAlt));
        }
        const sc = statusColor(r.status);
        ops.push(...rect(colX.status - 2, ty - 2, 52, 12, sc));
        ops.push(...textAt(colX.ref, ty, r.referenceNo.slice(0, 12), 7, ink));
        ops.push(...textAt(colX.title, ty, r.title.slice(0, 28), 7, ink));
        ops.push(...textAt(colX.committee, ty, r.committeeCode.slice(0, 10), 7, slate));
        ops.push(...textAt(colX.owner, ty, r.owner.slice(0, 16), 7, slate));
        ops.push(
          ...textAt(colX.status, ty, r.status.replace(/_/g, " ").slice(0, 10), 6, white),
        );
        ops.push(...textAt(colX.prog, ty, String(r.progress), 7, ink));
        ops.push(...textAt(colX.due, ty, r.deadline.slice(0, 10), 7, slate));
        ty -= rowH;
        rowIndex += 1;
      }

      ops.push(...rect(0, 0, pageW, 36, [0.96, 0.97, 0.98]));
      ops.push(
        ...textAt(
          margin,
          14,
          `Committee Action Monitor  |  Confidential  |  Page ${pageNum}`,
          8,
          slate,
        ),
      );
      pages.push(ops);
      pageNum += 1;
    }
  }

  return assemblePdf(pages);
}

function assemblePdf(pageOps: string[][]): Buffer {
  const catalogId = 1;
  const pagesId = 2;
  const fontReg = 3;
  const fontBold = 4;
  let nextId = 5;

  const pagePairs: { pageId: number; contentId: number; stream: string }[] = [];
  for (const ops of pageOps) {
    const pageId = nextId++;
    const contentId = nextId++;
    pagePairs.push({ pageId, contentId, stream: ops.join("\n") });
  }

  let pdf = "%PDF-1.4\n";
  const offs: number[] = [0];
  const emit = (s: string) => {
    offs.push(Buffer.byteLength(pdf, "latin1"));
    pdf += s;
  };

  emit(`${catalogId} 0 obj<< /Type /Catalog /Pages ${pagesId} 0 R >>endobj\n`);
  const kids = pagePairs.map((p) => `${p.pageId} 0 R`).join(" ");
  emit(
    `${pagesId} 0 obj<< /Type /Pages /Kids [${kids}] /Count ${pagePairs.length} >>endobj\n`,
  );
  emit(
    `${fontReg} 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n`,
  );
  emit(
    `${fontBold} 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>endobj\n`,
  );

  for (const p of pagePairs) {
    emit(
      `${p.pageId} 0 obj<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${p.contentId} 0 R /Resources << /Font << /F1 ${fontReg} 0 R /F2 ${fontBold} 0 R >> >> >>endobj\n`,
    );
    const len = Buffer.byteLength(p.stream, "latin1");
    emit(
      `${p.contentId} 0 obj<< /Length ${len} >>stream\n${p.stream}\nendstream\nendobj\n`,
    );
  }

  const xrefPos = Buffer.byteLength(pdf, "latin1");
  let xref = `xref\n0 ${offs.length}\n`;
  xref += `0000000000 65535 f \n`;
  for (let i = 1; i < offs.length; i++) {
    xref += `${String(offs[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += xref;
  pdf += `trailer<< /Size ${offs.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

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
  completionRate: number; // 0–100
  avgProgress: number; // 0–100
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
  month: number, // 1–12
): Promise<MonthlyActionReport> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Invalid year");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Invalid month");
  }

  const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)); // last day of month

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
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines: string[] = [];
  lines.push(`Monthly Action Points Report — ${report.monthLabel}`);
  lines.push(`Period,${report.periodStart},${report.periodEnd}`);
  lines.push(`Total,${report.total}`);
  lines.push(`Completed,${report.completed}`);
  lines.push(`Completion rate (%),${report.completionRate}`);
  lines.push(`Average progress (%),${report.avgProgress}`);
  lines.push(`Open,${report.open}`);
  lines.push(`In progress,${report.inProgress}`);
  lines.push(`Overdue,${report.overdue}`);
  lines.push("");
  lines.push("Committee summary");
  lines.push("Committee,Code,Total,Completed,Completion rate (%)");
  for (const c of report.byCommittee) {
    lines.push([c.name, c.code, c.total, c.completed, c.completionRate].map(esc).join(","));
  }
  lines.push("");
  lines.push("Action points");
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

/** Excel-compatible SpreadsheetML (.xls) — opens in Excel without extra deps. */
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
 * Minimal multi-page text PDF (no external deps).
 * Latin-1 safe: non-ASCII replaced for core font Helvetica.
 */
export function reportToPdf(report: MonthlyActionReport): Buffer {
  const safe = (s: string) =>
    s.replace(/[^\x20-\x7E]/g, "?").replace(/\\/g, "\\\\").replace(/[()]/g, "");

  const lines: string[] = [];
  lines.push(`Committee Action Monitor`);
  lines.push(`Monthly Action Points Report`);
  lines.push(report.monthLabel);
  lines.push(`Period: ${report.periodStart} to ${report.periodEnd}`);
  lines.push("");
  lines.push(`Total actions: ${report.total}`);
  lines.push(`Completed: ${report.completed}`);
  lines.push(`Completion rate: ${report.completionRate}%`);
  lines.push(`Average progress: ${report.avgProgress}%`);
  lines.push(`Open: ${report.open}  |  In progress: ${report.inProgress}  |  Overdue: ${report.overdue}`);
  lines.push("");
  lines.push("By committee:");
  for (const c of report.byCommittee) {
    lines.push(
      `  ${c.code} ${c.name}: ${c.completed}/${c.total} (${c.completionRate}%)`,
    );
  }
  lines.push("");
  lines.push("Action points:");
  for (const r of report.rows) {
    lines.push(
      `  ${r.referenceNo} | ${r.status} | ${r.progress}% | ${r.committeeCode} | ${r.owner}`,
    );
    lines.push(`    ${r.title}`);
  }
  if (report.rows.length === 0) {
    lines.push("  (none in this month)");
  }

  // Paginate ~50 lines per page
  const perPage = 48;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += perPage) {
    pages.push(lines.slice(i, i + perPage));
  }
  if (pages.length === 0) pages.push(["(empty)"]);

  const objects: string[] = [];
  objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");

  const kids: string[] = [];
  let objNum = 3;
  const pageObjs: { page: number; content: number }[] = [];

  for (let p = 0; p < pages.length; p++) {
    const contentNum = objNum + 1;
    pageObjs.push({ page: objNum, content: contentNum });
    kids.push(`${objNum} 0 R`);
    objNum += 2;
  }

  objects.push(
    `2 0 obj<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>endobj\n`,
  );

  for (let i = 0; i < pages.length; i++) {
    const { page, content } = pageObjs[i];
    const pageLines = pages[i];
    let y = 800;
    const contentLines: string[] = ["BT", "/F1 10 Tf", "50 800 Td", "14 TL"];
    for (let li = 0; li < pageLines.length; li++) {
      const text = safe(pageLines[li]);
      if (li === 0) {
        contentLines.push(`(${text}) Tj`);
      } else {
        contentLines.push(`T* (${text}) Tj`);
      }
      y -= 14;
    }
    contentLines.push("ET");
    const stream = contentLines.join("\n");
    objects.push(
      `${page} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R /Resources << /Font << /F1 ${objNum} 0 R >> >> >>endobj\n`,
    );
    objects.push(
      `${content} 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj\n`,
    );
  }

  const fontObj = objNum;
  objects.push(
    `${fontObj} 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n`,
  );

  // Fix font refs - pages reference font at objNum but we need consistent numbering
  // Rebuild with cleaner approach
  return buildSimplePdf(lines.map(safe));
}

function buildSimplePdf(lines: string[]): Buffer {
  const perPage = 50;
  const pages: string[][] = [];
  for (let i = 0; i < Math.max(lines.length, 1); i += perPage) {
    pages.push(lines.slice(i, i + perPage));
  }

  const parts: string[] = ["%PDF-1.4\n"];
  const offsets: number[] = [0];

  const addObj = (body: string) => {
    offsets.push(Buffer.byteLength(parts.join(""), "latin1"));
    parts.push(`${offsets.length - 1} 0 obj\n${body}\nendobj\n`);
  };

  // We'll rebuild offsets properly
  const objs: string[] = [];
  objs.push(""); // 1-based

  // Font
  // Pages tree built after page objects

  const contentIds: number[] = [];
  const pageIds: number[] = [];

  // Reserve: 1=catalog, 2=pages, 3=font, then pairs of page+content
  // Simpler sequential:

  let n = 1;
  const catalogId = n++;
  const pagesId = n++;
  const fontId = n++;

  const pageContentPairs: { pageId: number; contentId: number; stream: string }[] = [];
  for (const pageLines of pages) {
    const pageId = n++;
    const contentId = n++;
    const ops = ["BT", "/F1 9 Tf", "40 802 Td", "11 TL"];
    pageLines.forEach((line, idx) => {
      const t = line.slice(0, 110);
      if (idx === 0) ops.push(`(${t}) Tj`);
      else ops.push(`T* (${t}) Tj`);
    });
    ops.push("ET");
    const stream = ops.join("\n");
    pageContentPairs.push({ pageId, contentId, stream });
  }

  const out: string[] = [];
  const off: number[] = [0];
  const write = (s: string) => {
    off.push(Buffer.byteLength(out.join(""), "latin1"));
    out.push(s);
  };

  // Actually track byte length correctly
  let pdf = "%PDF-1.4\n";
  const offs: number[] = [0];
  const emit = (s: string) => {
    offs.push(Buffer.byteLength(pdf, "latin1"));
    pdf += s;
  };

  emit(`${catalogId} 0 obj<< /Type /Catalog /Pages ${pagesId} 0 R >>endobj\n`);
  const kids = pageContentPairs.map((p) => `${p.pageId} 0 R`).join(" ");
  emit(
    `${pagesId} 0 obj<< /Type /Pages /Kids [${kids}] /Count ${pageContentPairs.length} >>endobj\n`,
  );
  emit(
    `${fontId} 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n`,
  );

  for (const p of pageContentPairs) {
    emit(
      `${p.pageId} 0 obj<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${p.contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>endobj\n`,
    );
    emit(
      `${p.contentId} 0 obj<< /Length ${Buffer.byteLength(p.stream, "latin1")} >>stream\n${p.stream}\nendstream\nendobj\n`,
    );
  }

  const xrefPos = Buffer.byteLength(pdf, "latin1");
  const count = offs.length; // next object number = offs.length
  // offs[0]=0 unused; object i is at offs[i]
  let xref = `xref\n0 ${offs.length}\n`;
  xref += `0000000000 65535 f \n`;
  for (let i = 1; i < offs.length; i++) {
    xref += `${String(offs[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += xref;
  pdf += `trailer<< /Size ${offs.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

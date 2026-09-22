import * as XLSX from "xlsx";
import type { ParsedActionDraft } from "./importParse";
import { parseActionsFromText } from "./importParse";

/**
 * Read first sheet of an Excel workbook into plain text (tab-separated rows)
 * so the existing action-tracker heuristics can parse it.
 */
export async function extractTextFromSpreadsheet(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The spreadsheet has no sheets.");
  const sheet = workbook.Sheets[sheetName];
  // Produce TSV so column-oriented trackers parse cleanly
  return XLSX.utils.sheet_to_csv(sheet, { FS: "\t", RS: "\n" });
}

/**
 * Structured parse when the sheet has clear headers (Decision/Action, Owner, Due, Status).
 */
export function parseActionsFromSpreadsheetRows(rows: string[][]): ParsedActionDraft[] {
  if (!rows.length) return [];

  const norm = (s: string) => (s ?? "").replace(/\s+/g, " ").trim();
  const headerIdx = rows.findIndex((r) => {
    const line = r.map(norm).join(" ").toLowerCase();
    return (
      (line.includes("decision") || line.includes("action")) &&
      (line.includes("owner") || line.includes("due") || line.includes("status"))
    );
  });

  const start = headerIdx >= 0 ? headerIdx + 1 : 0;
  const header = headerIdx >= 0 ? rows[headerIdx].map((h) => norm(h).toLowerCase()) : [];

  const col = (names: string[]) => {
    for (const n of names) {
      const i = header.findIndex((h) => h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };

  const iAction = col(["decision", "action", "item", "description"]);
  const iOwner = col(["owner", "responsible"]);
  const iDue = col(["due", "deadline", "timeline", "date"]);
  const iStatus = col(["status", "progress"]);
  const iNo = col(["no", "#", "s/n"]);

  const actions: ParsedActionDraft[] = [];
  for (let r = start; r < rows.length; r++) {
    const row = rows[r].map(norm);
    if (!row.some(Boolean)) continue;

    let title = "";
    let ownerHint = "";
    let deadlineRaw = "";
    let statusHint = "";

    if (headerIdx >= 0 && iAction >= 0) {
      title = row[iAction] ?? "";
      ownerHint = iOwner >= 0 ? row[iOwner] ?? "" : "";
      deadlineRaw = iDue >= 0 ? row[iDue] ?? "" : "";
      statusHint = iStatus >= 0 ? row[iStatus] ?? "" : "";
    } else {
      // Fallback: No | Action | Owner | Due | Status
      const cells = row.filter(Boolean);
      if (cells.length < 2) continue;
      if (/^\d+$/.test(cells[0])) {
        title = cells[1] ?? "";
        ownerHint = cells[2] ?? "";
        deadlineRaw = cells[3] ?? "";
        statusHint = cells[4] ?? "";
      } else {
        title = cells[0];
        ownerHint = cells[1] ?? "";
        deadlineRaw = cells[2] ?? "";
        statusHint = cells[3] ?? "";
      }
    }

    title = norm(title);
    if (title.length < 8) continue;
    if (/^(no\.?|decision|action|owner|due|status)$/i.test(title)) continue;

    // Reuse text parser date helper via a synthetic line for deadline
    const synthetic = `${actions.length + 1}\t${title}\t${ownerHint}\t${deadlineRaw}\t${statusHint}`;
    const parsed = parseActionsFromText(synthetic);
    if (parsed[0]) {
      actions.push({ ...parsed[0], key: `xlsx-${r}-${actions.length}`, include: true });
    } else {
      const d = new Date();
      d.setDate(d.getDate() + 14);
      actions.push({
        key: `xlsx-${r}-${actions.length}`,
        title,
        ownerHint,
        deadline: d.toISOString().slice(0, 10),
        statusHint,
        include: true,
      });
    }
  }
  return actions;
}

export async function parseSpreadsheetActions(file: File): Promise<ParsedActionDraft[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as string[][];
  return parseActionsFromSpreadsheetRows(rows);
}

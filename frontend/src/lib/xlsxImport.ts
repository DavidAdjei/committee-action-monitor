import ExcelJS from "exceljs";
import type { ParsedActionDraft } from "./importParse";
import { mapImportStatus, parseActionsFromText } from "./importParse";

/**
 * Read spreadsheet bytes with ExcelJS (actively maintained; replaces vulnerable
 * npm `xlsx` / SheetJS 0.18.x which is no longer patched on the public registry).
 *
 * Supports .xlsx / .xlsm. Legacy binary .xls is not supported — ask users to save as .xlsx.
 */

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    // Rich text, hyperlink, formula result, etc.
    const v = value as {
      text?: string;
      result?: unknown;
      richText?: { text: string }[];
      hyperlink?: string;
    };
    if (Array.isArray(v.richText)) {
      return v.richText.map((p) => p.text).join("");
    }
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
  }
  return String(value);
}

async function loadFirstSheetRows(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls") && !name.endsWith(".xlsx") && !name.endsWith(".xlsm")) {
    throw new Error(
      "Legacy .xls files are not supported. Open the file in Excel and save it as .xlsx, then import again.",
    );
  }

  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  // ExcelJS accepts ArrayBuffer / Buffer-like inputs in browser builds
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("The spreadsheet has no sheets.");
  }

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values = row.values as ExcelJS.CellValue[];
    // ExcelJS row.values is 1-indexed (index 0 is unused)
    const cells: string[] = [];
    const len = values.length;
    for (let i = 1; i < len; i++) {
      cells.push(cellToString(values[i]));
    }
    rows.push(cells);
  });
  return rows;
}

/**
 * Read first sheet into plain text (tab-separated rows)
 * so the existing action-tracker heuristics can parse it.
 */
export async function extractTextFromSpreadsheet(file: File): Promise<string> {
  const rows = await loadFirstSheetRows(file);
  return rows.map((r) => r.join("\t")).join("\n");
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
      ownerHint = iOwner >= 0 ? (row[iOwner] ?? "") : "";
      deadlineRaw = iDue >= 0 ? (row[iDue] ?? "") : "";
      statusHint = iStatus >= 0 ? (row[iStatus] ?? "") : "";
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

    const synthetic = `${actions.length + 1}\t${title}\t${ownerHint}\t${deadlineRaw}\t${statusHint}`;
    const parsed = parseActionsFromText(synthetic);
    if (parsed[0]) {
      actions.push({ ...parsed[0], key: `xlsx-${r}-${actions.length}`, include: true });
    } else {
      const d = new Date();
      d.setDate(d.getDate() + 14);
      const mapped = mapImportStatus(statusHint);
      actions.push({
        key: `xlsx-${r}-${actions.length}`,
        title,
        ownerHint,
        deadline: d.toISOString().slice(0, 10),
        statusHint,
        status: mapped.status,
        progress: mapped.progress,
        include: true,
      });
    }
  }
  return actions;
}

export async function parseSpreadsheetActions(file: File): Promise<ParsedActionDraft[]> {
  const rows = await loadFirstSheetRows(file);
  return parseActionsFromSpreadsheetRows(rows);
}

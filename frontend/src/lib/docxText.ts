/**
 * DOCX helpers — plain text + structured action-tracker table import.
 */
import {
  extractLinearBody,
  extractTablesFromDocumentXml,
  loadDocxXml,
  mapActionTrackerRows,
  selectActionTrackerTable,
} from "./docxTables";
import {
  parseActionsFromMappedTable,
  parseDiscussionFromMinutes,
  parseImportDocument,
  type ParsedImport,
} from "./importParse";

export async function extractTextFromDocx(file: File): Promise<string> {
  const xml = await loadDocxXml(file);
  return extractLinearBody(xml);
}

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) return extractTextFromDocx(file);
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const { extractTextFromSpreadsheet } = await import("./xlsxImport");
    return extractTextFromSpreadsheet(file);
  }
  if (name.endsWith(".txt") || name.endsWith(".csv") || name.endsWith(".md")) {
    return file.text();
  }
  throw new Error("Supported formats: .docx, .xlsx, .csv, .txt");
}

/**
 * Preferred path for .docx imports:
 * - Locate the action-tracker table (after "Summary of Decisions & Action Tracker"
 *   when present, or any table with No / Decision / Owner / Due / Status headers)
 * - Map columns into action drafts
 * - Still extract discussion text for minutes mode
 */
export async function parseDocxImport(
  file: File,
  mode: "minutes_and_actions" | "actions_only",
): Promise<ParsedImport> {
  const xml = await loadDocxXml(file);
  const bodyText = extractLinearBody(xml);
  const tables = extractTablesFromDocumentXml(xml);
  const table = selectActionTrackerTable(tables, bodyText, xml);
  const warnings: string[] = [];

  let actions = table
    ? parseActionsFromMappedTable(mapActionTrackerRows(table))
    : [];

  if (actions.length === 0) {
    // Fallback to line heuristics on plain text
    const fallback = parseImportDocument(bodyText, mode);
    actions = fallback.actions;
    warnings.push(
      ...(fallback.warnings.length
        ? fallback.warnings
        : ["No action-tracker table detected; used text heuristics."]),
    );
  } else {
    warnings.push(
      `Extracted ${actions.length} action point(s) from the Word table (No. / Decision · Action / Owner / Due Date / Status).`,
    );
  }

  const discussion =
    mode === "minutes_and_actions" ? parseDiscussionFromMinutes(bodyText) : "";

  if (mode === "minutes_and_actions" && discussion.length < 40) {
    warnings.push(
      "Could not auto-detect discussion text — please review and edit before uploading.",
    );
  }

  return { kind: mode, discussion, actions, warnings };
}

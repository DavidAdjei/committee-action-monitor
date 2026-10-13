/**
 * CSV / spreadsheet cell escaping (CWE-1236 formula injection).
 *
 * Neutralizes cells that would be interpreted as formulas when the file is
 * opened in Excel, Google Sheets, or LibreOffice (leading = + - @ tab CR).
 * Also applies standard RFC-style quoting for commas, quotes, and newlines.
 */

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Prefix a dangerous leading character so spreadsheets treat the value as text. */
export function neutralizeSpreadsheetFormula(value: string): string {
  if (FORMULA_PREFIX.test(value)) {
    return `'${value}`;
  }
  return value;
}

/** Escape one CSV field for download. */
export function escapeCsvCell(v: string | number | null | undefined): string {
  let s = v == null ? "" : String(v);
  s = neutralizeSpreadsheetFormula(s);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

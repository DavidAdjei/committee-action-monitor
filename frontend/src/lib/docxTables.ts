/**
 * Structured DOCX table extraction (OOXML) — no extra npm deps.
 * Finds the "Summary of Decisions & Action Tracker" section table, or any
 * table whose header row looks like No. | Decision/Action | Owner | Due | Status.
 */

export type DocxTable = string[][];

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function cellText(cellXml: string): string {
  // Prefer w:t text nodes; join with space; paragraphs → space
  const texts: string[] = [];
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cellXml)) !== null) {
    texts.push(m[1]);
  }
  return decodeXmlEntities(texts.join("")).replace(/\s+/g, " ").trim();
}

function rowCells(rowXml: string): string[] {
  const cells: string[] = [];
  const re = /<w:tc[\s>][\s\S]*?<\/w:tc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rowXml)) !== null) {
    cells.push(cellText(m[0]));
  }
  return cells;
}

/** Extract all tables from word/document.xml as arrays of rows of cell strings. */
export function extractTablesFromDocumentXml(xml: string): DocxTable[] {
  const tables: DocxTable[] = [];
  const tblRe = /<w:tbl[\s>][\s\S]*?<\/w:tbl>/g;
  let tm: RegExpExecArray | null;
  while ((tm = tblRe.exec(xml)) !== null) {
    const rows: string[][] = [];
    const rowRe = /<w:tr[\s>][\s\S]*?<\/w:tr>/g;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(tm[0])) !== null) {
      const cells = rowCells(rm[0]);
      if (cells.some((c) => c.length > 0)) rows.push(cells);
    }
    if (rows.length) tables.push(rows);
  }
  return tables;
}

/** Plain text with markers so we can find section headings relative to tables. */
export function extractLinearBody(xml: string): string {
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br[^/]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** True if a row looks like the action-tracker header. */
export function isActionTrackerHeaderRow(row: string[]): boolean {
  const joined = normHeader(row.join(" "));
  const hasAction =
    joined.includes("decision") ||
    joined.includes("action") ||
    joined.includes("item");
  const hasOwner = joined.includes("owner") || joined.includes("responsible");
  const hasDue = joined.includes("due") || joined.includes("deadline") || joined.includes("timeline");
  // Need action + (owner or due) — Status optional
  return hasAction && (hasOwner || hasDue);
}

function scoreActionTable(table: DocxTable): number {
  if (!table.length) return 0;
  const headerIdx = table.findIndex(isActionTrackerHeaderRow);
  if (headerIdx < 0) return 0;
  const dataRows = table.length - headerIdx - 1;
  return 10 + dataRows;
}

/**
 * Pick the action-tracker table:
 * 1) Prefer table whose preceding body text mentions Summary of Decisions / Action Tracker
 * 2) Else highest-scoring table with matching headers
 * 3) Else first multi-column table with ≥2 rows
 */
/**
 * Walk document body in order: after a "Summary of Decisions & Action Tracker"
 * (or similar) heading, return the next table that has the action columns.
 * Otherwise pick the best-scoring action table / first wide table.
 */
export function selectActionTrackerTable(
  tables: DocxTable[],
  bodyText: string,
  documentXml?: string,
): DocxTable | null {
  if (!tables.length) return null;

  if (documentXml) {
    // Ordered scan of body: paragraphs + tables
    const bodyMatch = documentXml.match(/<w:body[^>]*>([\s\S]*)<\/w:body>/);
    const body = bodyMatch ? bodyMatch[1] : documentXml;
    const parts = body.match(/<w:tbl[\s>][\s\S]*?<\/w:tbl>|<w:p[\s>][\s\S]*?<\/w:p>/g) ?? [];
    let afterTrackerHeading = false;
    let tableIndex = 0;
    for (const part of parts) {
      if (part.startsWith("<w:p")) {
        const plain = part
          .replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, "$1")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .toLowerCase();
        if (
          plain.includes("summary of decision") ||
          plain.includes("action tracker") ||
          (plain.includes("decision") && plain.includes("action") && plain.includes("summary"))
        ) {
          afterTrackerHeading = true;
        }
      } else if (part.startsWith("<w:tbl")) {
        const table = tables[tableIndex++];
        if (!table) continue;
        if (afterTrackerHeading && (isActionTrackerHeaderRow(table[0]) || scoreActionTable(table) > 0 || table.length >= 2)) {
          // Prefer this table immediately after the tracker heading
          if (scoreActionTable(table) > 0 || isActionTrackerHeaderRow(table[0]) || table[0]?.some((c) => /decision|action|owner/i.test(c))) {
            return table;
          }
          // Even without perfect header, first table after the heading is the tracker
          return table;
        }
      }
    }
  }

  let best: DocxTable | null = null;
  let bestScore = 0;
  for (const t of tables) {
    const s = scoreActionTable(t);
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  if (best) return best;

  const fallback = tables.find((t) => t.length >= 2 && t.some((r) => r.length >= 4));
  return fallback ?? tables[0] ?? null;
}

export type MappedActionRow = {
  no: string;
  title: string;
  ownerHint: string;
  deadlineRaw: string;
  statusHint: string;
};

/**
 * Map header columns → No / Decision/Action / Owner / Due Date / Status
 * and return data rows.
 */
export function mapActionTrackerRows(table: DocxTable): MappedActionRow[] {
  const headerIdx = table.findIndex(isActionTrackerHeaderRow);
  const start = headerIdx >= 0 ? headerIdx + 1 : 1;
  const header = (headerIdx >= 0 ? table[headerIdx] : table[0]).map(normHeader);

  const col = (names: string[]) => {
    for (const n of names) {
      const i = header.findIndex((h) => h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };

  let iNo = col(["no", "s n", "sn"]);
  let iAction = col(["decision", "action", "item", "description"]);
  let iOwner = col(["owner", "responsible"]);
  let iDue = col(["due", "deadline", "timeline", "date"]);
  let iStatus = col(["status", "progress"]);

  // Fixed layout fallback: No | Decision/Action | Owner | Due Date | Status
  if (iAction < 0 && header.length >= 5) {
    iNo = 0;
    iAction = 1;
    iOwner = 2;
    iDue = 3;
    iStatus = 4;
  } else if (iAction < 0 && header.length >= 4) {
    iNo = 0;
    iAction = 1;
    iOwner = 2;
    iDue = 3;
  }

  const out: MappedActionRow[] = [];
  for (let r = start; r < table.length; r++) {
    const row = table[r];
    const title = (iAction >= 0 ? row[iAction] : row[1] ?? row[0] ?? "").trim();
    if (!title || title.length < 5) continue;
    if (/^(no\.?|decision|action|owner|due|status)$/i.test(title)) continue;

    out.push({
      no: (iNo >= 0 ? row[iNo] : String(out.length + 1))?.trim() || String(out.length + 1),
      title,
      ownerHint: (iOwner >= 0 ? row[iOwner] ?? "" : "").trim(),
      deadlineRaw: (iDue >= 0 ? row[iDue] ?? "" : "").trim(),
      statusHint: (iStatus >= 0 ? row[iStatus] ?? "" : "").trim(),
    });
  }
  return out;
}

/** Minimal ZIP → file map for OOXML */
export async function unzipToMap(buffer: ArrayBuffer): Promise<Record<string, Uint8Array>> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const out: Record<string, Uint8Array> = {};

  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Invalid ZIP/DOCX archive.");

  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  for (let e = 0; e < entryCount; e++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeader = view.getUint32(offset + 42, true);
    const nameBytes = bytes.slice(offset + 46, offset + 46 + nameLen);
    const name = new TextDecoder("utf-8").decode(nameBytes);

    const localNameLen = view.getUint16(localHeader + 26, true);
    const localExtraLen = view.getUint16(localHeader + 28, true);
    const dataStart = localHeader + 30 + localNameLen + localExtraLen;
    const compressed = bytes.slice(dataStart, dataStart + compSize);

    if (method === 0) {
      out[name] = compressed;
    } else if (method === 8) {
      out[name] = await inflateRaw(compressed);
    }

    offset += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot decompress DOCX files. Use Chrome/Edge or export as .csv/.txt.");
  }
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

export async function loadDocxXml(file: File): Promise<string> {
  const files = await unzipToMap(await file.arrayBuffer());
  const xmlBytes = files["word/document.xml"];
  if (!xmlBytes) throw new Error("This file does not look like a valid Word document (.docx).");
  return new TextDecoder("utf-8").decode(xmlBytes);
}

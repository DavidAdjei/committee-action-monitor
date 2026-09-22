/**
 * Lightweight DOCX → plain text (no extra npm deps).
 * Reads word/document.xml from the OOXML zip and strips tags.
 */
export async function extractTextFromDocx(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const files = await unzipToMap(buffer);
  const xmlBytes = files["word/document.xml"];
  if (!xmlBytes) {
    throw new Error("This file does not look like a valid Word document (.docx).");
  }
  const xml = new TextDecoder("utf-8").decode(xmlBytes);
  // Convert common Word breaks to newlines, then strip tags
  let text = xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br[^/]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\n{3,}/g, "\n\n");
  return text.trim();
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

/** Minimal ZIP inflater for OOXML (store + deflate). */
async function unzipToMap(buffer: ArrayBuffer): Promise<Record<string, Uint8Array>> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const out: Record<string, Uint8Array> = {};

  // Find End of Central Directory
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
  // Copy into a standalone ArrayBuffer so BlobPart typing is satisfied (TS DOM libs).
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

import { createHash, randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

const LOCAL_DIR = process.env.EVIDENCE_LOCAL_DIR ?? path.join(process.cwd(), ".evidence-storage");
const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png"];
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB per the documented upload control

export class EvidenceValidationError extends Error {}

function assertAllowed(filename: string, sizeBytes: number) {
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new EvidenceValidationError(
      `File type ${ext || "(none)"} is not permitted. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
    );
  }
  if (sizeBytes > MAX_BYTES) {
    throw new EvidenceValidationError("File exceeds the 20 MB per-file limit.");
  }
}

export interface StoredEvidence {
  storageKey: string;
  sha256: string;
  sizeBytes: number;
}

/**
 * Persists an evidence file and returns its storage key + hash. Files are
 * never stored in MySQL — only this metadata is (per the documented
 * decision to keep binaries out of the relational store).
 *
 * Malware scanning: this function marks new uploads scanResult=PENDING;
 * wiring a real scanner (e.g. Defender for Storage on the target Blob
 * container) is an infrastructure step, not application logic, so it isn't
 * simulated here.
 *
 * Swap to Azure Blob Storage in production by setting
 * EVIDENCE_STORAGE_CONNECTION_STRING — @azure/storage-blob is intentionally
 * not a hard dependency of this starter so it builds without that package
 * configured; add it and replace the body of this branch when you wire
 * real Blob Storage.
 */
export async function storeEvidenceFile(params: {
  filename: string;
  mediaType: string;
  buffer: Buffer;
}): Promise<StoredEvidence> {
  assertAllowed(params.filename, params.buffer.byteLength);
  const sha256 = createHash("sha256").update(params.buffer).digest("hex");

  if (process.env.EVIDENCE_STORAGE_CONNECTION_STRING) {
    throw new Error(
      "EVIDENCE_STORAGE_CONNECTION_STRING is set but the Azure Blob Storage client is not wired up in " +
        "this starter. Add @azure/storage-blob and implement the upload here before enabling this setting.",
    );
  }

  await fs.mkdir(LOCAL_DIR, { recursive: true });
  const key = `${randomUUID()}-${params.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await fs.writeFile(path.join(LOCAL_DIR, key), params.buffer);

  return { storageKey: key, sha256, sizeBytes: params.buffer.byteLength };
}

export async function readEvidenceFile(storageKey: string): Promise<Buffer> {
  if (process.env.EVIDENCE_STORAGE_CONNECTION_STRING) {
    throw new Error("Azure Blob Storage read path is not wired up in this starter.");
  }
  try {
    return await fs.readFile(path.join(LOCAL_DIR, storageKey));
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      throw new EvidenceValidationError("Evidence file was not found in storage.");
    }
    throw err;
  }
}

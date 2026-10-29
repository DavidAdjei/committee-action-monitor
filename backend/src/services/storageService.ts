import { createHash, randomUUID } from "crypto";
import path from "path";
import { BlobServiceClient, ContainerClient, RestError } from "@azure/storage-blob";

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png"];
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

/** Logical purpose → blob container name */
export type StoragePurpose = "evidence" | "minutes" | "meeting-papers";

const PURPOSE_CONTAINERS: Record<StoragePurpose, string> = {
  evidence: process.env.EVIDENCE_BLOB_CONTAINER?.trim() || "evidence",
  minutes: process.env.MINUTES_BLOB_CONTAINER?.trim() || "minutes",
  "meeting-papers": process.env.MEETING_PAPERS_BLOB_CONTAINER?.trim() || "meeting-papers",
};

const ALLOWED_PURPOSES = new Set<string>(Object.keys(PURPOSE_CONTAINERS));

/** Validation / client input problems → HTTP 400 */
export class EvidenceValidationError extends Error {
  readonly code = "STORAGE_VALIDATION";
  constructor(message: string) {
    super(message);
    this.name = "EvidenceValidationError";
  }
}

/**
 * Storage not configured or Azure/Azurite unreachable → HTTP 503.
 * Message is safe to show in the UI for operators without log access.
 */
export class StorageUnavailableError extends Error {
  readonly code = "STORAGE_UNAVAILABLE";
  constructor(message: string) {
    super(message);
    this.name = "StorageUnavailableError";
  }
}

function assertAllowed(filename: string, sizeBytes: number) {
  const base = path.basename(filename);
  const ext = path.extname(base).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new EvidenceValidationError(
      `File type ${ext || "(none)"} is not permitted. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
    );
  }
  if (sizeBytes > MAX_BYTES) {
    throw new EvidenceValidationError("File exceeds the 20 MB per-file limit.");
  }
}

/**
 * Always required — no local-disk fallback.
 * Use Azurite connection string locally; real Azure connection string in cloud.
 */
function requireConnectionString(): string {
  const cs = process.env.EVIDENCE_STORAGE_CONNECTION_STRING?.trim();
  if (!cs) {
    throw new StorageUnavailableError(
      "File storage is not configured. Set application setting EVIDENCE_STORAGE_CONNECTION_STRING " +
        "to the Azure Storage connection string (or Azurite for local). " +
        "Containers used: evidence, minutes, meeting-papers.",
    );
  }
  return cs;
}

function blobService(): BlobServiceClient {
  try {
    return BlobServiceClient.fromConnectionString(requireConnectionString());
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new StorageUnavailableError(
      "Invalid EVIDENCE_STORAGE_CONNECTION_STRING. Check the connection string format. " +
        `Detail: ${detail}`,
    );
  }
}

function containerNameFor(purpose: StoragePurpose): string {
  return PURPOSE_CONTAINERS[purpose];
}

/** Map Azure SDK / network failures to operator-readable StorageUnavailableError. */
function mapBlobError(err: unknown, action: string, container?: string): never {
  if (err instanceof EvidenceValidationError || err instanceof StorageUnavailableError) {
    throw err;
  }

  const status =
    err && typeof err === "object" && "statusCode" in err
      ? (err as { statusCode?: number }).statusCode
      : undefined;
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: string }).code ?? "")
      : "";
  const rawMessage =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Unknown storage error";

  const where = container ? ` (container "${container}")` : "";

  if (
    /API version .* is not supported by Azurite/i.test(rawMessage) ||
    /skipApiVersionCheck/i.test(rawMessage)
  ) {
    throw new StorageUnavailableError(
      `Azurite rejected the storage client API version while trying to ${action}${where}. ` +
        "Upgrade Azurite or start it with --skipApiVersionCheck. " +
        `Detail: ${rawMessage}`,
    );
  }

  if (status === 403 || code === "AuthorizationFailure" || /authorization/i.test(rawMessage)) {
    throw new StorageUnavailableError(
      `Storage authorization failed while trying to ${action}${where}. ` +
        "Check the connection string account key, or grant the Function App managed identity " +
        "Storage Blob Data Contributor on the storage account. " +
        `Detail: ${rawMessage}`,
    );
  }

  if (status === 404 || code === "ContainerNotFound" || code === "BlobNotFound") {
    if (action.includes("read") || action.includes("download")) {
      throw new EvidenceValidationError("File was not found in blob storage.");
    }
    throw new StorageUnavailableError(
      `Storage container missing while trying to ${action}${where}. ` +
        "Create containers evidence, minutes, and meeting-papers (or set EVIDENCE_BLOB_CONTAINER / " +
        "MINUTES_BLOB_CONTAINER / MEETING_PAPERS_BLOB_CONTAINER). " +
        `Detail: ${rawMessage}`,
    );
  }

  if (
    status === 0 ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network/i.test(rawMessage)
  ) {
    throw new StorageUnavailableError(
      `Cannot reach Azure Blob Storage while trying to ${action}${where}. ` +
        "If using Azurite, ensure it is running on the Blob endpoint. " +
        "If using Azure, check the connection string AccountName and network rules. " +
        `Detail: ${rawMessage}`,
    );
  }

  if (err instanceof RestError) {
    throw new StorageUnavailableError(
      `Blob storage error while trying to ${action}${where} (HTTP ${status ?? "n/a"}, code ${code || "n/a"}). ` +
        `Detail: ${rawMessage}`,
    );
  }

  throw new StorageUnavailableError(
    `Blob storage failed while trying to ${action}${where}. Detail: ${rawMessage}`,
  );
}

async function getContainer(purpose: StoragePurpose): Promise<ContainerClient> {
  const name = containerNameFor(purpose);
  try {
    const service = blobService();
    const container = service.getContainerClient(name);
    await container.createIfNotExists();
    return container;
  } catch (err) {
    mapBlobError(err, "open or create the container", name);
  }
}

/**
 * Parse storage key written by this service: `{purpose}/{uuid}-{filename}`
 * Legacy flat keys (no slash) are treated as purpose "evidence".
 */
function parseStorageKey(storageKey: string): { purpose: StoragePurpose; blobName: string } {
  const key = String(storageKey ?? "").trim();
  if (!key || key.includes("\0") || key.includes("..")) {
    throw new EvidenceValidationError("Invalid storage key.");
  }
  const slash = key.indexOf("/");
  if (slash > 0) {
    const head = key.slice(0, slash);
    const rest = key.slice(slash + 1);
    if (ALLOWED_PURPOSES.has(head) && rest && !rest.includes("..") && !rest.includes("/")) {
      return { purpose: head as StoragePurpose, blobName: rest };
    }
  }
  const blobName = path.basename(key);
  if (!blobName) {
    throw new EvidenceValidationError("Invalid storage key.");
  }
  return { purpose: "evidence", blobName };
}

export interface StoredEvidence {
  storageKey: string;
  sha256: string;
  sizeBytes: number;
}

/**
 * Persist a file to Azure Blob Storage (or Azurite when using the dev connection string).
 * There is no local filesystem fallback.
 */
export async function storeEvidenceFile(params: {
  filename: string;
  mediaType: string;
  buffer: Buffer;
  /** Defaults to evidence. Minutes and meeting papers use their containers. */
  purpose?: StoragePurpose;
}): Promise<StoredEvidence> {
  assertAllowed(params.filename, params.buffer.byteLength);
  const sha256 = createHash("sha256").update(params.buffer).digest("hex");
  const purpose: StoragePurpose = params.purpose ?? "evidence";
  const safeName = path.basename(params.filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const blobName = `${randomUUID()}-${safeName}`;
  const storageKey = `${purpose}/${blobName}`;
  const containerName = containerNameFor(purpose);

  try {
    const container = await getContainer(purpose);
    const block = container.getBlockBlobClient(blobName);
    await block.uploadData(params.buffer, {
      blobHTTPHeaders: {
        blobContentType: params.mediaType || "application/octet-stream",
      },
    });
  } catch (err) {
    mapBlobError(err, "upload the file", containerName);
  }

  return { storageKey, sha256, sizeBytes: params.buffer.byteLength };
}

export async function readEvidenceFile(storageKey: string): Promise<Buffer> {
  const { purpose, blobName } = parseStorageKey(storageKey);
  const containerName = containerNameFor(purpose);
  try {
    const container = await getContainer(purpose);
    const block = container.getBlockBlobClient(blobName);
    return await block.downloadToBuffer();
  } catch (err) {
    mapBlobError(err, "download the file", containerName);
  }
}

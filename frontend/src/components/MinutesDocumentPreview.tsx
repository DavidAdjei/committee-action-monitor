import { useEffect, useState } from "react";
import { Download, Eye, FileText, Loader2, X } from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { endpoints } from "@/api/endpoints";
import { ApiClientError } from "@/api/client";
import { useFlash } from "@/state/toastContext";

function isPdf(filename?: string | null, mediaType?: string | null) {
  const mt = (mediaType || "").toLowerCase();
  if (mt.includes("pdf")) return true;
  const name = (filename || "").toLowerCase();
  return name.endsWith(".pdf");
}

function isWord(filename?: string | null, mediaType?: string | null) {
  const mt = (mediaType || "").toLowerCase();
  if (mt.includes("word") || mt.includes("officedocument.wordprocessingml")) return true;
  const name = (filename || "").toLowerCase();
  return name.endsWith(".doc") || name.endsWith(".docx");
}

/**
 * In-app preview of a minutes document.
 * PDFs render in an iframe; Word files show a short note + download
 * (browsers cannot reliably render .doc/.docx without conversion).
 */
export function MinutesDocumentPreview({
  minutesId,
  filename,
  mediaType,
  onClose,
}: {
  minutesId: number;
  filename?: string | null;
  mediaType?: string | null;
  onClose: () => void;
}) {
  const flash = useFlash();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [resolvedType, setResolvedType] = useState<string | null>(mediaType ?? null);
  const [resolvedName, setResolvedName] = useState<string | null>(filename ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError(null);

    void endpoints
      .fetchMinutesDocumentBlob(minutesId)
      .then(({ blob, contentType, filename: name }) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        revoked = url;
        setObjectUrl(url);
        setResolvedType(contentType || mediaType || blob.type);
        if (name) setResolvedName(name);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiClientError ? err.message : "Could not load document for preview.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [minutesId, mediaType]);

  const pdf = isPdf(resolvedName, resolvedType);
  const word = isWord(resolvedName, resolvedType);

  return (
    <Modal
      title="Document preview"
      subtitle={resolvedName ?? `Minutes #${minutesId}`}
      onClose={onClose}
      wide
    >
      <div className="space-y-3">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading document…
          </p>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {!loading && !error && objectUrl && pdf && (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <iframe
              title={resolvedName ?? "Minutes PDF"}
              src={objectUrl}
              className="h-[min(70vh,720px)] w-full bg-white"
            />
          </div>
        )}

        {!loading && !error && objectUrl && !pdf && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-900/40">
            <FileText className="mx-auto mb-3 h-10 w-10 text-slate-400" />
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
              {word
                ? "Word documents cannot be previewed in the browser"
                : "This file type cannot be previewed in the browser"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {resolvedName ?? "Document"} · Download to open in Microsoft Word or another app.
            </p>
            <button
              type="button"
              className="btn-primary mt-4 gap-1.5 text-sm"
              onClick={() =>
                void endpoints
                  .downloadMinutesDocument(minutesId, resolvedName ?? undefined)
                  .then(() => flash("Download started"))
                  .catch((err: unknown) =>
                    flash(err instanceof ApiClientError ? err.message : "Download failed.", "error"),
                  )
              }
            >
              <Download className="h-4 w-4" /> Download file
            </button>
          </div>
        )}
      </div>

      <ModalActions>
        {objectUrl && pdf && (
          <button
            type="button"
            className="btn gap-1.5"
            onClick={() =>
              void endpoints
                .downloadMinutesDocument(minutesId, resolvedName ?? undefined)
                .then(() => flash("Download started"))
                .catch((err: unknown) =>
                  flash(err instanceof ApiClientError ? err.message : "Download failed.", "error"),
                )
            }
          >
            <Download className="h-4 w-4" /> Download
          </button>
        )}
        <button type="button" className="btn gap-1.5" onClick={onClose}>
          <X className="h-4 w-4" /> Close
        </button>
      </ModalActions>
    </Modal>
  );
}

/** Small button that opens MinutesDocumentPreview when a file exists. */
export function PreviewMinutesButton({
  minutesId,
  filename,
  mediaType,
  hasFile,
  className = "btn text-xs",
}: {
  minutesId: number;
  filename?: string | null;
  mediaType?: string | null;
  hasFile?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!hasFile) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Eye className="mr-1 inline h-3.5 w-3.5" /> Preview
      </button>
      {open && (
        <MinutesDocumentPreview
          minutesId={minutesId}
          filename={filename}
          mediaType={mediaType}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

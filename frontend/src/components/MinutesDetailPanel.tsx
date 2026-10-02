import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { StatusPill, formatDate } from "@/components/StatusBits";
import { endpoints } from "@/api/endpoints";
import { ApiClientError } from "@/api/client";
import { useFlash } from "@/state/toastContext";
import { PreviewMinutesButton } from "@/components/MinutesDocumentPreview";
import type { MeetingMinutes } from "@/types";

function statusBadge(status: string) {
  switch (status) {
    case "DRAFT":
      return "bg-slate-100 text-slate-700 dark:text-slate-200 border-slate-200 dark:bg-slate-800 dark:text-slate-300";
    case "FINAL":
      return "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export function MinutesDetailPanel({
  minutesId,
  onClose,
  onChanged,
}: {
  minutesId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const flash = useFlash();
  const [detail, setDetail] = useState<MeetingMinutes | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void endpoints
      .getMinutes(minutesId)
      .then(setDetail)
      .catch((err: unknown) => {
        flash(err instanceof ApiClientError ? err.message : "Could not load minutes.", "error");
        onClose();
      });
  }, [minutesId]);

  if (!detail) {
    return (
      <Modal title="Minutes" onClose={onClose} wide>
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading minutes…
        </p>
      </Modal>
    );
  }

  return (
    <Modal title={`Minutes · ${detail.meeting.reference}`} subtitle={detail.meeting.title} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadge(detail.status)}`}
          >
            {detail.status}
          </span>
          <div className="text-xs text-slate-500">
            Created by {detail.createdBy.fullName} · {formatDate(detail.createdAt)}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2 dark:bg-slate-800/50">
          <div>
            <small className="block text-slate-400">Meeting</small>
            <b>
              {detail.meeting.reference} · {formatDate(detail.meeting.startsAt)}
            </b>
          </div>
          <div>
            <small className="block text-slate-400">Document</small>
            <b>{detail.filename ?? (detail.hasFile ? "Uploaded file" : "No file attached")}</b>
            {detail.sizeBytes != null && (
              <span className="ml-1 text-xs text-slate-400">({Math.round(detail.sizeBytes / 1024)} KB)</span>
            )}
          </div>
        </div>

        {detail.discussion && (
          <div>
            <b className="mb-1.5 block text-sm text-slate-800 dark:text-slate-100">Discussion</b>
            <p className="whitespace-pre-wrap rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
              {detail.discussion}
            </p>
          </div>
        )}

        {detail.snapshots && detail.snapshots.length > 0 && (
          <div>
            <b className="mb-1.5 block text-sm text-slate-800 dark:text-slate-100">
              Linked actions at import ({detail.snapshots.length})
            </b>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
              {detail.snapshots.map((s) => (
                <li key={s.actionPointId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    <b>
                      {s.referenceNo} · {s.title}
                    </b>
                    <span className="block text-xs text-slate-400">
                      {s.owner.fullName} · {s.progressPercent}%
                    </span>
                  </span>
                  <StatusPill status={s.actionStatus as any} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ModalActions>
        {detail.hasFile && (
          <>
            <PreviewMinutesButton
              minutesId={detail.id}
              filename={detail.filename}
              mediaType={detail.mediaType}
              hasFile
              className="btn gap-1.5"
            />
            <button
              type="button"
              className="btn gap-1.5"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void endpoints
                  .downloadMinutesDocument(detail.id, detail.filename ?? undefined)
                  .then(() => flash("Minutes document downloaded"))
                  .catch((err: unknown) =>
                    flash(err instanceof ApiClientError ? err.message : "Download failed.", "error"),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              <Download className="h-4 w-4" /> Download document
            </button>
          </>
        )}
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </ModalActions>
    </Modal>
  );
}

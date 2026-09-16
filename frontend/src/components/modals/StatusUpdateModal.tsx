import { FormEvent, useState } from "react";
import { Bell, CircleDot, Upload, X } from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { endpoints } from "@/api/endpoints";
import { ApiClientError } from "@/api/client";
import { useFlash } from "@/state/toastContext";
import type { ActionListItem } from "@/types";

type UiStatus = "IN_PROGRESS" | "COMPLETED" | "OVERDUE" | "CANCELLED";

const STATUS_CHOICES: { value: UiStatus; label: string; help: string; officersOnly?: boolean }[] = [
  { value: "IN_PROGRESS", label: "Ongoing", help: "Work is progressing" },
  {
    value: "OVERDUE",
    label: "Blocked",
    help: "Reported blocker (distinct from deadline-driven overdue)",
  },
  { value: "COMPLETED", label: "Completed", help: "Ready for verification" },
  {
    value: "CANCELLED",
    label: "Cancelled",
    help: "Governance decision to close without completion",
    officersOnly: true,
  },
];

export function StatusUpdateModal({
  item,
  version,
  isOfficer = false,
  onClose,
  onSaved,
}: {
  item: ActionListItem;
  version?: number;
  /** Chair/Secretary — enables Cancel */
  isOfficer?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const flash = useFlash();
  const [status, setStatus] = useState<UiStatus>("IN_PROGRESS");
  const [progress, setProgress] = useState(item.progress);
  const [note, setNote] = useState("");
  const [revisedDeadline, setRevisedDeadline] = useState("");
  const [evidenceLink, setEvidenceLink] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleChoices = STATUS_CHOICES.filter((s) => !s.officersOnly || isOfficer);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === "CANCELLED" && !isOfficer) {
      setError("Only the committee Chairperson or Secretary may cancel an action.");
      return;
    }
    if (status === "COMPLETED" && files.length === 0 && !evidenceLink.trim()) {
      setError("Attach at least one evidence file or provide an evidence link for completion.");
      return;
    }
    if ((status === "OVERDUE" || status === "CANCELLED") && !note.trim()) {
      setError(status === "CANCELLED" ? "A cancellation reason is required." : "Describe the blocker or reason outstanding.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const evidenceFiles = [];
      for (const file of files) {
        const uploaded = await endpoints.uploadEvidence(item.id, file);
        evidenceFiles.push(uploaded);
      }
      await endpoints.recordUpdate(item.id, {
        status,
        progress: status === "COMPLETED" ? 100 : status === "CANCELLED" ? item.progress : progress,
        note:
          status === "OVERDUE" && !note.startsWith("[Blocker]")
            ? `[Blocker] ${note}`
            : note,
        revisedDeadline: status === "OVERDUE" && revisedDeadline ? revisedDeadline : undefined,
        evidenceLink: evidenceLink || undefined,
        evidenceFiles: evidenceFiles.length ? evidenceFiles : undefined,
        version,
      });
      flash(
        status === "CANCELLED"
          ? "Action cancelled; stakeholders notified"
          : "Action status and evidence submitted; stakeholders notified",
      );
      onSaved();
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.isConflict) {
          setError(
            "This action was updated by someone else. Close this form, reopen the action, and try again.",
          );
          flash(err.message, "error");
        } else if (err.isForbidden) {
          setError("You are not authorized to update this action.");
          flash(err.message, "error");
        } else {
          setError(err.message);
        }
      } else {
        setError((err as Error)?.message ?? "Could not save this update.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Update action status" subtitle={`${item.referenceNo} · ${item.title}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2 sm:gap-4 dark:bg-slate-800/50">
          <div>
            <small className="block text-slate-400">Action owner</small>
            <b>{item.owner.fullName}</b>
          </div>
          <div>
            <small className="block text-slate-400">Current deadline</small>
            <b>{new Date(item.deadline).toLocaleDateString()}</b>
          </div>
          {version != null && (
            <div className="sm:col-span-2">
              <small className="block text-slate-400">Record version</small>
              <span className="font-mono text-xs text-slate-500">v{version}</span>
            </div>
          )}
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Status</span>
          <div className={`grid grid-cols-1 gap-2 ${visibleChoices.length > 3 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
            {visibleChoices.map((s) => (
              <button
                type="button"
                key={s.value}
                onClick={() => setStatus(s.value)}
                className={`rounded-lg border p-3 text-left text-xs transition ${
                  status === s.value
                    ? "border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200"
                    : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-600 dark:text-slate-300"
                }`}
              >
                <CircleDot className="mb-1 h-3.5 w-3.5" />
                <b className="block">{s.label}</b>
                <span className="text-slate-500">{s.help}</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            <b>Blocked</b> is a reported impediment. Deadline-driven overdue is also set automatically by the daily job
            when a due date passes.
          </p>
        </div>

        {status !== "COMPLETED" && status !== "CANCELLED" && (
          <label className="field-label">
            Progress completed
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="w-full"
              />
              <b className="w-10 text-right text-sm">{progress}%</b>
            </div>
          </label>
        )}

        <label className="field-label">
          {status === "OVERDUE"
            ? "Blocker / reason outstanding"
            : status === "CANCELLED"
              ? "Cancellation reason"
              : "Status update / remarks"}
          <textarea
            required
            className="field-input min-h-[80px]"
            placeholder={
              status === "OVERDUE"
                ? "Explain the blocker, dependency or reason for delay"
                : status === "CANCELLED"
                  ? "Record the governance decision and rationale"
                  : "Describe work completed, current position and next steps"
            }
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        {status === "OVERDUE" && (
          <label className="field-label">
            Revised completion date
            <input
              type="date"
              required
              className="field-input"
              value={revisedDeadline}
              onChange={(e) => setRevisedDeadline(e.target.value)}
            />
          </label>
        )}

        {status !== "CANCELLED" && (
          <>
            <label className="field-label">
              Evidence of action taken
              <div className="rounded-lg border border-dashed border-slate-300 p-4 dark:border-slate-600">
                <div className="flex items-center gap-3">
                  <Upload className="h-5 w-5 shrink-0 text-slate-400" />
                  <div className="flex-1 text-sm">
                    <input
                      type="file"
                      multiple
                      required={status === "COMPLETED" && !evidenceLink}
                      onChange={(e) => {
                        const list = e.target.files ? Array.from(e.target.files) : [];
                        setFiles((prev) => [...prev, ...list]);
                        e.target.value = "";
                      }}
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      PDF, Word, Excel, JPG or PNG · Max 20 MB each · Multiple files allowed
                    </p>
                  </div>
                </div>
                {files.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {files.map((f, i) => (
                      <li
                        key={`${f.name}-${i}`}
                        className="flex items-center justify-between rounded-md bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-800"
                      >
                        <span className="truncate font-medium text-slate-700 dark:text-slate-200">
                          {f.name}{" "}
                          <span className="font-normal text-slate-400">
                            ({Math.round(f.size / 1024)} KB)
                          </span>
                        </span>
                        <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => removeFile(i)}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <small className="font-normal text-slate-400">
                Evidence is required when marking an action Completed (file and/or link).
              </small>
            </label>

            <label className="field-label">
              Evidence link (optional)
              <input
                type="url"
                className="field-input"
                placeholder="https://sharepoint..."
                value={evidenceLink}
                onChange={(e) => setEvidenceLink(e.target.value)}
              />
            </label>
          </>
        )}

        <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-950 dark:text-blue-200">
          <Bell className="h-4 w-4 shrink-0" />
          Chairperson, Secretary and Central Committee representative will be notified.
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <ModalActions>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className={status === "CANCELLED" ? "btn-danger" : "btn-primary"}
            disabled={submitting}
          >
            {submitting ? "Saving…" : status === "CANCELLED" ? "Cancel action & notify" : "Save update & notify"}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}

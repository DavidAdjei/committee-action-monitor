import { FormEvent, useState } from "react";
import { Bell, CircleDot, Upload } from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { endpoints } from "@/api/endpoints";
import { useFlash } from "@/state/toastContext";
import type { ActionListItem } from "@/types";

const STATUS_CHOICES: { value: "IN_PROGRESS" | "COMPLETED" | "OVERDUE"; label: string; help: string }[] = [
  { value: "IN_PROGRESS", label: "Ongoing", help: "Work is progressing" },
  { value: "COMPLETED", label: "Completed", help: "Ready for verification" },
  { value: "OVERDUE", label: "Outstanding", help: "Blocked or not completed" },
];

export function StatusUpdateModal({
  item,
  onClose,
  onSaved,
}: {
  item: ActionListItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const flash = useFlash();
  const [status, setStatus] = useState<"IN_PROGRESS" | "COMPLETED" | "OVERDUE">("IN_PROGRESS");
  const [progress, setProgress] = useState(item.progress);
  const [note, setNote] = useState("");
  const [revisedDeadline, setRevisedDeadline] = useState("");
  const [evidenceLink, setEvidenceLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      let evidenceFiles;
      if (file) {
        const uploaded = await endpoints.uploadEvidence(item.id, file);
        evidenceFiles = [uploaded];
      }
      await endpoints.recordUpdate(item.id, {
        status,
        progress: status === "COMPLETED" ? 100 : progress,
        note,
        revisedDeadline: status === "OVERDUE" && revisedDeadline ? revisedDeadline : undefined,
        evidenceLink: evidenceLink || undefined,
        evidenceFiles,
      });
      flash("Action status and evidence submitted; stakeholders notified");
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Could not save this update.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Update action status" subtitle={`${item.referenceNo} · ${item.title}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-3 text-sm">
          <div>
            <small className="block text-slate-400">Action owner</small>
            <b>{item.owner.fullName}</b>
          </div>
          <div>
            <small className="block text-slate-400">Current deadline</small>
            <b>{new Date(item.deadline).toLocaleDateString()}</b>
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Status</span>
          <div className="grid grid-cols-3 gap-2">
            {STATUS_CHOICES.map((s) => (
              <button
                type="button"
                key={s.value}
                onClick={() => setStatus(s.value)}
                className={`rounded-lg border p-3 text-left text-xs transition ${
                  status === s.value
                    ? "border-brand-500 bg-brand-50 text-brand-800"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <CircleDot className="mb-1 h-3.5 w-3.5" />
                <b className="block">{s.label}</b>
                <span className="text-slate-500">{s.help}</span>
              </button>
            ))}
          </div>
        </div>

        {status !== "COMPLETED" && (
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
          {status === "OVERDUE" ? "Reason outstanding" : "Status update / remarks"}
          <textarea
            required
            className="field-input min-h-[80px]"
            placeholder={
              status === "OVERDUE"
                ? "Explain the blocker, dependency or reason for delay"
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

        <label className="field-label">
          Evidence of action taken
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 p-4">
            <Upload className="h-5 w-5 text-slate-400" />
            <div className="flex-1 text-sm">
              <input
                type="file"
                required={status === "COMPLETED"}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="mt-1 text-xs text-slate-400">PDF, Word, Excel, JPG or PNG · Maximum 20 MB</p>
            </div>
          </div>
          <small className="font-normal text-slate-400">Evidence is required when marking an action Completed.</small>
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

        <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
          <Bell className="h-4 w-4 shrink-0" />
          Chairperson, Secretary and Central Committee representative will be notified.
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <ModalActions>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Saving…" : "Save update & notify"}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}

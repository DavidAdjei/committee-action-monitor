import { FormEvent, useEffect, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { endpoints } from "@/api/endpoints";
import { useFlash } from "@/state/toastContext";
import { StatusPill } from "@/components/StatusBits";
import type { ActionListItem, Meeting } from "@/types";

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "LATEST_MEETING", label: "Latest meeting" },
  { value: "PREVIOUS_MEETING", label: "Previous meeting" },
  { value: "ALL_OPEN_ACTIONS", label: "All open actions" },
];

export function CreateMinutesModal({
  committeeId,
  committeeName,
  onClose,
  onCreated,
}: {
  committeeId: number;
  committeeName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const flash = useFlash();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingId, setMeetingId] = useState<number | "">("");
  const [source, setSource] = useState("LATEST_MEETING");
  const [actions, setActions] = useState<ActionListItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [discussion, setDiscussion] = useState("");
  const [notifyOnIssue, setNotifyOnIssue] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    endpoints.meetings(committeeId).then((m) => {
      setMeetings(m);
      if (m.length) setMeetingId(m[0].id);
    });
  }, [committeeId]);

  useEffect(() => {
    const statusFilter = source === "ALL_OPEN_ACTIONS" ? undefined : undefined;
    endpoints.actionsForCommittee(committeeId, statusFilter ? { status: statusFilter } : undefined).then((list) => {
      const eligible =
        source === "ALL_OPEN_ACTIONS"
          ? list.filter((a) => !["COMPLETED", "CANCELLED"].includes(a.status))
          : list;
      setActions(eligible);
      setSelectedIds(new Set(eligible.map((a) => a.id)));
    });
  }, [committeeId, source]);

  const toggle = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!meetingId || selectedIds.size === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const minutes = await endpoints.createMinutes(Number(meetingId), {
        sourcePopulation: source,
        discussion,
        includedActionPointIds: Array.from(selectedIds),
      });
      if (notifyOnIssue) {
        await endpoints.issueMinutes((minutes as any).id);
      }
      flash("Minutes created with linked action-point statuses");
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Could not create the minutes.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Create meeting minutes"
      subtitle={`${committeeName} · Build minutes from meeting records and action statuses`}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="field-label">
          Meeting
          <select
            required
            className="field-input"
            value={meetingId}
            onChange={(e) => setMeetingId(Number(e.target.value))}
          >
            {meetings.map((m) => (
              <option key={m.id} value={m.id}>
                {new Date(m.startsAt).toLocaleDateString()} · {m.title}
              </option>
            ))}
          </select>
        </label>

        <div>
          <b className="mb-1.5 block text-sm text-slate-700">Include action-point status from</b>
          <div className="grid grid-cols-3 gap-2">
            {SOURCE_OPTIONS.map((s) => (
              <button
                type="button"
                key={s.value}
                onClick={() => setSource(s.value)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  source === s.value
                    ? "border-brand-500 bg-brand-50 text-brand-800"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <b className="text-slate-800">Action status summary</b>
            <span className="text-slate-500">{selectedIds.size} actions selected</span>
          </div>
          <div className="max-h-52 space-y-1.5 overflow-y-auto">
            {actions.map((a) => (
              <label key={a.id} className="flex items-center gap-2.5 rounded-md p-1.5 hover:bg-slate-50">
                <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggle(a.id)} />
                <span className="flex-1 text-sm">
                  <b>
                    {a.referenceNo} · {a.title}
                  </b>
                  <br />
                  <small className="text-slate-500">
                    {a.progress}% · Owner: {a.owner.fullName}
                  </small>
                </span>
                <StatusPill status={a.status} />
              </label>
            ))}
            {actions.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No eligible actions</p>}
          </div>
        </div>

        <label className="field-label">
          Discussion, decisions and resolutions
          <textarea
            required
            className="field-input min-h-[100px]"
            placeholder="Record discussions, decisions, resolutions and any new action points"
            value={discussion}
            onChange={(e) => setDiscussion(e.target.value)}
          />
        </label>

        <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">
          <Upload className="h-4 w-4" />
          Attach draft or signed minutes (optional) — wire to SharePoint once Graph credentials are configured.
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notifyOnIssue} onChange={(e) => setNotifyOnIssue(e.target.checked)} />
          Issue immediately and notify the Chairperson, Secretary, members and action owners.
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <ModalActions>
          <button type="button" className="btn" onClick={onClose}>
            Save draft
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            <FileText className="h-4 w-4" /> {submitting ? "Saving…" : "Create minutes"}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}

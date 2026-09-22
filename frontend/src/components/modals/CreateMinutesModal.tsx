import { FormEvent, useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { endpoints } from "@/api/endpoints";
import { ApiClientError } from "@/api/client";
import { useFlash } from "@/state/toastContext";
import { useAuth } from "@/state/authContext";
import { canCreateMinutes } from "@/lib/permissions";
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
  onCreated: (minutesId?: number) => void;
}) {
  const flash = useFlash();
  const { me } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingId, setMeetingId] = useState<number | "">("");
  const [source, setSource] = useState("LATEST_MEETING");
  const [actions, setActions] = useState<ActionListItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [discussion, setDiscussion] = useState("");
  const [decisions, setDecisions] = useState("");
  const [resolutions, setResolutions] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [submitting, setSubmitting] = useState<"draft" | "issue" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [attendance, setAttendance] = useState<{ fullName: string; method: string }[]>([]);
  const [meetingMeta, setMeetingMeta] = useState<{ title: string; reference: string; startsAt: string } | null>(null);

  useEffect(() => {
    endpoints.meetings(committeeId).then((m) => {
      setMeetings(m);
      if (m.length) setMeetingId(m[0].id);
    });
  }, [committeeId]);

  useEffect(() => {
    if (!meetingId) {
      setAttendance([]);
      setMeetingMeta(null);
      return;
    }
    endpoints
      .meetingDetail(Number(meetingId))
      .then((d: any) => {
        setMeetingMeta({ title: d.title, reference: d.reference, startsAt: d.startsAt });
        setAttendance(
          (d.attendance ?? []).map((a: any) => ({ fullName: a.fullName, method: a.method })),
        );
      })
      .catch(() => {
        setAttendance([]);
        setMeetingMeta(null);
      });
  }, [meetingId]);

  useEffect(() => {
    endpoints.actionsForCommittee(committeeId).then((list) => {
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

  const composeDiscussion = () => {
    const parts: string[] = [];
    if (discussion.trim()) parts.push(`Discussion:\n${discussion.trim()}`);
    if (decisions.trim()) parts.push(`Decisions:\n${decisions.trim()}`);
    if (resolutions.trim()) parts.push(`Resolutions:\n${resolutions.trim()}`);
    return parts.join("\n\n");
  };

  const save = async (mode: "draft" | "issue") => {
    if (!meetingId || selectedIds.size === 0) {
      setError("Select a meeting and at least one action point.");
      return;
    }
    if (!canCreateMinutes(me, committeeId)) {
      setError("Only the committee Chairperson or Secretary may create minutes.");
      return;
    }
    const bodyDiscussion = composeDiscussion();
    if (!bodyDiscussion) {
      setError("Enter discussion, decisions or resolutions.");
      return;
    }

    setSubmitting(mode);
    setError(null);
    try {
      const minutes = await endpoints.createMinutes(Number(meetingId), {
        sourcePopulation: source,
        discussion: bodyDiscussion,
        includedActionPointIds: Array.from(selectedIds),
        documentUrl: documentUrl.trim() || undefined,
      });
      if (mode === "issue") {
        await endpoints.issueMinutes(minutes.id, {
          documentUrl: documentUrl.trim() || undefined,
        });
        flash("Minutes issued — stakeholders notified");
      } else {
        flash("Draft minutes saved with action-status snapshots");
      }
      onCreated(minutes.id);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.isForbidden) {
        setError("You are not authorized to create minutes for this committee.");
      } else {
        setError((err as Error)?.message ?? "Could not create the minutes.");
      }
    } finally {
      setSubmitting(null);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void save("issue");
  };

  return (
    <Modal
      title="Create meeting minutes"
      subtitle={`${committeeName} · Capture discussion and freeze action statuses`}
      onClose={onClose}
      wide
    >
      <form onSubmit={onSubmit} className="space-y-4">
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
          <b className="mb-1.5 block text-sm text-slate-700 dark:text-slate-300">Include action-point status from</b>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {SOURCE_OPTIONS.map((s) => (
              <button
                type="button"
                key={s.value}
                onClick={() => setSource(s.value)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  source === s.value
                    ? "border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200"
                    : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-600"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div className="mb-2 flex items-center justify-between text-sm">
            <b className="text-slate-800 dark:text-slate-100">Action status summary</b>
            <span className="text-slate-500">{selectedIds.size} actions selected</span>
          </div>
          <div className="max-h-52 space-y-1.5 overflow-y-auto">
            {actions.map((a) => (
              <label key={a.id} className="flex items-center gap-2.5 rounded-md p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/60 dark:hover:bg-slate-800">
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
          <p className="mt-2 text-[11px] text-slate-400">
            Selected statuses are stored as immutable snapshots when minutes are created.
          </p>
        </div>

        <label className="field-label">
          Discussion
          <textarea
            className="field-input min-h-[72px]"
            placeholder="Key points raised in the meeting"
            value={discussion}
            onChange={(e) => setDiscussion(e.target.value)}
          />
        </label>
        <label className="field-label">
          Decisions
          <textarea
            className="field-input min-h-[64px]"
            placeholder="Decisions agreed by the committee"
            value={decisions}
            onChange={(e) => setDecisions(e.target.value)}
          />
        </label>
        <label className="field-label">
          Resolutions
          <textarea
            className="field-input min-h-[64px]"
            placeholder="Formal resolutions and follow-ups"
            value={resolutions}
            onChange={(e) => setResolutions(e.target.value)}
          />
        </label>

        <label className="field-label">
          Minutes document URL (optional)
          <input
            type="url"
            className="field-input"
            placeholder="https://sharepoint.example/… or controlled document link"
            value={documentUrl}
            onChange={(e) => setDocumentUrl(e.target.value)}
          />
          <small className="font-normal text-slate-400">
            Attach a SharePoint / controlled link. Template generation can fill this later.
          </small>
        </label>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="button"
          className="text-xs font-semibold text-brand-700 dark:text-brand-300 hover:underline"
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? "Hide" : "Show"} minutes email preview
        </button>

        {showPreview && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm shadow-inner dark:border-slate-600 dark:bg-slate-900">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Email / issued minutes layout
            </p>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 dark:text-white">
              {meetingMeta?.title ?? "Meeting minutes"}
            </h3>
            <p className="text-xs text-slate-500">
              {meetingMeta?.reference ?? "—"} ·{" "}
              {meetingMeta ? new Date(meetingMeta.startsAt).toLocaleString() : "—"} · {committeeName}
            </p>
            <hr className="my-3 border-slate-200 dark:border-slate-700" />
            <h4 className="font-semibold text-slate-800 dark:text-slate-100">1. Attendance</h4>
            <p className="mb-1 text-[11px] text-brand-700 dark:text-brand-300">
              When minutes are issued by email, the full attendance register is attached as a CSV file.
            </p>
            {attendance.length === 0 ? (
              <p className="text-xs text-slate-400">No attendance recorded for this meeting yet.</p>
            ) : (
              <ul className="mb-3 list-inside list-disc text-xs text-slate-600 dark:text-slate-300">
                {attendance.map((a, i) => (
                  <li key={i}>
                    {a.fullName} <span className="text-slate-400">({a.method})</span>
                  </li>
                ))}
              </ul>
            )}
            <h4 className="font-semibold text-slate-800 dark:text-slate-100">2. Discussion</h4>
            <p className="mb-2 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300">
              {discussion || "—"}
            </p>
            <h4 className="font-semibold text-slate-800 dark:text-slate-100">3. Decisions</h4>
            <p className="mb-2 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300">
              {decisions || "—"}
            </p>
            <h4 className="font-semibold text-slate-800 dark:text-slate-100">4. Resolutions</h4>
            <p className="mb-2 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300">
              {resolutions || "—"}
            </p>
            <h4 className="font-semibold text-slate-800 dark:text-slate-100">5. Action points</h4>
            <ul className="list-inside list-disc text-xs text-slate-600 dark:text-slate-300">
              {actions
                .filter((a) => selectedIds.has(a.id))
                .map((a) => (
                  <li key={a.id}>
                    {a.referenceNo} — {a.title} (Owner: {a.owner.fullName}, {a.progress}%, {a.status})
                  </li>
                ))}
            </ul>
          </div>
        )}

        <ModalActions>
          <button type="button" className="btn" onClick={onClose} disabled={!!submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={!!submitting}
            onClick={() => void save("draft")}
          >
            {submitting === "draft" ? "Saving…" : "Save draft"}
          </button>
          <button type="submit" className="btn-primary" disabled={!!submitting}>
            <FileText className="h-4 w-4" />
            {submitting === "issue" ? "Issuing…" : "Create & issue"}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}

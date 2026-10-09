import { FormEvent, useEffect, useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { MultiStakeholderPicker } from "@/components/MultiStakeholderPicker";
import { endpoints } from "@/api/endpoints";
import { useFlash } from "@/state/toastContext";
import { useAuth } from "@/state/authContext";
import { canCreateAction } from "@/lib/permissions";
import { ApiClientError } from "@/api/client";
import type { DirectoryUser, Meeting } from "@/types";

export function NewActionModal({
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
  const { me } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingId, setMeetingId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [owners, setOwners] = useState<DirectoryUser[]>([]);
  const [deadline, setDeadline] = useState("");
  const [minutesReference, setMinutesReference] = useState("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");
  const [stakeholders, setStakeholders] = useState<DirectoryUser[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownerIds = useMemo(() => owners.map((o) => o.id), [owners]);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const meetingData = await endpoints.meetings(committeeId);
        if (!cancelled) setMeetings(meetingData);
      } catch (err: unknown) {
        if (!cancelled) {
          setError((err as Error)?.message ?? "Could not load form data.");
        }
      }
    };

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [committeeId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!meetingId || !deadline) return;
    if (owners.length === 0) {
      setError("Select at least one action owner.");
      return;
    }
    if (!canCreateAction(me, committeeId)) {
      setError("Only the committee Chairperson or Secretary may create action points.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const ids = owners.map((o) => o.id);
      await endpoints.createAction(committeeId, {
        meetingId: Number(meetingId),
        title,
        description: description || undefined,
        ownerId: ids[0],
        ownerIds: ids,
        deadline,
        priority,
        minutesReference: minutesReference || undefined,
        additionalStakeholderIds: stakeholders.map((s) => s.id),
      });
      const n = owners.length;
      flash(
        `Action point saved. Email queued to ${n} owner${n === 1 ? "" : "s"}` +
          ` (To: owners · Cc: secretary and Central Committee distribution list when set).` +
          ` In-app notice also goes to other stakeholders.`,
      );
      onCreated();
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.isForbidden) {
        setError(
          err.message && err.message !== "Forbidden"
            ? err.message
            : "Only the committee Chairperson or Secretary may create action points.",
        );
      } else {
        setError(
          err instanceof ApiClientError
            ? err.message
            : (err as Error)?.message ?? "Could not save the action point.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Create action point"
      subtitle="Capture an agreed commitment from a specific committee meeting."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="field-label">
          Action point
          <textarea
            required
            className="field-input min-h-[70px]"
            placeholder="State the agreed deliverable clearly"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="field-label">
            Committee
            <input className="field-input bg-slate-50 text-slate-500" value={committeeName} readOnly />
            <small className="font-normal text-slate-400">Fixed to the currently selected workspace.</small>
          </label>
          <label className="field-label">
            Meeting
            <select
              required
              className="field-input"
              value={meetingId}
              onChange={(e) => setMeetingId(Number(e.target.value))}
            >
              <option value="" disabled>
                Select the originating meeting
              </option>
              {meetings.map((m) => (
                <option key={m.id} value={m.id}>
                  {new Date(m.startsAt).toLocaleDateString()} · {m.title} · {m.reference}
                </option>
              ))}
            </select>
            <small className="font-normal text-slate-400">Every action point must be linked to one meeting.</small>
          </label>
        </div>

        <MultiStakeholderPicker
          label="Action owners"
          helpText="Type to search the directory. Add one or more people responsible for this action. The first selected is stored as the primary owner."
          selected={owners}
          onChange={setOwners}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="field-label">
            Deadline
            <input
              type="date"
              required
              className="field-input"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </label>
        </div>

        <label className="field-label">
          Priority
          <select
            className="field-input"
            value={priority}
            onChange={(e) => setPriority(e.target.value as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL")}
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
          <small className="font-normal text-slate-400">
            Used on the Central Committee dashboard and escalation radar.
          </small>
        </label>

        <label className="field-label">
          Minutes paragraph / reference
          <input
            required
            className="field-input"
            placeholder="e.g. Item 5.2"
            value={minutesReference}
            onChange={(e) => setMinutesReference(e.target.value)}
          />
        </label>

        <MultiStakeholderPicker
          label="Additional stakeholders"
          helpText="Optional people to notify who are not action owners."
          selected={stakeholders}
          onChange={setStakeholders}
          excludeIds={ownerIds}
        />

        <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-950 dark:text-blue-200">
          <ListChecks className="h-4 w-4 shrink-0" />
          The meeting reference, meeting date and minutes item will be retained with this action throughout its
          lifecycle.
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <p className="text-xs text-slate-500">
          Email: <strong>To</strong> action owners · <strong>Cc</strong> committee secretary and Central Committee
          distribution list (when set).
        </p>
        <ModalActions>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitting || owners.length === 0}>
            {submitting ? "Saving…" : "Save & notify"}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}

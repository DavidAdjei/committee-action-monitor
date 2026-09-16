import { FormEvent, useEffect, useState } from "react";
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
  const [owner, setOwner] = useState<DirectoryUser | null>(null);
  const [ownerCandidates, setOwnerCandidates] = useState<DirectoryUser[]>([]);
  const [dateRaised, setDateRaised] = useState(() => new Date().toISOString().slice(0, 10));
  const [deadline, setDeadline] = useState("");
  const [minutesReference, setMinutesReference] = useState("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");
  const [stakeholders, setStakeholders] = useState<DirectoryUser[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const [meetingData, directoryData] = await Promise.all([
          endpoints.meetings(committeeId),
          endpoints.directory(""),
        ]);

        if (!cancelled) {
          setMeetings(meetingData);
          setOwnerCandidates(directoryData);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message ?? "Could not load form data.");
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [committeeId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!meetingId || !owner || !deadline) return;
    if (!canCreateAction(me, committeeId)) {
      setError("Only the committee Chairperson or Secretary may create action points.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await endpoints.createAction(committeeId, {
        meetingId: Number(meetingId),
        title,
        description: description || undefined,
        ownerId: owner.id,
        dateRaised,
        deadline,
        priority,
        minutesReference: minutesReference || undefined,
        additionalStakeholderIds: stakeholders.map((s) => s.id),
      });
      flash("Action point saved and stakeholders notified");
      onCreated();
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.isForbidden) {
        setError("You are not authorized to create action points in this committee.");
      } else {
        setError((err as Error)?.message ?? "Could not save the action point.");
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

        <label className="field-label">
          Action owner
          <select
            required
            className="field-input"
            value={owner?.id ?? ""}
            onChange={(e) => setOwner(ownerCandidates.find((c) => c.id === Number(e.target.value)) ?? null)}
          >
            <option value="">Search or select from Entra ID</option>
            {ownerCandidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName} · {c.department}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="field-label">
            Date raised
            <input
              type="date"
              required
              className="field-input"
              value={dateRaised}
              onChange={(e) => setDateRaised(e.target.value)}
            />
          </label>
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
          <small className="font-normal text-slate-400">Used on the Central Committee dashboard and escalation radar.</small>
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

        <MultiStakeholderPicker selected={stakeholders} onChange={setStakeholders} />

        <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
          <ListChecks className="h-4 w-4 shrink-0" />
          The meeting reference, meeting date and minutes item will be retained with this action throughout its
          lifecycle.
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <ModalActions>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Saving…" : "Save & notify"}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}

import { FormEvent, useState } from "react";
import { Video } from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { endpoints } from "@/api/endpoints";
import { useFlash } from "@/state/toastContext";

export function CreateMeetingModal({
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
  const [reference, setReference] = useState("");
  const [title, setTitle] = useState("October Committee Meeting");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [venue, setVenue] = useState("Board Room, Head Office");
  const [agenda, setAgenda] = useState("");
  const [teams, setTeams] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!date) return;
    setSubmitting(true);
    setError(null);
    try {
      await endpoints.createMeeting(committeeId, {
        reference: reference.trim() || undefined,
        title,
        startsAt: new Date(`${date}T${startTime}:00`).toISOString(),
        endsAt: new Date(`${date}T${endTime}:00`).toISOString(),
        venue,
        agenda,
        teamsRequested: teams,
      });
      flash(
        teams
          ? "Meeting saved — Microsoft Teams online meeting will be created by the integration worker"
          : "Meeting created and stakeholders notified",
      );
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Could not save the meeting.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Create committee meeting"
      subtitle={`${committeeName} · Chairperson and Secretary only`}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="field-label">
            Meeting title
            <input required className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field-label">
            Meeting reference
            <input
              className="field-input placeholder:text-slate-400"
              placeholder="Auto-generated (e.g. MIN/ISC/09/26)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <small className="font-normal text-slate-400">
              Leave blank to auto-generate institutional reference.
            </small>
          </label>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <label className="field-label">
            Date
            <input type="date" required className="field-input" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field-label">
            Start time
            <input
              type="time"
              required
              className="field-input"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </label>
          <label className="field-label">
            End time
            <input
              type="time"
              required
              className="field-input"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </label>
        </div>
        <label className="field-label">
          Venue
          <input className="field-input" value={venue} onChange={(e) => setVenue(e.target.value)} />
        </label>
        <label className="field-label">
          Agenda
          <textarea
            required
            className="field-input min-h-[90px]"
            placeholder="Enter agenda items, one per line"
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
          />
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
          <input type="checkbox" className="mt-1" checked={teams} onChange={(e) => setTeams(e.target.checked)} />
          <Video className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <span className="text-sm">
            <b className="block text-slate-800">Create an online Microsoft Teams meeting</b>
            <small className="text-slate-500">
              Requires the Bank's Microsoft 365 connection. Attendees will receive the Teams invitation after
              authorization.
            </small>
          </span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <ModalActions>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Saving…" : "Save meeting"}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}

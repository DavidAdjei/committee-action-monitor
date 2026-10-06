import { FormEvent, useState } from "react";
import { FileUp, Video, X } from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { endpoints } from "@/api/endpoints";
import { useFlash } from "@/state/toastContext";
import { useAuth } from "@/state/authContext";
import { canCreateMeeting } from "@/lib/permissions";
import { ApiClientError } from "@/api/client";

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
  const { me } = useAuth();
  const [reference, setReference] = useState("");
  const [title, setTitle] = useState("October Committee Meeting");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [venue, setVenue] = useState("Board Room, Head Office");
  const [agenda, setAgenda] = useState("");
  const [teams, setTeams] = useState(true);
  const [papers, setPapers] = useState<File[]>([]);
  const [notifyPapers, setNotifyPapers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canCreateMeeting(me, committeeId)) {
      setError("Only the committee Chairperson or Secretary may create meetings.");
      return;
    }
    if (!date) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await endpoints.createMeeting(committeeId, {
        reference: reference.trim() || undefined,
        title,
        startsAt: new Date(`${date}T${startTime}:00`).toISOString(),
        endsAt: new Date(`${date}T${endTime}:00`).toISOString(),
        venue,
        agenda,
        teamsRequested: teams,
      });
      const meetingId = (created as { id: number }).id;
      const provisioned = Boolean(
        (created as { teamsProvisioned?: boolean }).teamsProvisioned ||
          (created as { teamsJoinUrl?: string | null }).teamsJoinUrl,
      );
      const teamsAuthMode = (created as { teamsAuthMode?: string | null }).teamsAuthMode;
      const teamsAttempted = Boolean((created as { teamsAttempted?: boolean }).teamsAttempted);
      const teamsError = (created as { teamsError?: string | null }).teamsError;

      for (const file of papers) {
        await endpoints.uploadMeetingPaper(meetingId, file);
      }

      if (notifyPapers) {
        try {
          await endpoints.notifyMeetingPapers(meetingId);
        } catch {
          // Meeting is saved; email is best-effort
        }
      }


      if (teams) {
        if (provisioned) {
          flash(
            papers.length
              ? `Meeting created with Teams link (${teamsAuthMode ?? "ok"}); papers uploaded`
              : `Meeting created with Microsoft Teams join link (${teamsAuthMode ?? "ok"})`,
          );
        } else {
          const detail = teamsError
            ? teamsError.slice(0, 280)
            : teamsAttempted
              ? "Teams provisioning ran but returned no join URL."
              : "Teams provisioning did not run (check teamsRequested / API logs).";
          flash(
            `Meeting saved in CAM, but Teams was not created. ${detail}`,
            "error",
          );
        }
      } else {
        flash(papers.length ? "Meeting created; papers uploaded" : "Meeting created successfully");
      }
      onCreated();
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.isForbidden) {
        setError("You are not authorized to create meetings in this committee.");
      } else {
        setError((err as Error)?.message ?? "Could not save the meeting.");
      }
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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

        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-600">
          <input
            type="checkbox"
            className="mt-1"
            checked={teams}
            onChange={(e) => setTeams(e.target.checked)}
          />
          <Video className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <span className="text-sm">
            <b className="block text-slate-800 dark:text-slate-100">Create an online Microsoft Teams meeting</b>
            <small className="text-slate-500">
              Creates a Teams join link for this meeting. Committee officers and active members are added as
              attendees. Uses your Microsoft account (OnlineMeetings.ReadWrite); falls back to app permissions if
              needed.
            </small>
          </span>
        </label>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Meeting papers</p>
          <p className="text-xs text-slate-500">
            Optional agenda pack or supporting documents. These can be emailed to committee members after
            creation.
          </p>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center dark:border-slate-600 dark:bg-slate-900/40">
            <FileUp className="h-7 w-7 text-brand-600 dark:text-brand-400" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Add PDF, Word or Excel files
            </span>
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => {
                const list = e.target.files ? Array.from(e.target.files) : [];
                setPapers((prev) => [...prev, ...list]);
                e.target.value = "";
              }}
            />
          </label>
          {papers.length > 0 && (
            <ul className="space-y-1">
              {papers.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between rounded-md bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-800"
                >
                  <span className="truncate font-medium">
                    {f.name}{" "}
                    <span className="font-normal text-slate-400">({Math.round(f.size / 1024)} KB)</span>
                  </span>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-600"
                    onClick={() => setPapers((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              className="mt-1"
              checked={notifyPapers}
              onChange={(e) => setNotifyPapers(e.target.checked)}
            />
            Email invitation to committee stakeholders (chair, secretary, members) after save — includes Teams link and any papers
          </label>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

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

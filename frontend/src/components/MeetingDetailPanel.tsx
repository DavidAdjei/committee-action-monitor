import { useEffect, useState } from "react";
import { Calendar, ExternalLink, Loader2, MapPin, Video } from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { StatusPill, formatDate } from "@/components/StatusBits";
import { endpoints } from "@/api/endpoints";
import { ApiClientError } from "@/api/client";
import { useFlash } from "@/state/toastContext";

interface MeetingDetail {
  id: number;
  committeeId: number;
  committee: { id: number; name: string; code: string };
  reference: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venue: string | null;
  agenda: string | null;
  teamsRequested: boolean;
  teamsJoinUrl: string | null;
  createdBy: { id: number; fullName: string };
  createdAt: string;
  minutes: { id: number; status: string; createdAt: string; issuedAt: string | null }[];
  actionPoints: {
    id: number;
    referenceNo: string;
    title: string;
    status: string;
    progress: number;
    owner: { id: number; fullName: string };
  }[];
}

export function MeetingDetailPanel({
  meetingId,
  onClose,
  onOpenAction,
  onOpenMinutes,
}: {
  meetingId: number;
  onClose: () => void;
  onOpenAction?: (actionId: number) => void;
  onOpenMinutes?: (minutesId: number) => void;
}) {
  const flash = useFlash();
  const [detail, setDetail] = useState<MeetingDetail | null>(null);

  useEffect(() => {
    endpoints
      .meetingDetail(meetingId)
      .then((d) => setDetail(d as MeetingDetail))
      .catch((err: unknown) => {
        flash(err instanceof ApiClientError ? err.message : "Could not load meeting.", "error");
        onClose();
      });
  }, [meetingId]);

  if (!detail) {
    return (
      <Modal title="Meeting" onClose={onClose} wide>
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading meeting…
        </p>
      </Modal>
    );
  }

  const start = new Date(detail.startsAt);
  const end = detail.endsAt ? new Date(detail.endsAt) : null;

  return (
    <Modal title={detail.title} subtitle={`${detail.reference} · ${detail.committee.name}`} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2 dark:bg-slate-800/50">
          <div className="flex items-start gap-2">
            <Calendar className="mt-0.5 h-4 w-4 text-slate-400" />
            <div>
              <small className="block text-slate-400">When</small>
              <b>
                {start.toLocaleString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {end && (
                  <>
                    {" – "}
                    {end.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </>
                )}
              </b>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 text-slate-400" />
            <div>
              <small className="block text-slate-400">Venue</small>
              <b>{detail.venue || "—"}</b>
            </div>
          </div>
          <div>
            <small className="block text-slate-400">Created by</small>
            <b>{detail.createdBy.fullName}</b>
            <span className="text-xs text-slate-400"> · {formatDate(detail.createdAt)}</span>
          </div>
          {detail.teamsJoinUrl && (
            <div>
              <small className="block text-slate-400">Teams</small>
              <a
                href={detail.teamsJoinUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-brand-700 dark:text-brand-300 hover:underline"
              >
                <Video className="h-4 w-4" /> Join online meeting
              </a>
            </div>
          )}
        </div>

        {detail.agenda && (
          <div>
            <b className="mb-1.5 block text-sm text-slate-800 dark:text-slate-100">Agenda</b>
            <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
              {detail.agenda}
            </div>
          </div>
        )}

        <div>
          <b className="mb-1.5 block text-sm text-slate-800 dark:text-slate-100">
            Linked action points ({detail.actionPoints.length})
          </b>
          {detail.actionPoints.length === 0 ? (
            <p className="text-sm text-slate-400">No action points raised from this meeting yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
              {detail.actionPoints.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                    onClick={() => onOpenAction?.(a.id)}
                  >
                    <span>
                      <b className="text-slate-800 dark:text-slate-100">
                        {a.referenceNo} · {a.title}
                      </b>
                      <span className="block text-xs text-slate-400">
                        {a.owner.fullName} · {a.progress}%
                      </span>
                    </span>
                    <StatusPill status={a.status as any} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <b className="mb-1.5 block text-sm text-slate-800 dark:text-slate-100">
            Minutes ({detail.minutes.length})
          </b>
          {detail.minutes.length === 0 ? (
            <p className="text-sm text-slate-400">No minutes recorded for this meeting yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {detail.minutes.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-brand-300 dark:border-slate-700"
                    onClick={() => onOpenMinutes?.(m.id)}
                  >
                    <span>
                      Status <b>{m.status}</b>
                      <span className="text-xs text-slate-400"> · Created {formatDate(m.createdAt)}</span>
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ModalActions>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </ModalActions>
    </Modal>
  );
}

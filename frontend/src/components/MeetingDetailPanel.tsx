import { useEffect, useMemo, useState } from "react";
import { Calendar, ExternalLink, Loader2, MapPin, QrCode, Upload, Users, Video } from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { StatusPill, formatDate } from "@/components/StatusBits";
import { endpoints } from "@/api/endpoints";
import { ApiClientError } from "@/api/client";
import { useFlash } from "@/state/toastContext";
import { useAuth } from "@/state/authContext";
import { canCreateMeeting } from "@/lib/permissions";
import { PreviewMinutesButton } from "@/components/MinutesDocumentPreview";

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
  attendanceToken?: string;
  attendanceSheetUrl?: string | null;
  outcome?: "SCHEDULED" | "HELD" | "DID_NOT_HOLD" | "POSTPONED";
  outcomeReason?: string | null;
  postponedTo?: string | null;
  outcomeRecordedAt?: string | null;
  outcomeRecordedBy?: { id: number; fullName: string } | null;
  attendance: {
    userId: number;
    fullName: string;
    email: string;
    department?: string | null;
    method: string;
    markedAt: string;
    note?: string | null;
  }[];
  createdBy: { id: number; fullName: string };
  createdAt: string;
  minutes: {
    id: number;
    status: string;
    filename?: string | null;
    mediaType?: string | null;
    sizeBytes?: number | null;
    hasFile?: boolean;
    createdAt: string;
    createdBy?: { id: number; fullName: string };
  }[];
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
  const { me } = useAuth();
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const [showOutcome, setShowOutcome] = useState(false);
  const [outcomeType, setOutcomeType] = useState<"DID_NOT_HOLD" | "POSTPONED" | "HELD">("DID_NOT_HOLD");
  const [outcomeReason, setOutcomeReason] = useState("");
  const [postponeDate, setPostponeDate] = useState("");
  const [postponeTime, setPostponeTime] = useState("10:00");
  const [minutesKind, setMinutesKind] = useState<"DRAFT" | "FINAL">("DRAFT");
  const [minutesFile, setMinutesFile] = useState<File | null>(null);
  const [minutesBusy, setMinutesBusy] = useState(false);

  const load = () =>
    endpoints.meetingDetail(meetingId).then((d) => {
      const m = d as MeetingDetail;
      setDetail(m);
      setSheetUrl(m.attendanceSheetUrl ?? "");
    });

  useEffect(() => {
    load().catch((err: unknown) => {
      flash(err instanceof ApiClientError ? err.message : "Could not load meeting.", "error");
      onClose();
    });
  }, [meetingId]);

  const canManage = detail ? canCreateMeeting(me, detail.committeeId) : false;

  const checkInUrl = useMemo(() => {
    if (!detail?.attendanceToken) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/meetings/${detail.id}/check-in?token=${detail.attendanceToken}`;
  }, [detail]);

  const qrSrc = checkInUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(checkInUrl)}`
    : "";

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

  const saveSheet = async () => {
    if (!sheetUrl.trim()) return;
    setBusy(true);
    try {
      await endpoints.setAttendanceSheet(detail.id, sheetUrl.trim());
      flash("Attendance sheet link saved");
      await load();
    } catch (err: unknown) {
      flash(err instanceof ApiClientError ? err.message : "Could not save sheet.", "error");
    } finally {
      setBusy(false);
    }
  };

  const checkInSelf = async () => {
    if (!detail.attendanceToken) return;
    setBusy(true);
    try {
      await endpoints.attendanceCheckIn(detail.id, { token: detail.attendanceToken, method: "QR" });
      flash("Attendance recorded");
      await load();
    } catch (err: unknown) {
      flash(err instanceof ApiClientError ? err.message : "Check-in failed.", "error");
    } finally {
      setBusy(false);
    }
  };

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
          {detail.teamsJoinUrl ? (
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
          ) : detail.teamsRequested ? (
            <div>
              <small className="block text-slate-400">Teams</small>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Online meeting was requested but no join link was created. Check API logs for Graph
                errors (consent, Teams license, or application access policy).
              </p>
            </div>
          ) : null}
        </div>

        {detail.agenda && (
          <div>
            <b className="mb-1.5 block text-sm text-slate-800 dark:text-slate-100">Agenda</b>
            <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
              {detail.agenda}
            </div>
          </div>
        )}

        {/* Attendance */}
        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500" />
            <b className="text-sm text-slate-800 dark:text-slate-100">
              Attendance ({detail.attendance?.length ?? 0})
            </b>
          </div>

          {canManage && detail.attendanceToken && (
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr]">
              <div className="flex flex-col items-center gap-2 rounded-lg bg-white p-3 dark:bg-slate-900">
                <img src={qrSrc} alt="Attendance QR code" className="h-[180px] w-[180px] rounded border border-slate-200" />
                <span className="flex items-center gap-1 text-[11px] text-slate-500">
                  <QrCode className="h-3.5 w-3.5" /> Scan to check in
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <p className="text-slate-600 dark:text-slate-300">
                  Display this QR at the meeting. Authenticated members scan it to mark attendance.
                </p>
                <code className="block break-all rounded bg-slate-100 p-2 text-[11px] dark:bg-slate-800">{checkInUrl}</code>
                <button type="button" className="btn text-xs" disabled={busy} onClick={checkInSelf}>
                  Record my attendance
                </button>
              </div>
            </div>
          )}

          {canManage && (
            <div className="mb-3 space-y-2">
              <label className="field-label">
                Attendance sheet URL (optional)
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    className="field-input flex-1"
                    placeholder="https://sharepoint…/attendance.xlsx"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                  />
                  <button type="button" className="btn text-xs" disabled={busy || !sheetUrl.trim()} onClick={saveSheet}>
                    <Upload className="h-3.5 w-3.5" /> Save link
                  </button>
                </div>
              </label>
              {detail.attendanceSheetUrl && (
                <a
                  href={detail.attendanceSheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open current attendance sheet
                </a>
              )}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn text-xs"
              onClick={() => setShowAttendance((v) => !v)}
            >
              {showAttendance ? "Hide attendance" : "View attendance"}
              <span className="text-slate-400">({detail.attendance?.length ?? 0})</span>
            </button>
          </div>

          {showAttendance && (
            <div className="mt-3">
              {(detail.attendance?.length ?? 0) === 0 ? (
                <p className="text-sm text-slate-400">No attendance recorded yet.</p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                  {detail.attendance.map((a) => (
                    <li
                      key={a.userId}
                      className="flex items-center justify-between rounded-md border border-slate-100 dark:border-slate-700 px-2 py-1.5 dark:border-slate-800"
                    >
                      <span>
                        <b>{a.fullName}</b>
                        <span className="text-xs text-slate-400"> · {a.method}</span>
                      </span>
                      <span className="text-xs text-slate-400">{new Date(a.markedAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div>
          <b className="mb-1.5 block text-sm text-slate-800 dark:text-slate-100">
            Linked action points ({detail.actionPoints.length})
          </b>
          {detail.actionPoints.length === 0 ? (
            <p className="text-sm text-slate-400">No action points raised from this meeting yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
              {detail.actionPoints.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50"
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
          <b className="mb-1.5 block text-sm text-slate-800 dark:text-slate-100">Meeting outcome</b>
          <p className="mb-2 text-xs text-slate-500">
            Current:{" "}
            <b className="text-slate-800 dark:text-slate-100">{detail.outcome ?? "SCHEDULED"}</b>
            {detail.outcomeReason ? ` — ${detail.outcomeReason}` : ""}
            {detail.postponedTo ? ` · New date ${formatDate(detail.postponedTo)}` : ""}
          </p>
          {canManage && (
            <button type="button" className="btn text-sm" onClick={() => setShowOutcome((v) => !v)}>
              {showOutcome ? "Hide outcome form" : "Record did not hold / postpone"}
            </button>
          )}
          {showOutcome && canManage && (
            <div className="mt-3 space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["DID_NOT_HOLD", "Did not hold"],
                    ["POSTPONED", "Postponed"],
                    ["HELD", "Held as planned"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                      outcomeType === v
                        ? "border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/20"
                        : "border-slate-200 dark:border-slate-600"
                    }`}
                    onClick={() => setOutcomeType(v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="field-label">
                Reason
                <textarea
                  className="field-input min-h-[60px]"
                  required
                  placeholder="Why the meeting did not proceed, or postponement rationale"
                  value={outcomeReason}
                  onChange={(e) => setOutcomeReason(e.target.value)}
                />
              </label>
              {outcomeType === "POSTPONED" && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="field-label">
                    New date
                    <input
                      type="date"
                      className="field-input"
                      required
                      value={postponeDate}
                      onChange={(e) => setPostponeDate(e.target.value)}
                    />
                  </label>
                  <label className="field-label">
                    New start time
                    <input
                      type="time"
                      className="field-input"
                      value={postponeTime}
                      onChange={(e) => setPostponeTime(e.target.value)}
                    />
                  </label>
                </div>
              )}
              <button
                type="button"
                className="btn-primary text-sm"
                disabled={busy}
                onClick={() => {
                  if (!outcomeReason.trim()) {
                    flash("A reason is required.", "error");
                    return;
                  }
                  if (outcomeType === "POSTPONED" && !postponeDate) {
                    flash("Choose a new meeting date.", "error");
                    return;
                  }
                  setBusy(true);
                  void endpoints
                    .recordMeetingOutcome(meetingId, {
                      outcome: outcomeType,
                      reason: outcomeReason.trim(),
                      postponedTo:
                        outcomeType === "POSTPONED"
                          ? new Date(`${postponeDate}T${postponeTime || "10:00"}:00`).toISOString()
                          : undefined,
                    })
                    .then(() => {
                      flash("Meeting outcome recorded");
                      setShowOutcome(false);
                      setOutcomeReason("");
                      return load();
                    })
                    .catch((err: unknown) =>
                      flash(err instanceof ApiClientError ? err.message : "Could not save outcome.", "error"),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                {busy ? "Saving…" : "Save outcome"}
              </button>
            </div>
          )}
        </div>

        <div>
          <b className="mb-1.5 block text-sm text-slate-800 dark:text-slate-100">
            Minutes documents ({detail.minutes.length})
          </b>
          <p className="mb-2 text-xs text-slate-500">
            One <b>draft</b> (Word or PDF) and one <b>final</b> (PDF only) per meeting. Uploading again replaces that
            type.
          </p>
          {detail.minutes.length === 0 ? (
            <p className="text-sm text-slate-400">No minutes documents uploaded yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {detail.minutes.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                >
                  <span>
                    <b className="text-slate-800 dark:text-slate-100">{m.status}</b>
                    {m.filename ? ` · ${m.filename}` : ""}
                    <span className="block text-xs text-slate-400">
                      {m.createdBy?.fullName ? `${m.createdBy.fullName} · ` : ""}
                      {formatDate(m.createdAt)}
                      {m.sizeBytes != null ? ` · ${Math.round(m.sizeBytes / 1024)} KB` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {m.hasFile && (
                      <>
                        <PreviewMinutesButton
                          minutesId={m.id}
                          filename={m.filename}
                          mediaType={m.mediaType}
                          hasFile
                          className="btn text-xs"
                        />
                        <button
                          type="button"
                          className="btn text-xs"
                          onClick={() =>
                            void endpoints
                              .downloadMinutesDocument(m.id, m.filename ?? undefined)
                              .catch((err: unknown) =>
                                flash(
                                  err instanceof ApiClientError ? err.message : "Download failed.",
                                  "error",
                                ),
                              )
                          }
                        >
                          Download
                        </button>
                      </>
                    )}
                    {onOpenMinutes && (
                      <button type="button" className="btn text-xs" onClick={() => onOpenMinutes(m.id)}>
                        Open
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {canManage && (
            <div className="mt-3 space-y-2 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-600">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                    minutesKind === "DRAFT"
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-500/20"
                      : "border-slate-200 dark:border-slate-600"
                  }`}
                  onClick={() => setMinutesKind("DRAFT")}
                >
                  Draft (Word/PDF)
                </button>
                <button
                  type="button"
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                    minutesKind === "FINAL"
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-500/20"
                      : "border-slate-200 dark:border-slate-600"
                  }`}
                  onClick={() => setMinutesKind("FINAL")}
                >
                  Final (PDF only)
                </button>
              </div>
              <input
                type="file"
                accept={minutesKind === "FINAL" ? ".pdf,application/pdf" : ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
                onChange={(e) => setMinutesFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                className="btn-primary text-sm"
                disabled={minutesBusy || !minutesFile}
                onClick={() => {
                  if (!minutesFile) return;
                  setMinutesBusy(true);
                  void endpoints
                    .uploadMinutesDocument(meetingId, minutesFile, minutesKind)
                    .then(() => {
                      flash(`${minutesKind === "FINAL" ? "Final" : "Draft"} minutes uploaded`);
                      setMinutesFile(null);
                      return load();
                    })
                    .catch((err: unknown) =>
                      flash(err instanceof ApiClientError ? err.message : "Upload failed.", "error"),
                    )
                    .finally(() => setMinutesBusy(false));
                }}
              >
                {minutesBusy ? "Uploading…" : `Upload ${minutesKind === "FINAL" ? "final" : "draft"}`}
              </button>
            </div>
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

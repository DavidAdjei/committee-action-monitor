import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  ListChecks,
  Loader2,
  MapPin,
  QrCode,
  ScrollText,
  Upload,
  Users,
  Video,
} from "lucide-react";
import { StatusPill, formatDate } from "@/components/StatusBits";
import { endpoints } from "@/api/endpoints";
import { ApiClientError } from "@/api/client";
import { useFlash } from "@/state/toastContext";
import { useAuth } from "@/state/authContext";
import { canCreateMeeting } from "@/lib/permissions";
import { PreviewMinutesButton } from "@/components/MinutesDocumentPreview";
import { AttendanceQrProjector } from "@/components/AttendanceQrProjector";

interface MeetingDetailData {
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

function isMeetingLive(startsAt: string, endsAt: string | null | undefined): boolean {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = endsAt ? new Date(endsAt).getTime() : start + 3 * 60 * 60 * 1000;
  return now >= start && now <= end;
}

function outcomeBadge(outcome: string) {
  switch (outcome) {
    case "HELD":
      return "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:ring-emerald-800";
    case "POSTPONED":
      return "bg-amber-100 text-amber-900 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:ring-amber-800";
    case "DID_NOT_HOLD":
      return "bg-red-100 text-red-800 ring-red-200 dark:bg-red-950/60 dark:text-red-200 dark:ring-red-800";
    default:
      return "bg-sky-100 text-sky-900 ring-sky-200 dark:bg-sky-950/60 dark:text-sky-200 dark:ring-sky-800";
  }
}

function outcomeLabel(outcome: string) {
  return outcome.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Section({
  icon,
  title,
  action,
  children,
  className = "",
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/80 dark:bg-slate-900 ${className}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {icon}
          </span>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function MeetingDetailPage() {
  const { meetingId: meetingIdParam } = useParams();
  const meetingId = Number(meetingIdParam);
  const navigate = useNavigate();
  const flash = useFlash();
  const { me } = useAuth();
  const [detail, setDetail] = useState<MeetingDetailData | null>(null);
  const [papers, setPapers] = useState<
    { id: number; filename: string; mediaType?: string | null; sizeBytes?: number | null }[]
  >([]);
  const [sheetUrl, setSheetUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [projectQr, setProjectQr] = useState(false);
  const [showOutcome, setShowOutcome] = useState(false);
  const [outcomeType, setOutcomeType] = useState<"DID_NOT_HOLD" | "POSTPONED" | "HELD">("DID_NOT_HOLD");
  const [outcomeReason, setOutcomeReason] = useState("");
  const [postponeDate, setPostponeDate] = useState("");
  const [postponeTime, setPostponeTime] = useState("10:00");
  const [minutesKind, setMinutesKind] = useState<"DRAFT" | "FINAL">("DRAFT");
  const [minutesFile, setMinutesFile] = useState<File | null>(null);
  const [minutesBusy, setMinutesBusy] = useState(false);

  const load = async () => {
    const d = (await endpoints.meetingDetail(meetingId)) as MeetingDetailData;
    setDetail(d);
    setSheetUrl(d.attendanceSheetUrl ?? "");
    try {
      const p = await endpoints.listMeetingPapers(meetingId);
      setPapers(p as typeof papers);
    } catch {
      setPapers([]);
    }
  };

  useEffect(() => {
    if (!Number.isInteger(meetingId)) {
      navigate("/committees");
      return;
    }
    load().catch((err: unknown) => {
      flash(err instanceof ApiClientError ? err.message : "Could not load meeting.", "error");
      navigate(-1);
    });
  }, [meetingId]);

  const canManage = detail ? canCreateMeeting(me, detail.committeeId) : false;
  const live = detail ? isMeetingLive(detail.startsAt, detail.endsAt) : false;

  const checkInUrl = useMemo(() => {
    if (!detail?.attendanceToken || !live) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/meetings/${detail.id}/check-in?token=${detail.attendanceToken}`;
  }, [detail, live]);

  const qrSrc = checkInUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(checkInUrl)}`
    : "";

  if (!detail) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        <p className="text-sm">Loading meeting…</p>
      </div>
    );
  }

  const start = new Date(detail.startsAt);
  const end = detail.endsAt ? new Date(detail.endsAt) : null;
  const outcome = detail.outcome ?? "SCHEDULED";

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
    if (!detail.attendanceToken || !live) return;
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

  const submitOutcome = async () => {
    if (!outcomeReason.trim()) return;
    setBusy(true);
    try {
      await endpoints.recordMeetingOutcome(detail.id, {
        outcome: outcomeType,
        reason: outcomeReason.trim(),
        postponedTo:
          outcomeType === "POSTPONED" && postponeDate
            ? new Date(`${postponeDate}T${postponeTime}:00`).toISOString()
            : undefined,
      });
      flash("Meeting outcome recorded");
      setShowOutcome(false);
      await load();
    } catch (err: unknown) {
      flash(err instanceof ApiClientError ? err.message : "Could not save outcome.", "error");
    } finally {
      setBusy(false);
    }
  };

  const uploadMinutes = async () => {
    if (!minutesFile) return;
    setMinutesBusy(true);
    try {
      await endpoints.uploadMinutesDocument(detail.id, minutesFile, minutesKind);
      flash(`${minutesKind === "FINAL" ? "Final" : "Draft"} minutes uploaded`);
      setMinutesFile(null);
      await load();
    } catch (err: unknown) {
      flash(err instanceof ApiClientError ? err.message : "Upload failed.", "error");
    } finally {
      setMinutesBusy(false);
    }
  };

  const whenLine = start.toLocaleString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeLine = [
    start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
    end ? end.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null,
  ]
    .filter(Boolean)
    .join(" – ");

  return (
    <div className="mx-auto max-w-6xl pb-16">
      {/* Hero */}
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-slate-800 to-brand-950 text-white shadow-lg dark:border-slate-700">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(99,102,241,0.45), transparent 45%), radial-gradient(circle at 80% 0%, rgba(14,165,233,0.25), transparent 40%)",
          }}
        />
        <div className="relative px-5 py-6 sm:px-8 sm:py-8">
          <button
            type="button"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-white/70 transition hover:text-white"
            onClick={() => navigate(`/committees/${detail.committeeId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
            {detail.committee.name}
          </button>

          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-xs text-white/80 ring-1 ring-white/15">
                  {detail.reference}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${outcomeBadge(outcome)}`}
                >
                  {outcomeLabel(outcome)}
                </span>
                {live && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/40">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                    Live now
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{detail.title}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/70">
                <Link
                  to={`/committees/${detail.committeeId}`}
                  className="font-medium text-white/90 underline-offset-2 hover:underline"
                >
                  {detail.committee.name}
                  <span className="ml-1 text-white/50">({detail.committee.code})</span>
                </Link>
                <span className="text-white/30">·</span>
                <span>Created by {detail.createdBy.fullName}</span>
              </p>
            </div>

            <div className="flex flex-shrink-0 flex-wrap gap-2">
              {detail.teamsJoinUrl && (
                <a
                  href={detail.teamsJoinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100"
                >
                  <Video className="h-4 w-4 text-brand-700" />
                  Join Teams
                  <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                </a>
              )}
              {canManage && live && checkInUrl && (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
                  onClick={() => setProjectQr(true)}
                >
                  <QrCode className="h-4 w-4" />
                  Project QR
                </button>
              )}
            </div>
          </div>

          {/* Meta strip */}
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/10 backdrop-blur-sm">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/50">
                <Calendar className="h-3.5 w-3.5" /> Date
              </p>
              <p className="text-sm font-semibold">{whenLine}</p>
              <p className="text-xs text-white/60">{timeLine}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/10 backdrop-blur-sm">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/50">
                <MapPin className="h-3.5 w-3.5" /> Venue
              </p>
              <p className="text-sm font-semibold">{detail.venue || "Not specified"}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/10 backdrop-blur-sm">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/50">
                <Users className="h-3.5 w-3.5" /> Attendance
              </p>
              <p className="text-sm font-semibold">
                {detail.attendance.length} checked in
              </p>
              <p className="text-xs text-white/60">
                {detail.actionPoints.length} action point{detail.actionPoints.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Body: main + sidebar */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-8">
          {/* Agenda */}
          <Section icon={<ScrollText className="h-4 w-4" />} title="Agenda">
            {detail.agenda ? (
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {detail.agenda}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No agenda was provided for this meeting.</p>
            )}
          </Section>

          {/* Teams */}
          <Section icon={<Video className="h-4 w-4" />} title="Microsoft Teams">
            {detail.teamsJoinUrl ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-slate-600 dark:text-slate-300">Online meeting is ready.</p>
                  <p className="mt-1 truncate font-mono text-xs text-slate-400">{detail.teamsJoinUrl}</p>
                </div>
                <a
                  href={detail.teamsJoinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary inline-flex shrink-0 items-center gap-2"
                >
                  <Video className="h-4 w-4" /> Open Teams
                </a>
              </div>
            ) : detail.teamsRequested ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                Teams was requested when this meeting was created, but no join link is available yet.
              </div>
            ) : (
              <p className="text-sm text-slate-500">This is an in-person / offline meeting only.</p>
            )}
          </Section>

          {/* Outcome */}
          <Section
            icon={<CheckCircle2 className="h-4 w-4" />}
            title="Outcome"
            action={
              canManage && outcome === "SCHEDULED" ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300"
                  onClick={() => setShowOutcome((v) => !v)}
                >
                  {showOutcome ? "Cancel" : "Record outcome"}
                </button>
              ) : undefined
            }
          >
            {outcome !== "SCHEDULED" ? (
              <div className="space-y-2">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${outcomeBadge(outcome)}`}
                >
                  {outcomeLabel(outcome)}
                </span>
                {detail.outcomeReason && (
                  <p className="text-sm text-slate-700 dark:text-slate-300">{detail.outcomeReason}</p>
                )}
                <p className="text-xs text-slate-500">
                  {detail.outcomeRecordedBy && <>Recorded by {detail.outcomeRecordedBy.fullName}</>}
                  {detail.postponedTo && <> · New date {formatDate(detail.postponedTo)}</>}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Still scheduled — no outcome recorded yet.</p>
            )}

            {showOutcome && canManage && (
              <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["DID_NOT_HOLD", "Did not hold"],
                      ["POSTPONED", "Postponed"],
                      ["HELD", "Held"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        outcomeType === v
                          ? "border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/20 dark:text-brand-200"
                          : "border-slate-200 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
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
                    className="field-input min-h-[72px]"
                    value={outcomeReason}
                    onChange={(e) => setOutcomeReason(e.target.value)}
                    placeholder="Why the meeting did not proceed or was postponed"
                  />
                </label>
                {outcomeType === "POSTPONED" && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="field-label">
                      New date
                      <input
                        type="date"
                        className="field-input"
                        value={postponeDate}
                        onChange={(e) => setPostponeDate(e.target.value)}
                      />
                    </label>
                    <label className="field-label">
                      Time
                      <input
                        type="time"
                        className="field-input"
                        value={postponeTime}
                        onChange={(e) => setPostponeTime(e.target.value)}
                      />
                    </label>
                  </div>
                )}
                <button type="button" className="btn-primary" disabled={busy} onClick={() => void submitOutcome()}>
                  Save outcome
                </button>
              </div>
            )}
          </Section>

          {/* Minutes */}
          <Section icon={<FileText className="h-4 w-4" />} title="Minutes">
            {detail.minutes.length === 0 ? (
              <p className="mb-3 text-sm text-slate-500">No minutes uploaded yet.</p>
            ) : (
              <ul className="mb-4 space-y-2">
                {detail.minutes.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            m.status === "FINAL"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                              : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                          }`}
                        >
                          {m.status}
                        </span>
                        <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                          {m.filename || `Minutes #${m.id}`}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDate(m.createdAt)}
                        {m.createdBy ? ` · ${m.createdBy.fullName}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {m.hasFile !== false && (
                        <PreviewMinutesButton minutesId={m.id} filename={m.filename} hasFile={m.hasFile !== false} />
                      )}
                      <button
                        type="button"
                        className="btn text-xs"
                        onClick={() => void endpoints.downloadMinutesDocument(m.id, m.filename ?? undefined)}
                      >
                        Download
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {canManage && (
              <div className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4 dark:border-slate-600 dark:bg-slate-800/30">
                <p className="text-xs font-medium text-slate-500">Upload minutes document</p>
                <div className="flex flex-wrap gap-2">
                  {(["DRAFT", "FINAL"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
                        minutesKind === k
                          ? "border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/20"
                          : "border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-900"
                      }`}
                      onClick={() => setMinutesKind(k)}
                    >
                      {k === "DRAFT" ? "Draft (Word/PDF)" : "Final (PDF)"}
                    </button>
                  ))}
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <Upload className="h-4 w-4 shrink-0" />
                  <input
                    type="file"
                    className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-brand-50 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-brand-800"
                    accept={
                      minutesKind === "FINAL"
                        ? ".pdf,application/pdf"
                        : ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    }
                    onChange={(e) => setMinutesFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <button
                  type="button"
                  className="btn-primary text-xs"
                  disabled={!minutesFile || minutesBusy}
                  onClick={() => void uploadMinutes()}
                >
                  {minutesBusy ? "Uploading…" : "Upload minutes"}
                </button>
              </div>
            )}
          </Section>

          {/* Actions */}
          <Section icon={<ListChecks className="h-4 w-4" />} title="Action points">
            {detail.actionPoints.length === 0 ? (
              <p className="text-sm text-slate-500">No action points linked to this meeting yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {detail.actionPoints.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        <span className="mr-1.5 font-mono text-[11px] text-slate-400">{a.referenceNo}</span>
                        {a.title}
                      </p>
                      <p className="text-xs text-slate-500">{a.owner.fullName}</p>
                    </div>
                    <StatusPill status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* Sidebar */}
        <div className="space-y-5 lg:col-span-4">
          {/* Live attendance QR */}
          <Section icon={<QrCode className="h-4 w-4" />} title="Attendance">
            {canManage && live && qrSrc ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white p-4 text-center dark:border-emerald-900 dark:from-emerald-950/40 dark:to-slate-900">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    Live — scan to check in
                  </p>
                  <img
                    src={qrSrc}
                    alt="Attendance QR"
                    className="mx-auto h-44 w-44 rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-200"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <button type="button" className="btn text-xs" disabled={busy} onClick={() => void checkInSelf()}>
                    Record my attendance
                  </button>
                  <button type="button" className="btn text-xs" onClick={() => setProjectQr(true)}>
                    Project full-screen QR
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                {live
                  ? "Attendance QR is available to the chair or secretary while the meeting is live."
                  : "Attendance QR appears here only while the meeting is live (between start and end time)."}
              </p>
            )}

            {canManage && (
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <label className="field-label">
                  Attendance sheet URL
                  <input
                    className="field-input"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </label>
                <button type="button" className="btn w-full text-xs" disabled={busy} onClick={() => void saveSheet()}>
                  Save link
                </button>
              </div>
            )}

            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Checked in ({detail.attendance.length})
              </p>
              {detail.attendance.length === 0 ? (
                <p className="text-sm text-slate-500">Nobody has checked in yet.</p>
              ) : (
                <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {detail.attendance.map((a) => (
                    <li key={a.userId} className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-800 dark:bg-brand-950 dark:text-brand-200">
                        {a.fullName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{a.fullName}</p>
                        <p className="text-[11px] text-slate-400">
                          {a.method} · {formatDate(a.markedAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>

          {/* Papers */}
          <Section icon={<FileText className="h-4 w-4" />} title="Meeting papers">
            {papers.length === 0 ? (
              <p className="text-sm text-slate-500">No papers uploaded for this meeting.</p>
            ) : (
              <ul className="space-y-2">
                {papers.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        {p.filename}
                      </span>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {p.sizeBytes != null ? `${Math.round(p.sizeBytes / 1024)} KB` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Meta */}
          <Section icon={<Clock className="h-4 w-4" />} title="Details">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Reference</dt>
                <dd className="font-mono text-xs font-medium text-slate-800 dark:text-slate-100">{detail.reference}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Committee</dt>
                <dd className="text-right font-medium text-slate-800 dark:text-slate-100">
                  {detail.committee.code}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Created</dt>
                <dd className="text-right text-slate-800 dark:text-slate-100">{formatDate(detail.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">By</dt>
                <dd className="text-right font-medium text-slate-800 dark:text-slate-100">{detail.createdBy.fullName}</dd>
              </div>
            </dl>
          </Section>
        </div>
      </div>

      {projectQr && checkInUrl && (
        <AttendanceQrProjector
          meetingTitle={detail.title}
          meetingReference={detail.reference}
          checkInUrl={checkInUrl}
          onClose={() => setProjectQr(false)}
        />
      )}
    </div>
  );
}

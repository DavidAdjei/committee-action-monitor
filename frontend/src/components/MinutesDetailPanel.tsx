import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, FileText, Loader2, Send } from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { StatusPill, formatDate } from "@/components/StatusBits";
import { endpoints } from "@/api/endpoints";
import { ApiClientError } from "@/api/client";
import { useAuth } from "@/state/authContext";
import { useFlash } from "@/state/toastContext";
import { canCreateMinutes } from "@/lib/permissions";
import type { MeetingMinutes } from "@/types";

function statusBadge(status: string) {
  switch (status) {
    case "DRAFT":
      return "bg-slate-100 text-slate-700 dark:text-slate-200 border-slate-200 dark:bg-slate-800 dark:text-slate-300";
    case "ISSUED":
      return "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300";
    case "APPROVED":
      return "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export function MinutesDetailPanel({
  minutesId,
  onClose,
  onChanged,
}: {
  minutesId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { me } = useAuth();
  const flash = useFlash();
  const [detail, setDetail] = useState<MeetingMinutes | null>(null);
  const [busy, setBusy] = useState(false);
  const [documentUrl, setDocumentUrl] = useState("");
  const [attendanceList, setAttendanceList] = useState<{ fullName: string; method: string }[]>([]);
  const [showMailPreview, setShowMailPreview] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);

  const load = () =>
    endpoints.getMinutes(minutesId).then(async (d) => {
      setDetail(d);
      setDocumentUrl(d.documentUrl ?? "");
      try {
        const m: any = await endpoints.meetingDetail(d.meetingId);
        setAttendanceList(
          (m.attendance ?? []).map((a: any) => ({ fullName: a.fullName, method: a.method })),
        );
      } catch {
        setAttendanceList([]);
      }
    });

  useEffect(() => {
    load().catch((err: unknown) => {
      flash(err instanceof ApiClientError ? err.message : "Could not load minutes.", "error");
      onClose();
    });
  }, [minutesId]);

  if (!detail) {
    return (
      <Modal title="Minutes" onClose={onClose} wide>
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading minutes…
        </p>
      </Modal>
    );
  }

  const canManage = canCreateMinutes(me, detail.meeting.committeeId);

  const issue = async () => {
    setBusy(true);
    try {
      const updated = await endpoints.issueMinutes(detail.id, {
        documentUrl: documentUrl.trim() || undefined,
      });
      setDetail(updated);
      flash("Minutes issued — stakeholders notified (attendance CSV attached to email)");
      onChanged();
    } catch (err: unknown) {
      flash(err instanceof ApiClientError ? err.message : "Could not issue minutes.", "error");
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    try {
      const updated = await endpoints.approveMinutes(detail.id);
      setDetail(updated);
      flash("Minutes approved");
      onChanged();
    } catch (err: unknown) {
      flash(err instanceof ApiClientError ? err.message : "Could not approve minutes.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Minutes · ${detail.meeting.reference}`}
      subtitle={detail.meeting.title}
      onClose={onClose}
      wide
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadge(detail.status)}`}>
            {detail.status}
          </span>
          <div className="text-xs text-slate-500">
            Created by {detail.createdBy.fullName} · {formatDate(detail.createdAt)}
            {detail.issuedAt && <> · Issued {formatDate(detail.issuedAt)}</>}
            {detail.approvedAt && <> · Approved {formatDate(detail.approvedAt)}</>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2 dark:bg-slate-800/50">
          <div>
            <small className="block text-slate-400">Meeting</small>
            <b>
              {detail.meeting.reference} · {formatDate(detail.meeting.startsAt)}
            </b>
          </div>
          <div>
            <small className="block text-slate-400">Action status source</small>
            <b>{String(detail.sourcePopulation).replace(/_/g, " ")}</b>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <b className="text-sm text-slate-800 dark:text-slate-100">Attendance</b>
            <button
              type="button"
              className="btn text-xs py-1"
              onClick={() => setShowAttendance((v) => !v)}
            >
              {showAttendance ? "Hide attendance" : "View attendance"}
              <span className="text-slate-400">({attendanceList.length})</span>
            </button>
          </div>
          {showAttendance && (
            attendanceList.length === 0 ? (
              <p className="text-sm text-slate-400">No attendance recorded for this meeting.</p>
            ) : (
              <ul className="mb-1 list-inside list-disc text-sm text-slate-600 dark:text-slate-300">
                {attendanceList.map((a, i) => (
                  <li key={i}>
                    {a.fullName} <span className="text-xs text-slate-400">({a.method})</span>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>

        {detail.discussion && (
          <div>
            <b className="mb-1.5 block text-sm text-slate-800 dark:text-slate-100">
              Discussion, decisions & resolutions
            </b>
            <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {detail.discussion}
            </div>
          </div>
        )}

        <div>
          <b className="mb-1.5 block text-sm text-slate-800 dark:text-slate-100">
            Action points ({detail.snapshots.length})
          </b>
          <p className="mb-2 text-xs text-slate-400">
            Captured when the minutes were created. Later changes to live actions do not alter these rows.
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700">
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2">Progress</th>
                  <th className="px-3 py-2">Status at capture</th>
                </tr>
              </thead>
              <tbody>
                {detail.snapshots.map((s) => (
                  <tr key={s.actionPointId} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{s.referenceNo}</td>
                    <td className="px-3 py-2">
                      <div>{s.title}</div>
                      {s.ownerRemarks && (
                        <small className="text-slate-400 italic">"{s.ownerRemarks}"</small>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{s.owner.fullName}</td>
                    <td className="px-3 py-2">{s.progressPercent}%</td>
                    <td className="px-3 py-2">
                      <StatusPill status={s.actionStatus as any} />
                    </td>
                  </tr>
                ))}
                {detail.snapshots.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                      No action snapshots were included.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <b className="mb-1.5 block text-sm text-slate-800 dark:text-slate-100">Minutes document</b>
          {detail.status === "DRAFT" && canManage ? (
            <label className="field-label">
              Document URL (SharePoint or controlled link)
              <input
                type="url"
                className="field-input"
                placeholder="https://…"
                value={documentUrl}
                onChange={(e) => setDocumentUrl(e.target.value)}
              />
              <small className="font-normal text-slate-400">
                Optional. Stored on issue. Word/PDF generation via Graph can attach here later.
              </small>
            </label>
          ) : detail.documentUrl ? (
            <a
              href={detail.documentUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 dark:text-brand-300 hover:underline"
            >
              <ExternalLink className="h-4 w-4" /> Open minutes document
            </a>
          ) : (
            <p className="text-sm text-slate-400">No document link attached.</p>
          )}
        </div>
      </div>

      <button
        type="button"
        className="mt-4 text-xs font-semibold text-brand-700 dark:text-brand-300 hover:underline"
        onClick={() => setShowMailPreview((v) => !v)}
      >
        {showMailPreview ? "Hide" : "Show"} email layout preview
      </button>
      {showMailPreview && (
        <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm dark:border-slate-600 dark:bg-slate-900">
          <h3 className="font-bold">{detail.meeting.title}</h3>
          <p className="text-xs text-slate-500">
            {detail.meeting.reference} · {formatDate(detail.meeting.startsAt)}
          </p>
          <hr className="my-2 border-slate-200 dark:border-slate-700" />
          <p className="font-semibold">1. Attendance</p>
          <p className="mb-1 text-[11px] text-brand-700 dark:text-brand-300">
            Email delivery attaches the attendance register as a CSV file.
          </p>
          <ul className="mb-2 list-inside list-disc text-xs">
            {attendanceList.map((a, i) => (
              <li key={i}>{a.fullName}</li>
            ))}
          </ul>
          <p className="font-semibold">2. Discussion, decisions & resolutions</p>
          <p className="mb-2 whitespace-pre-wrap text-xs">{detail.discussion}</p>
          <p className="font-semibold">3. Action points</p>
          <ul className="list-inside list-disc text-xs">
            {detail.snapshots.map((s) => (
              <li key={s.actionPointId}>
                {s.referenceNo} — {s.title} ({s.actionStatus}, {s.progressPercent}%)
              </li>
            ))}
          </ul>
        </div>
      )}

      <ModalActions>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
        {canManage && detail.status === "DRAFT" && (
          <button type="button" className="btn-primary" disabled={busy} onClick={issue}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Issue & notify
          </button>
        )}
        {canManage && detail.status === "ISSUED" && (
          <button type="button" className="btn-primary" disabled={busy} onClick={approve}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Approve minutes
          </button>
        )}
        {detail.status === "APPROVED" && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <FileText className="h-3.5 w-3.5" /> Approved — snapshots are locked
          </span>
        )}
      </ModalActions>
    </Modal>
  );
}

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CalendarPlus, Crown, Eye, FileText, ListPlus, ShieldCheck, UserPlus, Video } from "lucide-react";
import { endpoints } from "@/api/endpoints";
import { StatusPill, DueBadge, ProgressBar, formatDate } from "@/components/StatusBits";
import { NewActionModal } from "@/components/modals/NewActionModal";
import { CreateMeetingModal } from "@/components/modals/CreateMeetingModal";
import { CreateMinutesModal } from "@/components/modals/CreateMinutesModal";
import { AddMemberModal } from "@/components/modals/AddMemberModal";
import { SetChairModal } from "@/components/modals/SetChairModal";
import { ActionDetailPanel } from "@/components/ActionDetailPanel";
import { MinutesDetailPanel } from "@/components/MinutesDetailPanel";
import { LoadingLogo } from "@/components/LoadingLogo";
import { useAuth } from "@/state/authContext";
import { useFlash } from "@/state/toastContext";
import { ApiClientError } from "@/api/client";
import {
  canCreateAction,
  canCreateMeeting,
  canCreateMinutes,
  canManageCommittee,
  canManageMembers,
} from "@/lib/permissions";
import { MeetingDetailPanel } from "@/components/MeetingDetailPanel";
import type { ActionListItem, CommitteeDetail, MeetingMinutes } from "@/types";

const TABS = ["Overview", "Action Points", "Meetings", "Minutes"] as const;
type Tab = (typeof TABS)[number];

export default function CommitteeWorkspace() {
  const { me } = useAuth();
  const flash = useFlash();
  const navigate = useNavigate();
  const { id } = useParams();
  const committeeId = Number(id);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CommitteeDetail | null>(null);
  const [actions, setActions] = useState<ActionListItem[]>([]);
  const [tab, setTab] = useState<Tab>("Overview");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showNewAction, setShowNewAction] = useState(false);
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [showNewMinutes, setShowNewMinutes] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showSetChair, setShowSetChair] = useState(false);
  const [openActionId, setOpenActionId] = useState<number | null>(null);
  const [minutesList, setMinutesList] = useState<MeetingMinutes[]>([]);
  const [minutesLoading, setMinutesLoading] = useState(false);
  const [openMinutesId, setOpenMinutesId] = useState<number | null>(null);
  const [openMeetingId, setOpenMeetingId] = useState<number | null>(null);

  const handleAccessDenied = (err: unknown) => {
    const message =
      err instanceof ApiClientError
        ? err.message
        : (err as Error)?.message ?? "You do not have access to this committee.";
    setLoadError(message);
    flash(message, "error");
    navigate("/committees", { replace: true });
  };

  const loadDetail = () =>
    endpoints
      .committee(committeeId)
      .then((d) => {
        setDetail(d);
        setLoadError(null);
      })
      .catch(handleAccessDenied);

  const loadActions = () =>
    endpoints
      .actionsForCommittee(committeeId, statusFilter !== "All" ? { status: statusFilter } : undefined)
      .then(setActions)
      .catch((err) => {
        // Don't loop loaders on secondary failures if detail already failed
        if (!detail) handleAccessDenied(err);
      });

  const loadMinutes = async () => {
    setMinutesLoading(true);
    try {
      const meetings = detail?.meetings ?? (await endpoints.committee(committeeId)).meetings;
      const lists = await Promise.all(
        (meetings ?? []).map((m) => endpoints.listMeetingMinutes(m.id).catch(() => [] as MeetingMinutes[])),
      );
      const flat = lists.flat().sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      setMinutesList(flat);
    } finally {
      setMinutesLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [committeeId]);

  useEffect(() => {
    loadActions();
  }, [committeeId, statusFilter]);

  useEffect(() => {
    if (tab === "Minutes") void loadMinutes();
  }, [tab, committeeId, detail?.meetings?.length]);

  const refreshAll = () => {
    loadDetail();
    loadActions();
    if (tab === "Minutes") void loadMinutes();
  };

  if (loadError) {
    return (
      <div className="card border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950">
        <p className="text-sm text-red-700 dark:text-red-300">{loadError}</p>
        <p className="mt-1 text-xs text-red-500">Redirecting to committees…</p>
      </div>
    );
  }

  if (!detail) return <LoadingLogo scope="page" message="Loading committee workspace..." />;

  // Server flags are authoritative when present. Client matrix is a fail-closed fallback
  // and a second gate on write forms (docs §2 / §9 — UI is not the security control).
  const canEdit =
    detail.canEdit !== undefined && detail.canEdit !== null
      ? Boolean(detail.canEdit)
      : canCreateAction(me, committeeId) || canCreateMeeting(me, committeeId) || canCreateMinutes(me, committeeId);
  const canManage =
    detail.canManageCommittee !== undefined && detail.canManageCommittee !== null
      ? Boolean(detail.canManageCommittee)
      : canManageCommittee(me, committeeId);
  const canMembers =
    detail.canManageMembers !== undefined && detail.canManageMembers !== null
      ? Boolean(detail.canManageMembers)
      : canManageMembers(me, committeeId);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-ink dark:text-white">{detail.name}</h1>
            {detail.code && (
              <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">
                {detail.code}
              </span>
            )}
            {!canEdit && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/70 dark:text-amber-300">
                <Eye className="h-3.5 w-3.5 text-amber-600" /> View Only
              </span>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">{detail.mandate}</p>
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Chairperson: <span className="font-semibold text-slate-700 dark:text-slate-300">{detail.chairperson.fullName}</span> · Secretary:{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-300">{detail.secretary.fullName}</span> · Central rep:{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-300">{detail.centralRep.fullName}</span>
          </p>
        </div>

        {/* Action / Governance Buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Chair / Secretary (or admin): membership & leadership */}
          {canMembers && (
            <>
              <button
                className="btn gap-1.5 text-xs"
                onClick={() => setShowSetChair(true)}
                title="Assign or reassign the committee chairperson"
              >
                <Crown className="h-4 w-4 text-brand-500" /> Set Chair
              </button>
              <button
                className="btn gap-1.5 text-xs"
                onClick={() => setShowAddMember(true)}
                title="Add a new member to this committee"
              >
                <UserPlus className="h-4 w-4 text-slate-600 dark:text-slate-300" /> Add member
              </button>
            </>
          )}

          {/* Committee Officer Controls: Only visible to Chairperson & Secretary */}
          {canEdit ? (
            <>
              <button className="btn gap-1.5 text-xs" onClick={() => setShowNewMeeting(true)}>
                <CalendarPlus className="h-4 w-4 text-slate-600 dark:text-slate-300" /> New meeting
              </button>
              <button className="btn gap-1.5 text-xs" onClick={() => setShowNewMinutes(true)}>
                <FileText className="h-4 w-4 text-slate-600 dark:text-slate-300" /> Create minutes
              </button>
              <button className="btn-primary gap-1.5 text-xs" onClick={() => setShowNewAction(true)}>
                <ListPlus className="h-4 w-4" /> New action point
              </button>
            </>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
              title="Only the committee's active Chairperson or Secretary may create meetings and action points."
            >
              <ShieldCheck className="h-4 w-4 text-brand-500" /> View-only access
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <SummaryTile label="Total" value={detail.summary.totalActions} />
        <SummaryTile label="Active" value={detail.summary.activeActions} tone="text-blue-600" />
        <SummaryTile label="Overdue" value={detail.summary.overdueActions} tone="text-red-600" />
        <SummaryTile label="On-time rate" value={`${detail.summary.onTimeRate ?? "—"}%`} tone="text-emerald-600" />
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium ${
              tab === t ? "border-b-2 border-brand-600 text-brand-700 dark:text-brand-300" : "text-slate-500 hover:text-slate-700 dark:text-slate-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="card">
            <b className="mb-3 block text-sm text-slate-800 dark:text-slate-100">Pending verification</b>
            {detail.pendingVerification.length === 0 && (
              <p className="text-sm text-slate-400">Nothing awaiting verification.</p>
            )}
            <div className="space-y-2">
              {detail.pendingVerification.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setOpenActionId(p.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm hover:bg-amber-100"
                >
                  <span>
                    <b>{p.referenceNo}</b> · {p.title}
                    <br />
                    <small className="text-slate-500">Owner: {p.owner.fullName}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="mb-3 flex items-center justify-between">
              <b className="text-sm font-bold text-slate-800 dark:text-slate-100">Committee Members</b>
              {canMembers && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowSetChair(true)}
                    className="flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    <Crown className="h-3 w-3" /> Set Chair
                  </button>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <button
                    onClick={() => setShowAddMember(true)}
                    className="flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    <UserPlus className="h-3 w-3" /> Add Member
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-1.5 divide-y divide-slate-100 dark:divide-slate-800">
              {detail.members.map((m) => (
                <div key={m.userId} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{m.fullName}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      m.role === "CHAIRPERSON"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        : m.role === "SECRETARY"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {m.role === "CHAIRPERSON" ? "Chairperson" : m.role === "SECRETARY" ? "Secretary" : "Member"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "Action Points" && (
        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            {["All", "Open", "In Progress", "Pending Verification", "Overdue", "Completed"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  statusFilter === s ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-2">Reference</th>
                <th className="pb-2">Action</th>
                <th className="pb-2">Owner</th>
                <th className="pb-2">Deadline</th>
                <th className="pb-2">Progress</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setOpenActionId(a.id)}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="py-2.5 font-medium text-slate-700 dark:text-slate-200">{a.referenceNo}</td>
                  <td className="py-2.5">{a.title}</td>
                  <td className="py-2.5">{a.owner.fullName}</td>
                  <td className="py-2.5">
                    {formatDate(a.deadline)}
                    <br />
                    <DueBadge deadline={a.deadline} status={a.status} />
                  </td>
                  <td className="py-2.5">
                    <ProgressBar value={a.progress} />
                  </td>
                  <td className="py-2.5">
                    <StatusPill status={a.status} />
                  </td>
                </tr>
              ))}
              {actions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    No action points for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Meetings" && (
        <div className="space-y-3">
          {detail.meetings.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setOpenMeetingId(m.id)}
              className="card flex w-full flex-col gap-2 text-left transition hover:border-brand-300 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <b className="text-sm text-slate-800 dark:text-slate-100">{m.title}</b>
                <p className="text-xs text-slate-500">
                  {m.reference} · {formatDate(m.startsAt)} · {m.venue || "No venue"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {m.teamsJoinUrl && (
                  <span
                    role="link"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(m.teamsJoinUrl!, "_blank", "noopener,noreferrer");
                    }}
                    className="btn text-xs"
                  >
                    <Video className="h-4 w-4" /> Join Teams
                  </span>
                )}
                <span className="text-xs font-medium text-brand-600">View details →</span>
              </div>
            </button>
          ))}
          {detail.meetings.length === 0 && <p className="card text-sm text-slate-400">No meetings recorded yet.</p>}
        </div>
      )}

      {tab === "Minutes" && (
        <div className="space-y-3">
          {minutesLoading && <p className="text-sm text-slate-400">Loading minutes…</p>}
          {!minutesLoading &&
            minutesList.map((min) => (
              <button
                key={min.id}
                type="button"
                onClick={() => setOpenMinutesId(min.id)}
                className="card flex w-full flex-col gap-2 text-left transition hover:border-brand-300 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-sm text-slate-800 dark:text-slate-100">
                      {min.meeting.reference} · {min.meeting.title}
                    </b>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        min.status === "APPROVED"
                          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : min.status === "ISSUED"
                            ? "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {min.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {min.snapshots.length} action snapshot{min.snapshots.length === 1 ? "" : "s"} · Created{" "}
                    {formatDate(min.createdAt)} by {min.createdBy.fullName}
                    {min.issuedAt ? ` · Issued ${formatDate(min.issuedAt)}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-medium text-brand-600">View details →</span>
              </button>
            ))}
          {!minutesLoading && minutesList.length === 0 && (
            <p className="card text-sm text-slate-400">
              No minutes yet. Use <b>Create minutes</b> to capture discussion and freeze action statuses.
            </p>
          )}
        </div>
      )}

      {showNewAction && (
        <NewActionModal
          committeeId={committeeId}
          committeeName={detail.name}
          onClose={() => setShowNewAction(false)}
          onCreated={refreshAll}
        />
      )}
      {showNewMeeting && (
        <CreateMeetingModal
          committeeId={committeeId}
          committeeName={detail.name}
          onClose={() => setShowNewMeeting(false)}
          onCreated={refreshAll}
        />
      )}
      {showNewMinutes && (
        <CreateMinutesModal
          committeeId={committeeId}
          committeeName={detail.name}
          onClose={() => setShowNewMinutes(false)}
          onCreated={refreshAll}
        />
      )}
      {openActionId && (
        <ActionDetailPanel actionId={openActionId} onClose={() => setOpenActionId(null)} onChanged={refreshAll} />
      )}
      {openMinutesId && (
        <MinutesDetailPanel
          minutesId={openMinutesId}
          onClose={() => setOpenMinutesId(null)}
          onChanged={() => {
            void loadMinutes();
            refreshAll();
          }}
        />
      )}
      {openMeetingId && (
        <MeetingDetailPanel
          meetingId={openMeetingId}
          onClose={() => setOpenMeetingId(null)}
          onOpenAction={(id) => {
            setOpenMeetingId(null);
            setOpenActionId(id);
          }}
          onOpenMinutes={(id) => {
            setOpenMeetingId(null);
            setOpenMinutesId(id);
          }}
        />
      )}
    </div>
  );
}

function SummaryTile({ label, value, tone = "text-ink dark:text-white" }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="card">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

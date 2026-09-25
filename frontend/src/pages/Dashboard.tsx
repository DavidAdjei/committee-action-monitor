import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Filter,
  ListChecks,
  Download,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { endpoints } from "@/api/endpoints";
import { StatusPill, DueBadge, ProgressBar, formatDate } from "@/components/StatusBits";
import { LoadingLogo } from "@/components/LoadingLogo";
import { ActionDetailPanel } from "@/components/ActionDetailPanel";
import { useAuth } from "@/state/authContext";
import { useFlash } from "@/state/toastContext";
import type { DashboardSummary, UrgentDashboardAction } from "@/types";

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  OVERDUE: "Overdue",
  PENDING_VERIFICATION: "Pending Verification",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const PRIORITY_BADGES: Record<string, { label: string; className: string }> = {
  CRITICAL: { label: "Critical", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-200" },
  HIGH: { label: "High", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200" },
  MEDIUM: { label: "Medium", className: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200" },
  LOW: { label: "Low", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200" },
};

function StatCard({
  icon,
  label,
  value,
  subtext,
  tone = "text-ink dark:text-white",
  variant = "brand",
  iconMotion = "float",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  tone?: string;
  variant?: "brand" | "success" | "warning" | "danger" | "info";
  iconMotion?: "float" | "spin" | "pulse" | "none";
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (typeof value !== "number") return;
    let frame = 0;
    const duration = 850;
    const start = performance.now();
    const to = value;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(to * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  const motionCls =
    iconMotion === "spin"
      ? "dash-icon-spin"
      : iconMotion === "pulse"
        ? "dash-icon-pulse"
        : iconMotion === "float"
          ? "dash-icon-float"
          : "";

  const iconTone =
    variant === "success"
      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
      : variant === "warning"
        ? "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
        : variant === "danger"
          ? "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400"
          : variant === "info"
            ? "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
            : "bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400";

  return (
    <div className="dash-kpi group" data-v={variant}>
      <div className="dash-kpi-inner flex h-full flex-col justify-between">
        <span className="dash-shine" aria-hidden />
        <div className="relative z-[3] flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
            <p className={`mt-1.5 text-2xl font-extrabold tracking-tight ${tone}`}>
              {typeof value === "number" ? display : value}
            </p>
          </div>
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${iconTone} ${motionCls}`}>
            {icon}
          </div>
        </div>
        {subtext && (
          <p className="relative z-[3] mt-3 text-xs text-slate-500 dark:text-slate-400">{subtext}</p>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { me } = useAuth();
  const flash = useFlash();
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedActionId, setSelectedActionId] = useState<number | null>(null);
  const [committeeSearch, setCommitteeSearch] = useState("");
  const [urgentFilter, setUrgentFilter] = useState<"ALL" | "OVERDUE" | "PENDING" | "CRITICAL">("ALL");

  const loadDashboard = async () => {
    try {
      setError(null);
      const data = await endpoints.dashboard();
      setSummary(data);
    } catch (err: any) {
      setError(err.message ?? "Could not load the dashboard.");
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  // Filtered committees in the Governance Leaderboard
  const filteredCommittees = useMemo(() => {
    if (!summary?.committeeSummaries) return [];
    if (!committeeSearch.trim()) return summary.committeeSummaries;
    const q = committeeSearch.toLowerCase();
    return summary.committeeSummaries.filter(
      (c) => c.committeeName.toLowerCase().includes(q) || (c.code && c.code.toLowerCase().includes(q)),
    );
  }, [summary?.committeeSummaries, committeeSearch]);

  // Filtered urgent actions list
  const filteredUrgentActions = useMemo(() => {
    if (!summary?.urgentActions) return [];
    return summary.urgentActions.filter((a: UrgentDashboardAction) => {
      if (urgentFilter === "OVERDUE") return a.status === "OVERDUE";
      if (urgentFilter === "PENDING") return a.status === "PENDING_VERIFICATION";
      if (urgentFilter === "CRITICAL") return a.priority === "CRITICAL";
      return true;
    });
  }, [summary?.urgentActions, urgentFilter]);

  if (error) {
    return (
      <div className="card space-y-3 border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-600 dark:text-red-400" />
        <h2 className="text-base font-semibold text-red-800 dark:text-red-200">Failed to load Central Committee Dashboard</h2>
        <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
        <button onClick={handleRefresh} className="btn-primary mx-auto">
          Retry
        </button>
      </div>
    );
  }

  if (!summary) {
    return <LoadingLogo scope="page" message="Loading Central Committee intelligence & bank metrics..." />;
  }

  const total = summary.totalActions || 1;
  const onTimeRateValue = summary.onTimeRate ?? 0;
  const rateCompliant = onTimeRateValue >= 85;

  return (
    <div className="dash-page space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ink dark:text-white">Central Committee Executive Oversight</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Real-time compliance tracking, committee performance matrix, and escalation radar.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn gap-2 text-xs font-medium text-slate-600 dark:text-slate-300"
            disabled={exporting}
            title="Export action register as CSV"
            onClick={async () => {
              setExporting(true);
              try {
                await endpoints.actionsExport();
                flash("Action register export downloaded");
              } catch (err: any) {
                flash(err?.message ?? "Export failed", "error");
              } finally {
                setExporting(false);
              }
            }}
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn gap-2 text-xs font-medium text-slate-600 dark:text-slate-300"
            title="Refresh dashboard metrics"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-brand-500" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <Link to="/actions" className="btn-primary gap-1.5 text-xs">
            <ListChecks className="h-4 w-4" /> Global Action Register
          </Link>
        </div>
      </div>

      {/* Executive KPI Ribbon */}
      <div
        className="dash-kpi-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6"
        key={summary ? `kpi-${summary.totalActions}-${summary.overdue}-${summary.completedOnTime}` : "kpi"}
      >
        <StatCard
          icon={<ListChecks className="h-5 w-5" />}
          label="Total Actions"
          value={summary.totalActions}
          subtext="Bank-wide commitments"
          variant="brand"
          iconMotion="float"
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="On-Time Rate"
          value={`${summary.onTimeRate ?? "—"}%`}
          tone={rateCompliant ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}
          subtext={rateCompliant ? "Target met (≥85%)" : "Below target (<85%)"}
          variant={rateCompliant ? "success" : "warning"}
          iconMotion="spin"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Completed On-Time"
          value={summary.completedOnTime}
          tone="text-emerald-600 dark:text-emerald-400"
          subtext="Delivered successfully"
          variant="success"
          iconMotion="float"
        />
        <StatCard
          icon={<Clock3 className="h-5 w-5" />}
          label="Pending Verification"
          value={summary.pendingVerificationCount ?? summary.statusDistribution?.PENDING_VERIFICATION ?? 0}
          tone="text-amber-600 dark:text-amber-400"
          subtext="Awaiting officer sign-off"
          variant="warning"
          iconMotion="pulse"
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Overdue"
          value={summary.overdue}
          tone={summary.overdue > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}
          subtext={summary.overdue > 0 ? "Requires escalation" : "No overdue items"}
          variant={summary.overdue > 0 ? "danger" : "success"}
          iconMotion={summary.overdue > 0 ? "pulse" : "float"}
        />
        <StatCard
          icon={<ShieldCheck className="h-5 w-5" />}
          label="Due in 14 Days"
          value={summary.dueWithin14Days}
          subtext="Upcoming deadlines"
          variant="info"
          iconMotion="spin"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Cross-Committee Governance Leaderboard (2 cols) */}
        <div className="card lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <b className="text-base font-bold text-slate-800 dark:text-slate-100">Committee Governance Matrix</b>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Accountability scorecard across all chartered committees.
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter committees…"
                  className="field-input w-full pl-8 text-xs py-1.5"
                  value={committeeSearch}
                  onChange={(e) => setCommitteeSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase text-slate-400">
                    <th className="pb-3">Committee</th>
                    <th className="pb-3 text-center">Total</th>
                    <th className="pb-3 text-center">Active</th>
                    <th className="pb-3 text-center">Overdue</th>
                    <th className="pb-3">On-Time Rate</th>
                    <th className="pb-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-800">
                  {filteredCommittees.map((c) => {
                    const hasOverdue = c.overdueActions > 0;
                    return (
                      <tr key={c.committeeId} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-3 font-medium text-slate-800 dark:text-slate-200">
                          <div>
                            <span className="font-semibold text-ink dark:text-white">{c.committeeName}</span>
                            {c.code && (
                              <span className="ml-2 rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 dark:text-slate-300">
                                {c.code}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 text-center font-semibold text-slate-600 dark:text-slate-300">
                          {c.totalActions}
                        </td>
                        <td className="py-3 text-center">
                          <span className="rounded-full bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                            {c.activeActions}
                          </span>
                        </td>
                        <td className="py-3 text-center">
                          {hasOverdue ? (
                            <span className="rounded-full bg-red-50 dark:bg-red-950/60 px-2 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
                              {c.overdueActions}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">0</span>
                          )}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <ProgressBar value={c.onTimeRate ?? 0} />
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                              {c.onTimeRate !== null ? `${c.onTimeRate}%` : "—"}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <Link
                            to={`/committees/${c.committeeId}`}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950 transition"
                          >
                            Workspace <ExternalLink className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredCommittees.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                        No committees match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Status & Priority Visual Analytics (1 col) */}
        <div className="space-y-6">
          {/* Status Distribution */}
          <div className="card">
            <div className="mb-3 flex items-center justify-between">
              <b className="text-sm font-bold text-slate-800 dark:text-slate-100">Status Breakdown</b>
              <span className="text-xs font-semibold text-brand-600 dark:text-brand-400">
                {summary.totalActions} total
              </span>
            </div>
            <div className="space-y-2.5">
              {Object.entries(summary.statusDistribution).map(([status, count]) => {
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={status} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-600 dark:text-slate-300">
                        {STATUS_LABELS[status] ?? status}
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {count} <span className="text-[10px] text-slate-400 font-normal">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                      <div
                        className="h-full rounded-full bg-brand-500 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Priority Distribution */}
          {summary.priorityDistribution && (
            <div className="card">
              <b className="mb-3 block text-sm font-bold text-slate-800 dark:text-slate-100">Priority Profile</b>
              <div className="grid grid-cols-2 gap-2">
                {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((p) => {
                  const count = summary.priorityDistribution?.[p] ?? 0;
                  const b = PRIORITY_BADGES[p];
                  return (
                    <div
                      key={p}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium ${b.className}`}
                    >
                      <span>{b.label}</span>
                      <span className="font-bold">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Urgent Attention & Escalation Feed */}
      <div className="card space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <b className="text-base font-bold text-slate-800 dark:text-slate-100">Executive Escalation Radar</b>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              High-risk, overdue, or sign-off pending commitments requiring immediate Central Committee attention.
            </p>
          </div>

          {/* Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400 flex items-center gap-1 mr-1">
              <Filter className="h-3 w-3" /> Filter:
            </span>
            {(
              [
                { key: "ALL", label: "All Items" },
                { key: "OVERDUE", label: "Overdue" },
                { key: "PENDING", label: "Pending Verification" },
                { key: "CRITICAL", label: "Critical Priority" },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setUrgentFilter(f.key)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  urgentFilter === f.key
                    ? "bg-brand-500 text-white shadow-sm"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800/50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Escalation Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase text-slate-400">
                <th className="pb-3">Action Point</th>
                <th className="pb-3">Committee</th>
                <th className="pb-3">Owner</th>
                <th className="pb-3">Due Date / SLA</th>
                <th className="pb-3">Priority</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-800">
              {filteredUrgentActions.map((a: UrgentDashboardAction) => (
                <tr key={a.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="py-3">
                    <button
                      onClick={() => setSelectedActionId(a.id)}
                      className="text-left font-semibold text-ink transition hover:text-brand-600 dark:text-slate-100 dark:hover:text-brand-400"
                    >
                      {a.title}
                    </button>
                  </td>
                  <td className="py-3">
                    <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                      {a.committee.name}
                    </span>
                  </td>
                  <td className="py-3 text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-medium">{a.owner.fullName}</span>
                    {a.owner.department && (
                      <span className="block text-[11px] text-slate-400">{a.owner.department}</span>
                    )}
                  </td>
                  <td className="py-3 text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{formatDate(a.deadline)}</span>
                    <div className="mt-0.5">
                      <DueBadge deadline={a.deadline} status={a.status as any} />
                    </div>
                  </td>
                  <td className="py-3">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold border ${
                        PRIORITY_BADGES[a.priority]?.className ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {PRIORITY_BADGES[a.priority]?.label ?? a.priority}
                    </span>
                  </td>
                  <td className="py-3">
                    <StatusPill status={a.status as any} />
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => setSelectedActionId(a.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition"
                    >
                      Inspect <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredUrgentActions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-slate-400">
                    No urgent action points currently match the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Detail Slide-over / Modal */}
      {selectedActionId && (
        <ActionDetailPanel
          actionId={selectedActionId}
          onClose={() => setSelectedActionId(null)}
          onChanged={() => {
            loadDashboard();
          }}
        />
      )}
    </div>
  );
}

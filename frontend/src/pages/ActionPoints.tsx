import { useEffect, useState } from "react";
import { Download, Search } from "lucide-react";
import { useFlash } from "@/state/toastContext";
import { useAuth } from "@/state/authContext";
import { endpoints } from "@/api/endpoints";
import { StatusPill, DueBadge, ProgressBar, formatDate } from "@/components/StatusBits";
import { ActionDetailPanel } from "@/components/ActionDetailPanel";
import { LoadingLogo } from "@/components/LoadingLogo";
import type { ActionListItem, CommitteeSummary } from "@/types";

const STATUS_FILTERS = ["All", "Open", "In Progress", "Pending Verification", "Overdue", "Completed", "Cancelled"];

export default function ActionPoints() {
  const flash = useFlash();
  const { me } = useAuth();
  const isCentral = Boolean(me?.isCentralCommittee || me?.isAdmin);
  const [exporting, setExporting] = useState(false);
  const [items, setItems] = useState<ActionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("All");
  const [query, setQuery] = useState("");
  const [committeeId, setCommitteeId] = useState<number | "">("");
  const [committees, setCommittees] = useState<CommitteeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openActionId, setOpenActionId] = useState<number | null>(null);

  useEffect(() => {
    if (isCentral) {
      endpoints.committees().then(setCommittees).catch(() => setCommittees([]));
    }
  }, [isCentral]);

  const load = () => {
    setLoading(true);
    endpoints
      .allActions({
        status: status !== "All" ? status : undefined,
        q: query || undefined,
        committeeId: committeeId !== "" ? Number(committeeId) : undefined,
      })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err: any) => flash(err?.message ?? "Failed to load actions", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const handle = window.setTimeout(load, 200);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, query, committeeId]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink dark:text-white">Action points</h1>
          <p className="text-sm text-slate-500">
            {isCentral
              ? "Bank-wide register. Filter by committee as needed."
              : "Actions assigned to you as owner. Open a committee workspace for the full committee register."}
          </p>
        </div>
        <button
          type="button"
          className="btn text-xs"
          disabled={exporting}
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
      </div>

      <div className="card">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                  status === s ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600 dark:bg-slate-700 dark:text-slate-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {isCentral && (
              <select
                className="field-input py-1.5 text-sm"
                value={committeeId}
                onChange={(e) => setCommitteeId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">All committees</option>
                {committees.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                className="field-input w-full pl-9 sm:w-64"
                placeholder="Search reference or title…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <LoadingLogo scope="container" message="Loading actions…" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700">
                  <th className="py-2 pr-3">Reference</th>
                  <th className="py-2 pr-3">Title</th>
                  <th className="py-2 pr-3">Committee</th>
                  <th className="py-2 pr-3">Owner</th>
                  <th className="py-2 pr-3">Start date</th>
                  <th className="py-2 pr-3">Deadline</th>
                  <th className="py-2 pr-3">Progress</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => setOpenActionId(a.id)}
                    className="cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/60 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  >
                    <td className="py-2.5 pr-3 font-medium text-slate-700 dark:text-slate-200">{a.referenceNo}</td>
                    <td className="py-2.5 pr-3">{a.title}</td>
                    <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{a.committee?.name ?? "—"}</td>
                    <td className="py-2.5 pr-3">{a.owner.fullName}</td>
                    <td className="py-2.5 pr-3">{formatDate(a.dateRaised ?? a.createdAt)}</td>
                    <td className="py-2.5 pr-3">
                      {formatDate(a.deadline)}
                      <br />
                      <DueBadge deadline={a.deadline} status={a.status} />
                    </td>
                    <td className="py-2.5 pr-3">
                      <ProgressBar value={a.progress} />
                    </td>
                    <td className="py-2.5">
                      <StatusPill status={a.status} />
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No action points match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">{total} action{total === 1 ? "" : "s"} · newest first</p>
      </div>

      {openActionId && (
        <ActionDetailPanel actionId={openActionId} onClose={() => setOpenActionId(null)} onChanged={load} />
      )}
    </div>
  );
}

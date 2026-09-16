import { useEffect, useState } from "react";
import { Download, Search } from "lucide-react";
import { useFlash } from "@/state/toastContext";
import { endpoints } from "@/api/endpoints";
import { StatusPill, DueBadge, ProgressBar, formatDate } from "@/components/StatusBits";
import { ActionDetailPanel } from "@/components/ActionDetailPanel";
import { LoadingLogo } from "@/components/LoadingLogo";
import type { ActionListItem } from "@/types";

const STATUS_FILTERS = ["All", "Open", "In Progress", "Pending Verification", "Overdue", "Completed", "Cancelled"];

export default function ActionPoints() {
  const flash = useFlash();
  const [exporting, setExporting] = useState(false);
  const [items, setItems] = useState<ActionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("All");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [openActionId, setOpenActionId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    endpoints
      .allActions({ status: status !== "All" ? status : undefined, q: query || undefined })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const handle = window.setTimeout(load, 200);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, query]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink dark:text-white">Action points</h1>
          <p className="text-sm text-slate-500">Consolidated register across every committee you can view.</p>
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
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${status === s ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex w-full shrink-0 items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 sm:w-auto">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              className="w-full min-w-0 text-sm outline-none sm:w-52 bg-inherit"
              placeholder="Search title or reference"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-2">Reference</th>
                <th className="pb-2">Action</th>
                <th className="pb-2">Committee</th>
                <th className="pb-2">Owner</th>
                <th className="pb-2">Deadline</th>
                <th className="pb-2">Progress</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setOpenActionId(a.id)}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="py-2.5 font-medium text-slate-700 dark:text-slate-200">{a.referenceNo}</td>
                  <td className="py-2.5">{a.title}</td>
                  <td className="py-2.5 text-slate-500">{a.committee?.name}</td>
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
              {loading && (
                <tr>
                  <td colSpan={7} className="py-8">
                    <LoadingLogo scope="container" size="sm" message="Loading action points..." />
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No action points match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-400">{total} action point(s) in total.</p>
      </div>

      {openActionId && (
        <ActionDetailPanel actionId={openActionId} onClose={() => setOpenActionId(null)} onChanged={load} />
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { endpoints } from "@/api/endpoints";
import { LoadingLogo } from "@/components/LoadingLogo";
import { AddCommitteeModal } from "@/components/modals/AddCommitteeModal";
import { useAuth } from "@/state/authContext";
import { canCreateCommittee } from "@/lib/permissions";
import type { CommitteeSummary } from "@/types";

export default function Committees() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [committees, setCommittees] = useState<CommitteeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = () => {
    setLoading(true);
    endpoints
      .committees()
      .then(setCommittees)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink dark:text-white">Committees</h1>
          <p className="text-sm text-slate-500">
            {me?.isCentralCommittee ? "Every committee across the Bank." : "Committees you are a member of."}
          </p>
        </div>
        {canCreateCommittee(me) && (
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" /> New committee
          </button>
        )}
      </div>

      {loading && <LoadingLogo scope="container" message="Loading committees..." />}
      {!loading && committees.length === 0 && (
        <p className="card text-sm text-slate-400">No committees to show yet.</p>
      )}

      {!loading && committees.length > 0 && (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                  <th className="px-4 py-3 font-semibold">Committee</th>
                  <th className="px-4 py-3 font-semibold">Code</th>
                  <th className="px-4 py-3 font-semibold">Your role</th>
                  <th className="px-4 py-3 font-semibold">Frequency</th>
                  <th className="px-4 py-3 font-semibold text-right">Total</th>
                  <th className="px-4 py-3 font-semibold text-right">Active</th>
                  <th className="px-4 py-3 font-semibold text-right">Overdue</th>
                  <th className="px-4 py-3 font-semibold text-right">On-time</th>
                </tr>
              </thead>
              <tbody>
                {committees.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/committees/${c.id}`)}
                    className="cursor-pointer border-b border-slate-100 dark:border-slate-700 transition last:border-0 hover:bg-brand-50/40 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800 dark:text-slate-100">{c.name}</div>
                      {c.mandate && (
                        <div className="mt-0.5 max-w-xs truncate text-xs text-slate-400">{c.mandate}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{c.code}</td>
                    <td className="px-4 py-3">
                      {c.myRole ? (
                        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                          {c.myRole === "CHAIRPERSON"
                            ? "Chairperson"
                            : c.myRole === "SECRETARY"
                              ? "Secretary"
                              : "Member"}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{c.meetingFrequency ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{c.totalActions}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-blue-700 dark:text-blue-300">{c.activeActions}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-700 dark:text-red-300">{c.overdueActions}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                      {c.onTimeRate != null ? `${c.onTimeRate}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAdd && (
        <AddCommitteeModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Users } from "lucide-react";
import { endpoints } from "@/api/endpoints";
import { useAuth } from "@/state/authContext";
import { AddCommitteeModal } from "@/components/modals/AddCommitteeModal";
import { LoadingLogo } from "@/components/LoadingLogo";
import type { CommitteeSummary } from "@/types";

export default function Committees() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [committees, setCommittees] = useState<CommitteeSummary[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    endpoints.committees().then((data) => {
      setCommittees(data);
      setLoading(false);
    });
  };

  useEffect(load, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Committees</h1>
          <p className="text-sm text-slate-500">
            {me?.isCentralCommittee ? "Every committee across the Bank." : "Committees you are a member of."}
          </p>
        </div>
        {(me?.isCentralCommittee || me?.isAdmin) && (
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" /> New committee
          </button>
        )}
      </div>

      {loading && <LoadingLogo scope="container" message="Loading committees..." />}
      {!loading && committees.length === 0 && (
        <p className="card text-sm text-slate-400">No committees to show yet.</p>
      )}

      <div className="grid grid-cols-2 gap-4">
        {committees.map((c) => (
          <button
            key={c.id}
            onClick={() => navigate(`/committees/${c.id}`)}
            className="card text-left transition hover:border-brand-300 hover:shadow-md"
          >
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="font-bold text-ink">{c.name}</h3>
                <p className="text-xs text-slate-400">{c.code} · {c.meetingFrequency ?? "—"}</p>
              </div>
              {c.myRole && (
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                  {c.myRole === "CHAIRPERSON" ? "Chairperson" : c.myRole === "SECRETARY" ? "Secretary" : "Member"}
                </span>
              )}
            </div>

            <div className="mb-3 grid grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded-lg bg-slate-50 p-2">
                <b className="block text-sm text-ink">{c.totalActions}</b>Total
              </div>
              <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
                <b className="block text-sm">{c.activeActions}</b>Active
              </div>
              <div className="rounded-lg bg-red-50 p-2 text-red-700">
                <b className="block text-sm">{c.overdueActions}</b>Overdue
              </div>
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                <b className="block text-sm">{c.onTimeRate ?? "—"}%</b>On-time
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Users className="h-3.5 w-3.5" />
              Chair: {c.chairperson.fullName} · Secretary: {c.secretary.fullName}
            </div>
          </button>
        ))}
      </div>

      {showAdd && <AddCommitteeModal onClose={() => setShowAdd(false)} onCreated={load} />}
    </div>
  );
}

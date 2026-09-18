import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { endpoints } from "@/api/endpoints";
import { useAuth } from "@/state/authContext";
import type { CommitteeRole } from "@/types";

interface DevUserMembership {
  committeeId: number;
  role: CommitteeRole;
  committee?: { id: number; name: string; code: string };
}

interface DevUser {
  id: number;
  fullName: string;
  email: string;
  department: string | null;
  isCentralCommittee: boolean;
  isAdmin: boolean;
  memberships?: DevUserMembership[];
}

const ROLE_LABELS: Record<CommitteeRole, string> = {
  CHAIRPERSON: "Chairperson",
  SECRETARY: "Secretary",
  MEMBER: "Member",
};

function roleBadgeClass(role: CommitteeRole): string {
  switch (role) {
    case "CHAIRPERSON":
      return "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900";
    case "SECRETARY":
      return "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
  }
}

export default function DevSignIn() {
  const [users, setUsers] = useState<DevUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    endpoints
      .devUsers()
      .then(setUsers)
      .catch(() =>
        setError(
          "The developer sign-in list is unavailable. In production this screen is replaced entirely by Microsoft Entra ID sign-in.",
        ),
      );
  }, []);

  const choose = async (id: number) => {
    await signIn(id);
    navigate("/committees");
  };

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-700 via-brand-500 to-slate-100 p-4 sm:p-7">
      <section className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl sm:p-8 dark:bg-slate-900">
        <div className="mb-6 flex items-center gap-3.5">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-navy text-lg font-bold text-white">
            CA
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink dark:text-white">Committee Action Monitor</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Sign in to continue with your assigned access.</p>
          </div>
        </div>

        {error && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">{error}</p>}

        <div className="max-h-[480px] space-y-2 overflow-y-auto">
          {users.map((u) => {
            const memberships = u.memberships ?? [];
            return (
              <button
                key={u.id}
                onClick={() => choose(u.id)}
                className="flex w-full items-start justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3.5 text-left transition hover:border-brand-300 hover:bg-brand-50 dark:border-slate-700 dark:hover:border-brand-700 dark:hover:bg-brand-950/30"
              >
                <div className="min-w-0 flex-1">
                  <b className="text-sm text-slate-900 dark:text-slate-100">{u.fullName}</b>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {u.isAdmin
                      ? " · Central Committee Administrator"
                      : u.isCentralCommittee
                        ? " · Central Committee Member"
                        : ""}
                  </p>

                  {memberships.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {memberships.map((m) => {
                        const committeeLabel =
                          m.committee?.name ??
                          m.committee?.code ??
                          `Committee #${m.committeeId}`;
                        return (
                          <li
                            key={`${m.committeeId}-${m.role}`}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${roleBadgeClass(m.role)}`}
                          >
                            <span className="font-semibold">{ROLE_LABELS[m.role]}</span>
                            <span className="opacity-70">·</span>
                            <span className="truncate max-w-[140px] sm:max-w-[180px]">{committeeLabel}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    !u.isCentralCommittee &&
                    !u.isAdmin && (
                      <p className="mt-1.5 text-[11px] text-slate-400">No committee memberships</p>
                    )
                  )}
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
              </button>
            );
          })}
        </div>

        <p className="mt-6 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          Production access will match the signed-in Microsoft Entra ID user to committee membership and role
          assignments — this picker exists only because this environment has no live Entra tenant configured.
        </p>
      </section>
    </main>
  );
}

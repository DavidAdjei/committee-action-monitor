import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { endpoints } from "@/api/endpoints";
import { useAuth } from "@/state/authContext";
import { useTheme } from "@/state/themeContext";
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
  centralRole?: "MEMBER" | "ADMINISTRATOR" | null;
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
  const { signInDev, signInWithMicrosoft, entraEnabled, devAuthEnabled, me, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [msBusy, setMsBusy] = useState(false);

  useEffect(() => {
    if (me && !loading) navigate("/committees", { replace: true });
  }, [me, loading, navigate]);

  useEffect(() => {
    if (!devAuthEnabled) return;
    endpoints
      .devUsers()
      .then(setUsers)
      .catch(() =>
        setError(
          entraEnabled
            ? "Developer user list is off or unavailable. Sign in with Microsoft below."
            : "The developer sign-in list is unavailable. Configure Entra or enable DEV_AUTH on the API.",
        ),
      );
  }, [devAuthEnabled, entraEnabled]);

  const choose = async (id: number) => {
    await signInDev(id);
    navigate("/committees");
  };

  const microsoft = async () => {
    setMsBusy(true);
    setError(null);
    try {
      await signInWithMicrosoft();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Microsoft sign-in failed.");
      setMsBusy(false);
    }
  };

  return (
    <main
      className="relative grid min-h-screen place-items-center overflow-hidden p-4 sm:p-7"
      style={{
        backgroundColor: theme === "dark" ? "#071525" : "#E8F1F8",
        backgroundImage: `url(${theme === "dark" ? "/signin-bg-dark.svg" : "/signin-bg-light.svg"})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div
        className={`pointer-events-none absolute inset-0 ${
          theme === "dark" ? "bg-slate-950/30" : "bg-white/10"
        }`}
        aria-hidden
      />
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute right-4 top-4 z-20 rounded-full border border-white/20 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur hover:bg-white dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800"
        aria-label="Toggle color theme"
      >
        {theme === "dark" ? "Light mode" : "Dark mode"}
      </button>
      <section className="relative z-10 w-full max-w-2xl rounded-2xl bg-white/95 p-5 shadow-2xl backdrop-blur-sm sm:p-8 dark:bg-slate-900/95">
        <div className="mb-6 flex items-center gap-3.5">
          <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
            <img
              src="/umb-logo.png"
              alt="UMB"
              className="h-full w-full object-contain"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink dark:text-white">Committee Action Monitor</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Sign in to continue with your assigned access.</p>
          </div>
        </div>

        {entraEnabled && (
          <button
            type="button"
            className="btn-primary mb-4 w-full justify-center gap-2 py-3 text-sm"
            disabled={msBusy}
            onClick={() => void microsoft()}
          >
            <svg className="h-4 w-4" viewBox="0 0 21 21" aria-hidden>
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            {msBusy ? "Redirecting to Microsoft…" : "Sign in with Microsoft"}
          </button>
        )}

        {entraEnabled && devAuthEnabled && (
          <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
            or continue with a demo account
          </p>
        )}

        {error && (
          <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {error}
          </p>
        )}

        {devAuthEnabled && (
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
                    {u.department ?? "—"}
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
        )}

        <p className="mt-6 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          {entraEnabled
            ? "Sign in with your bank Microsoft account. Access follows committee memberships configured in this system."
            : "Configure Entra (VITE_ENTRA_*) for Microsoft sign-in, or use a demo account when the API has DEV_AUTH_ENABLED=true."}
        </p>
      </section>
    </main>
  );
}

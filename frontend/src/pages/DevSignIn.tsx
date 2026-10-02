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
      return "bg-amber-50 text-amber-800 border-amber-200/80 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800/60";
    case "SECRETARY":
      return "bg-sky-50 text-sky-800 border-sky-200/80 dark:bg-sky-950/60 dark:text-sky-200 dark:border-sky-800/60";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
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
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10 sm:px-6"
      style={{
        backgroundColor: theme === "dark" ? "#06101c" : "#eef4f9",
        backgroundImage: `url(${theme === "dark" ? "/signin-bg-dark.svg" : "/signin-bg-light.svg"})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div
        className={`pointer-events-none absolute inset-0 ${
          theme === "dark" ? "bg-gradient-to-b from-slate-950/40 via-transparent to-slate-950/60" : "bg-gradient-to-b from-white/20 via-transparent to-slate-100/50"
        }`}
        aria-hidden
      />

      <button
        type="button"
        onClick={toggleTheme}
        className="absolute right-4 top-4 z-20 rounded-full border border-white/30 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm backdrop-blur-md transition hover:bg-white dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-800"
        aria-label="Toggle color theme"
      >
        {theme === "dark" ? "Light mode" : "Dark mode"}
      </button>

      <div className="relative z-10 w-full max-w-[420px]">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-slate-200/80 dark:bg-slate-800 dark:ring-slate-700">
            <img
              src="/umb-logo.png"
              alt="UMB"
              className="h-10 w-10 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">
            Universal Merchant Bank
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Committee Action Monitor
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Track committee meetings, minutes, and action points — with access based on your role.
          </p>
        </div>

        {/* Card */}
        <section className="rounded-2xl border border-white/60 bg-white/95 p-6 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.25)] backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/90 dark:shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)] sm:p-7">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Sign in to continue</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Use your bank Microsoft account.
            </p>
          </div>

          {entraEnabled && (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#2f2f2f] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f1f1f] disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              disabled={msBusy}
              onClick={() => void microsoft()}
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 21 21" aria-hidden>
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              {msBusy ? "Redirecting…" : "Sign in with Microsoft"}
            </button>
          )}

          {entraEnabled && devAuthEnabled && (
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">or demo</span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>
          )}

          {error && (
            <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
              {error}
            </p>
          )}

          {devAuthEnabled && (
            <div className="max-h-[min(340px,42vh)] space-y-1.5 overflow-y-auto pr-0.5">
              {users.map((u) => {
                const memberships = u.memberships ?? [];
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => void choose(u.id)}
                    className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-800/70"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[11px] font-bold text-white shadow-sm">
                      {u.fullName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {u.fullName}
                      </span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {u.isAdmin
                          ? "Administrator"
                          : u.isCentralCommittee
                            ? "Central Committee"
                            : (u.department ?? u.email)}
                      </span>
                      {memberships.length > 0 && (
                        <span className="mt-1.5 flex flex-wrap gap-1">
                          {memberships.slice(0, 3).map((m) => (
                            <span
                              key={`${m.committeeId}-${m.role}`}
                              className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${roleBadgeClass(m.role)}`}
                            >
                              {ROLE_LABELS[m.role]}
                              {m.committee?.code ? ` · ${m.committee.code}` : ""}
                            </span>
                          ))}
                          {memberships.length > 3 && (
                            <span className="text-[10px] text-slate-400">+{memberships.length - 3}</span>
                          )}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-slate-500 dark:text-slate-600 dark:group-hover:text-slate-400" />
                  </button>
                );
              })}
            </div>
          )}

          {!entraEnabled && !devAuthEnabled && (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
              Sign-in is not configured. Set Entra variables or enable{" "}
              <code className="rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">DEV_AUTH_ENABLED</code> on the
              API.
            </p>
          )}

          <div className="mt-5 flex items-start gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
              {entraEnabled
                ? "Secured by Microsoft Entra ID. Your password is never stored in CAM. Sign-out ends only this app session."
                : "Configure Entra (VITE_ENTRA_*) for Microsoft sign-in, or use demo accounts when DEV_AUTH is enabled."}
            </p>
          </div>
        </section>

        {/* Subtle footer context */}
        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-500/90 dark:text-slate-500">
          Meetings · Minutes · Action points · Role-based committee access
        </p>
      </div>
    </main>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  Moon,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import { useAuth } from "@/state/authContext";
import { useTheme } from "@/state/themeContext";
import { homePathFor } from "@/lib/homePath";

/**
 * Production sign-in: Microsoft Entra ID only.
 * Fully theme-aware (light / dark).
 */
export default function SignIn() {
  const { signInWithMicrosoft, me, loading, authError, clearAuthError } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [msBusy, setMsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayError = error ?? authError;
  const isDark = theme === "dark";

  useEffect(() => {
    if (me && !loading) navigate(homePathFor(me), { replace: true });
  }, [me, loading, navigate]);

  const microsoft = async () => {
    setMsBusy(true);
    setError(null);
    clearAuthError();
    try {
      await signInWithMicrosoft();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microsoft sign-in failed.");
      setMsBusy(false);
    }
  };

  const features = [
    {
      icon: CalendarDays,
      title: "Meetings",
      body: "Schedule committee meetings, attach papers, and optionally create a Teams link.",
    },
    {
      icon: FileText,
      title: "Minutes",
      body: "Import draft or final minutes and keep documents available per meeting.",
    },
    {
      icon: ClipboardList,
      title: "Action points",
      body: "Assign owners, track progress, and verify completion with optional evidence.",
    },
    {
      icon: Users,
      title: "Role-based access",
      body: "Chair, secretary, members, and central committee each see what they need.",
    },
  ];

  return (
    <main
      className={`relative min-h-screen overflow-hidden transition-colors ${
        isDark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
      }`}
    >
      {/* Ambient background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: isDark
            ? "radial-gradient(ellipse 80% 50% at 50% -15%, rgba(91,33,182,0.35), transparent), radial-gradient(ellipse 50% 40% at 100% 20%, rgba(212,160,23,0.12), transparent), radial-gradient(ellipse 40% 30% at 0% 80%, rgba(91,33,182,0.15), transparent)"
            : "radial-gradient(ellipse 80% 50% at 50% -15%, rgba(91,33,182,0.12), transparent), radial-gradient(ellipse 50% 40% at 100% 20%, rgba(244,166,35,0.15), transparent), radial-gradient(ellipse 40% 30% at 0% 80%, rgba(91,33,182,0.06), transparent)",
        }}
      />

      {/* Theme toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className={`absolute right-4 top-4 z-20 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium shadow-sm transition ${
          isDark
            ? "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
        }`}
      >
        {isDark ? <Sun className="h-3.5 w-3.5 text-amber-300" /> : <Moon className="h-3.5 w-3.5 text-brand-600" />}
        {isDark ? "Light mode" : "Dark mode"}
      </button>

      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-2 lg:gap-16 lg:py-20">
        {/* Left: product context */}
        <div className="order-2 lg:order-1">
          <p
            className={`text-xs font-semibold uppercase tracking-[0.22em] ${
              isDark ? "text-brand-300/90" : "text-brand-700"
            }`}
          >
            Universal Merchant Bank
          </p>
          <h1
            className={`mt-3 text-3xl font-bold tracking-tight sm:text-4xl lg:text-[2.75rem] lg:leading-tight ${
              isDark ? "text-white" : "text-slate-900"
            }`}
          >
            Committee Action Monitor
          </h1>
          <p className={`mt-4 max-w-md text-sm leading-relaxed sm:text-base ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            The bank’s workspace for committee effectiveness — track meetings from invitation through
            minutes and close out every action point with clear ownership and accountability.
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, body }) => (
              <li
                key={title}
                className={`rounded-xl border p-3.5 ${
                  isDark
                    ? "border-white/10 bg-white/[0.03]"
                    : "border-slate-200/80 bg-white/80 shadow-sm"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isDark ? "bg-brand-500/20 text-brand-300" : "bg-brand-50 text-brand-700"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className={`text-sm font-semibold ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                      {title}
                    </p>
                    <p className={`mt-0.5 text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      {body}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div
            className={`mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] ${
              isDark ? "text-slate-500" : "text-slate-500"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              Entra ID secured
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              App-only sign-out
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              Cyber & Information Security
            </span>
          </div>
        </div>

        {/* Right: sign-in card */}
        <div className="order-1 lg:order-2">
          <section
            className={`rounded-2xl border p-6 shadow-xl sm:p-8 ${
              isDark
                ? "border-white/10 bg-slate-900/85 backdrop-blur"
                : "border-slate-200 bg-white shadow-slate-200/60"
            }`}
          >
            <div className="mb-6 text-center sm:text-left">
              <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                Sign in to continue
              </h2>
              <p className={`mt-1.5 text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Use your UMB Microsoft work account. Access is limited to accounts provisioned in
                Committee Action Monitor (directory sync).
              </p>
            </div>

            {displayError && (
              <div
                className={`mb-4 rounded-xl border px-3.5 py-3 text-sm leading-relaxed ${
                  isDark
                    ? "border-red-500/30 bg-red-500/10 text-red-200"
                    : "border-red-200 bg-red-50 text-red-800"
                }`}
                role="alert"
              >
                {displayError}
              </div>
            )}

            <button
              type="button"
              disabled={msBusy || loading}
              onClick={() => void microsoft()}
              className={`flex w-full items-center justify-center gap-2.5 rounded-xl px-4 py-3.5 text-sm font-semibold shadow-md transition disabled:cursor-not-allowed disabled:opacity-60 ${
                isDark
                  ? "bg-white text-slate-900 hover:bg-slate-100"
                  : "bg-slate-900 text-white hover:bg-slate-800"
              }`}
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 21 21" aria-hidden>
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              {msBusy ? "Redirecting to Microsoft…" : "Sign in with Microsoft"}
            </button>

            <div
              className={`mt-5 flex items-start gap-2.5 border-t pt-4 ${
                isDark ? "border-white/10" : "border-slate-100"
              }`}
            >
              <ShieldCheck
                className={`mt-0.5 h-4 w-4 shrink-0 ${isDark ? "text-brand-400" : "text-brand-600"}`}
              />
              <p className={`text-[11px] leading-relaxed ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                Secured by Microsoft Entra ID. Your password is never stored in CAM. Signing out ends
                only this app session — Teams, Outlook, and other Microsoft apps stay signed in.
              </p>
            </div>
          </section>

          <p className={`mt-5 text-center text-[11px] leading-relaxed ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            Need access? Contact your committee secretary or Cyber & Information Security.
          </p>
        </div>
      </div>
    </main>
  );
}

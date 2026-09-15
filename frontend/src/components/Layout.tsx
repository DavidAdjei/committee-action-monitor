import { NavLink, useNavigate } from "react-router-dom";
import { Bell, Building2, LayoutDashboard, ListChecks, LogOut, ShieldCheck, Moon, Sun } from "lucide-react";
import { useAuth } from "@/state/authContext";
import { useTheme } from "@/state/themeContext";
import { useLoadingStore } from "@/state/loadingStore";
import { initials } from "@/components/StatusBits";
import type { ReactNode } from "react";

function NavItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
          isActive ? "bg-brand-600 text-white shadow-sm" : "text-slate-200 hover:bg-white/10"
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { me, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isGlobalLoading = useLoadingStore((s) => s.isLoading);
  const navigate = useNavigate();

  if (!me) return null;

  const roleLabel = me.isAdmin
    ? "Central Committee Administrator"
    : me.isCentralCommittee
      ? "Central Committee Member"
      : me.memberships.find((m) => m.role === "CHAIRPERSON")
        ? "Committee Chairperson"
        : me.memberships.find((m) => m.role === "SECRETARY")
          ? "Committee Secretary"
          : "Committee Member";

  return (
    <div className="flex min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* Top global loading progress bar */}
      {isGlobalLoading && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-brand-500 overflow-hidden shadow-sm">
          <div className="h-full w-full bg-brand-400 animate-pulse" />
        </div>
      )}

      <aside className="flex w-64 shrink-0 flex-col justify-between bg-navy px-4 py-6 text-white">
        <div>
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500 text-white font-bold overflow-hidden p-1 shadow-sm">
              <img
                src=""
                alt="UMB Logo"
                className="max-h-full max-w-full object-contain select-none"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = "none";
                }}
              />
              <span className="text-xs font-black tracking-wider">UMB</span>
            </div>
            <div className="text-sm font-semibold leading-tight text-white">
              Committee
              <br />
              Action Monitor
            </div>
          </div>
          <nav className="flex flex-col gap-1">
            {me.isCentralCommittee && (
              <NavItem to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" />
            )}
            <NavItem to="/committees" icon={<Building2 className="h-4 w-4" />} label="Committees" />
            <NavItem to="/actions" icon={<ListChecks className="h-4 w-4" />} label="Action Points" />
            <NavItem to="/notifications" icon={<Bell className="h-4 w-4" />} label="Notifications" />
          </nav>
        </div>
        <button
          onClick={() => {
            signOut();
            navigate("/signin");
          }}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/10"
        >
          <LogOut className="h-4 w-4" /> Switch user
        </button>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-3.5 dark:bg-slate-900 dark:border-slate-700">
          <div className="flex items-center gap-2 text-xs font-semibold text-brand-600">
            <ShieldCheck className="h-4 w-4" /> {roleLabel}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-600 dark:text-slate-300"
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </button>
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{me.fullName}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{me.department ?? "—"}</div>
              </div>
              <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 dark:bg-brand-900 text-xs font-bold text-brand-700 dark:text-brand-200">
                {initials(me.fullName)}
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 px-8 py-6 bg-slate-50 dark:bg-slate-950">{children}</main>
      </div>
    </div>
  );
}

import { NavLink, useNavigate } from "react-router-dom";
import { Bell, Building2, CalendarDays, LayoutDashboard, ListChecks, LogOut, ShieldCheck, Moon, Sun, Menu, X } from "lucide-react";
import { useAuth } from "@/state/authContext";
import { useTheme } from "@/state/themeContext";
import { useLoadingStore } from "@/state/loadingStore";
import { initials } from "@/components/StatusBits";
import { useEffect, useState, type ReactNode } from "react";

function NavItem({
  to,
  icon,
  label,
  onClick,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close mobile nav on route change / resize to desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setMobileNavOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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

  const closeMobile = () => setMobileNavOpen(false);

  const sidebarContent = (
    <>
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
            <NavItem
              to="/dashboard"
              icon={<LayoutDashboard className="h-4 w-4" />}
              label="Dashboard"
              onClick={closeMobile}
            />
          )}
          <NavItem
            to="/committees"
            icon={<Building2 className="h-4 w-4" />}
            label="Committees"
            onClick={closeMobile}
          />
          <NavItem
            to="/actions"
            icon={<ListChecks className="h-4 w-4" />}
            label="Action Points"
            onClick={closeMobile}
          />
          <NavItem
            to="/calendar"
            icon={<CalendarDays className="h-4 w-4" />}
            label="Calendar"
            onClick={closeMobile}
          />
          <NavItem
            to="/notifications"
            icon={<Bell className="h-4 w-4" />}
            label="Notifications"
            onClick={closeMobile}
          />
        </nav>
      </div>
      <button
        onClick={() => {
          signOut();
          navigate("/signin");
          closeMobile();
        }}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/10"
      >
        <LogOut className="h-4 w-4" /> Switch user
      </button>
    </>
  );

  return (
    <>
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <div className="flex min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* Top global loading progress bar */}
      {isGlobalLoading && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-brand-500 overflow-hidden shadow-sm">
          <div className="h-full w-full bg-brand-400 animate-pulse" />
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col justify-between bg-navy px-4 py-6 text-white">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={closeMobile} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col justify-between bg-navy px-4 py-6 text-white shadow-xl">
            <div className="absolute right-3 top-3">
              <button
                type="button"
                onClick={closeMobile}
                className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3.5 sm:px-6 md:px-8 dark:bg-slate-900 dark:border-slate-700">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="mr-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800/50 md:hidden dark:text-slate-300"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-brand-600">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span className="truncate">{roleLabel}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <button
              onClick={toggleTheme}
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/50 transition text-slate-600 dark:text-slate-300"
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </button>
            <div className="hidden h-6 w-px bg-slate-200 dark:bg-slate-700 sm:block" />
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden text-right sm:block">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{me.fullName}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{me.department ?? "—"}</div>
              </div>
              <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 dark:bg-brand-900 text-xs font-bold text-brand-700 dark:text-brand-200">
                {initials(me.fullName)}
              </div>
            </div>
          </div>
        </header>
        <main id="main-content" className="flex-1 overflow-x-auto px-4 py-4 sm:px-6 sm:py-6 md:px-8 bg-slate-50 dark:bg-slate-950">
          {children}
        </main>
      </div>
    </div>
    </>
  );
}

import { NavLink, useNavigate } from "react-router-dom";
import { Bell, Building2, CalendarDays, LayoutDashboard, ListChecks, LogOut, ShieldCheck, Moon, Sun, Menu, X, ChevronDown, RefreshCw } from "lucide-react";
import { useAuth } from "@/state/authContext";
import { useFlash } from "@/state/toastContext";
import { ApiClientError } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { useTheme } from "@/state/themeContext";
import { useLoadingStore } from "@/state/loadingStore";
import { initials } from "@/components/StatusBits";
import { useEffect, useRef, useState, type ReactNode } from "react";

function NavItem({
  to,
  icon,
  label,
  onClick,
  badge,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  badge?: number;
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
      <span className="relative">
        {icon}
        {badge != null && badge > 0 && (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="rounded-full bg-rose-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white md:hidden">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </NavLink>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { me, signOut } = useAuth();
  const flash = useFlash();
  const { theme, toggleTheme } = useTheme();
  const isGlobalLoading = useLoadingStore((s) => s.isLoading);
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);


  // Close mobile nav on route change / resize to desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setMobileNavOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Close user menu on outside click / Escape
  useEffect(() => {
    if (!userMenuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen]);

  // Unread in-app notifications badge
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      endpoints
        .notifications()
        .then((list) => {
          if (cancelled) return;
          const n = list.filter((x) => x.channel === "IN_APP" && !x.readAt).length;
          setUnreadCount(n);
        })
        .catch(() => {
          /* ignore — badge is non-critical */
        });
    };
    load();
    const t = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
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
          <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white overflow-hidden p-1 shadow-sm">
            <img
              src="/umb-logo.png"
              alt="UMB"
              className="h-full w-full object-contain select-none"
              onError={(e) => {
                const el = e.currentTarget;
                el.style.display = "none";
                const fallback = el.nextElementSibling as HTMLElement | null;
                if (fallback) fallback.classList.remove("hidden");
              }}
            />
            <span className="hidden text-xs font-black tracking-wider text-navy">UMB</span>
          </div>
          <div className="text-sm font-semibold leading-tight text-white">
            Committee
            <br />
            Action Monitor
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {(me.isCentralCommittee || me.isAdmin) && (
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
            badge={unreadCount}
          />
        </nav>
      </div>
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
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-white/5 bg-navy px-4 py-6 text-white md:flex">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={closeMobile} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col justify-between border-r border-white/5 bg-navy px-4 py-6 text-white shadow-xl">
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
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-800/50 sm:gap-3 sm:pr-2"
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
                aria-label="Account menu"
              >
                <div className="hidden text-right sm:block">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{me.fullName}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{me.department ?? "—"}</div>
                </div>
                <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-200">
                  {initials(me.fullName)}
                </div>
                <ChevronDown
                  className={`hidden h-4 w-4 text-slate-400 transition sm:block ${userMenuOpen ? "rotate-180" : ""}`}
                />
              </button>
              {userMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-2 w-56 origin-top-right rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="border-b border-slate-100 px-3.5 py-2.5 dark:border-slate-800 sm:hidden">
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{me.fullName}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{me.department ?? "—"}</div>
                  </div>
                  {me.isAdmin && (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={syncBusy}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800/50"
                      onClick={() => {
                        void (async () => {
                          setSyncBusy(true);
                          try {
                            const result = await endpoints.syncDirectory();
                            flash(
                              `Directory synced — ${result.created} created, ${result.updated} updated` +
                                (result.skipped ? `, ${result.skipped} skipped` : "") +
                                (result.graphConfigured === false ? " (Graph not configured)" : ""),
                              result.graphConfigured === false ? "error" : "success",
                            );
                          } catch (err: unknown) {
                            flash(
                              err instanceof ApiClientError
                                ? err.message
                                : "Directory sync failed.",
                              "error",
                            );
                          } finally {
                            setSyncBusy(false);
                            setUserMenuOpen(false);
                          }
                        })();
                      }}
                    >
                      <RefreshCw className={`h-4 w-4 text-slate-400 ${syncBusy ? "animate-spin" : ""}`} />
                      {syncBusy ? "Syncing…" : "Sync directory"}
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/50"
                    onClick={() => {
                      setUserMenuOpen(false);
                      void signOut().then(() => navigate("/signin"));
                    }}
                  >
                    <LogOut className="h-4 w-4 text-slate-400" />
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="main-content" className="flex-1 overflow-x-auto bg-slate-50 px-4 py-4 sm:px-6 sm:py-6 md:px-8 dark:bg-slate-950">
          {children}
        </main>
      </div>
    </div>
    </>
  );
}

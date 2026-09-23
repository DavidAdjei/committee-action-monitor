import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  MapPin,
  Clock,
  Building2,
  Video,
} from "lucide-react";
import { endpoints } from "@/api/endpoints";
import { LoadingLogo } from "@/components/LoadingLogo";
import { useFlash } from "@/state/toastContext";
import { ApiClientError } from "@/api/client";

type CalMeeting = {
  id: number;
  reference: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venue: string | null;
  teamsJoinUrl?: string | null;
  attendanceCount?: number;
  committee: { id: number; name: string; code: string };
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function dateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isSameDay(a: Date, b: Date) {
  return dateKey(a) === dateKey(b);
}

/** Monday-first calendar cells for a month */
function buildMonthGrid(month: Date): (Date | null)[] {
  const first = startOfMonth(month);
  // JS: 0=Sun..6=Sat → Mon=0..Sun=6
  const jsDay = first.getDay();
  const mondayIndex = (jsDay + 6) % 7;
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < mondayIndex; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(first.getFullYear(), first.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function CalendarPage() {
  const flash = useFlash();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [meetings, setMeetings] = useState<CalMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => dateKey(new Date()));

  const range = useMemo(() => {
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    from.setHours(0, 0, 0, 0);
    const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    to.setHours(23, 59, 59, 999);
    // Pad a week either side for edge display
    from.setDate(from.getDate() - 7);
    to.setDate(to.getDate() + 7);
    return { from, to };
  }, [cursor]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    endpoints
      .myMeetings({ from: range.from.toISOString(), to: range.to.toISOString() })
      .then((data) => {
        if (!cancelled) setMeetings(data as CalMeeting[]);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          flash(err instanceof ApiClientError ? err.message : "Could not load calendar.", "error");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.from.toISOString(), range.to.toISOString()]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalMeeting[]>();
    for (const m of meetings) {
      const k = dateKey(new Date(m.startsAt));
      const list = map.get(k) ?? [];
      list.push(m);
      map.set(k, list);
    }
    return map;
  }, [meetings]);

  const cells = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const today = new Date();
  const selectedMeetings = selectedKey ? byDay.get(selectedKey) ?? [] : [];

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const monthMeetingCount = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    return meetings.filter((mt) => {
      const d = new Date(mt.startsAt);
      return d.getFullYear() === y && d.getMonth() === m;
    }).length;
  }, [meetings, cursor]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-ink dark:text-white sm:text-2xl">
            <CalendarDays className="h-6 w-6 text-brand-600 dark:text-brand-400" />
            Meeting calendar
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Meetings for committees you belong to · {monthMeetingCount} this month
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn px-2.5"
            onClick={() => setCursor((c) => addMonths(c, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="btn min-w-[9rem] text-sm font-semibold"
            onClick={() => {
              const now = startOfMonth(new Date());
              setCursor(now);
              setSelectedKey(dateKey(new Date()));
            }}
          >
            {monthLabel}
          </button>
          <button
            type="button"
            className="btn px-2.5"
            onClick={() => setCursor((c) => addMonths(c, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Calendar grid */}
        <div className="card overflow-hidden p-3 sm:p-4 lg:col-span-3">
          {loading ? (
            <div className="flex justify-center py-16">
              <LoadingLogo message="Loading meetings…" />
            </div>
          ) : (
            <>
              <div className="mb-2 grid grid-cols-7 gap-1">
                {WEEKDAYS.map((d) => (
                  <div
                    key={d}
                    className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, i) => {
                  if (!day) {
                    return (
                      <div
                        key={`e-${i}`}
                        className="min-h-[3.25rem] rounded-lg bg-slate-50/50 sm:min-h-[4.5rem] dark:bg-slate-900/30"
                      />
                    );
                  }
                  const key = dateKey(day);
                  const dayMeetings = byDay.get(key) ?? [];
                  const has = dayMeetings.length > 0;
                  const isToday = isSameDay(day, today);
                  const isSelected = key === selectedKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedKey(key)}
                      className={[
                        "relative flex min-h-[3.25rem] flex-col items-stretch rounded-lg border p-1 text-left transition sm:min-h-[4.5rem] sm:p-1.5",
                        isSelected
                          ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/30 dark:border-brand-500 dark:bg-brand-950/40"
                          : has
                            ? "border-brand-200 bg-white hover:border-brand-400 dark:border-brand-900 dark:bg-slate-800 dark:hover:border-brand-600"
                            : "border-transparent bg-white hover:bg-slate-50 dark:bg-slate-800/60 dark:hover:bg-slate-800/50",
                        isToday && !isSelected ? "ring-1 ring-brand-400/50" : "",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                          isToday
                            ? "bg-brand-500 text-white"
                            : "text-slate-700 dark:text-slate-200",
                        ].join(" ")}
                      >
                        {day.getDate()}
                      </span>
                      {has && (
                        <div className="mt-auto flex flex-wrap gap-0.5 pt-0.5">
                          {dayMeetings.slice(0, 3).map((m) => (
                            <span
                              key={m.id}
                              className="hidden h-1.5 w-1.5 rounded-full bg-brand-500 sm:inline-block"
                              title={m.title}
                            />
                          ))}
                          <span className="text-[10px] font-semibold leading-none text-brand-700 dark:text-brand-300 sm:hidden">
                            {dayMeetings.length}
                          </span>
                        </div>
                      )}
                      {has && (
                        <div className="mt-0.5 hidden space-y-0.5 sm:block">
                          {dayMeetings.slice(0, 2).map((m) => (
                            <p
                              key={m.id}
                              className="truncate text-[10px] font-medium leading-tight text-brand-800 dark:text-brand-200"
                            >
                              {formatTime(m.startsAt)} {m.committee.code}
                            </p>
                          ))}
                          {dayMeetings.length > 2 && (
                            <p className="text-[10px] text-slate-400">+{dayMeetings.length - 2}</p>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
                Days with meetings are highlighted. Select a day to see details.
              </p>
            </>
          )}
        </div>

        {/* Day detail */}
        <div className="card flex flex-col lg:col-span-2">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            {selectedKey
              ? new Date(selectedKey + "T12:00:00").toLocaleDateString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : "Select a day"}
          </h2>
          <div className="mt-3 flex-1 space-y-3">
            {!selectedKey && (
              <p className="text-sm text-slate-500">Tap a date on the calendar.</p>
            )}
            {selectedKey && selectedMeetings.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center dark:border-slate-700 dark:bg-slate-900/40">
                <CalendarDays className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                  No meetings this day
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Only committees you are a member of are shown.
                </p>
              </div>
            )}
            {selectedMeetings.map((m) => {
              const start = new Date(m.startsAt);
              const end = m.endsAt ? new Date(m.endsAt) : null;
              const now = Date.now();
              const endMs = end ? end.getTime() : start.getTime() + 3 * 3600_000;
              const live = start.getTime() <= now && now <= endMs;
              return (
                <div
                  key={m.id}
                  className={[
                    "rounded-xl border p-3.5 transition",
                    live
                      ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30"
                      : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/80",
                  ].join(" ")}
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    {live && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                        Live
                      </span>
                    )}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                      {m.committee.code}
                    </span>
                    <span className="text-[11px] text-slate-400">{m.reference}</span>
                  </div>
                  <p className="font-semibold text-slate-900 dark:text-white">{m.title}</p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    <li className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      {formatTime(m.startsAt)}
                      {m.endsAt ? ` – ${formatTime(m.endsAt)}` : ""}
                    </li>
                    {m.venue && (
                      <li className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        {m.venue}
                      </li>
                    )}
                    <li className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      {m.committee.name}
                    </li>
                    {m.teamsJoinUrl && (
                      <li className="flex items-center gap-1.5">
                        <Video className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <a
                          href={m.teamsJoinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-brand-700 hover:underline dark:text-brand-300"
                        >
                          Join online
                        </a>
                      </li>
                    )}
                  </ul>
                  <Link
                    to={`/committees/${m.committee.id}`}
                    className="mt-3 inline-flex text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300"
                  >
                    Open committee workspace →
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

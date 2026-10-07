import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  MapPin,
  Plane,
  Plus,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { endpoints } from "@/api/endpoints";
import { LoadingLogo } from "@/components/LoadingLogo";
import { useFlash } from "@/state/toastContext";
import { ApiClientError } from "@/api/client";
import { useAuth } from "@/state/authContext";
import { UserTypeahead } from "@/components/UserTypeahead";
import type { CommitteeSummary } from "@/types";

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

type LeaveRow = {
  id: number;
  userId: number;
  startsOn: string;
  endsOn: string;
  note: string | null;
  user: { id: number; fullName: string; email: string; department?: string | null };
  createdBy: { id: number; fullName: string };
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Soft pastel chips matching org-calendar style */
const CHIP_PALETTE = [
  { bg: "bg-emerald-100 text-emerald-900 border-emerald-200", dot: "bg-emerald-400" },
  { bg: "bg-sky-100 text-sky-900 border-sky-200", dot: "bg-sky-400" },
  { bg: "bg-amber-100 text-amber-900 border-amber-200", dot: "bg-amber-400" },
  { bg: "bg-violet-100 text-violet-900 border-violet-200", dot: "bg-violet-400" },
  { bg: "bg-rose-100 text-rose-900 border-rose-200", dot: "bg-rose-400" },
  { bg: "bg-teal-100 text-teal-900 border-teal-200", dot: "bg-teal-400" },
  { bg: "bg-indigo-100 text-indigo-900 border-indigo-200", dot: "bg-indigo-400" },
  { bg: "bg-orange-100 text-orange-900 border-orange-200", dot: "bg-orange-400" },
];

function colorForCommittee(code: string) {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return CHIP_PALETTE[h % CHIP_PALETTE.length];
}

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

function buildMonthGrid(month: Date): (Date | null)[] {
  const first = startOfMonth(month);
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

function ymd(d: Date) {
  return dateKey(d);
}

/** Leave is active only while today is between startsOn and endsOn (inclusive). */
function leaveStatus(startsOn: string, endsOn: string, todayKey = ymd(new Date())): "upcoming" | "active" | "ended" {
  if (todayKey < startsOn) return "upcoming";
  if (todayKey > endsOn) return "ended";
  return "active";
}

type WeekBucket = { label: string; start: Date; end: Date };

/** Splits a month into Monday–Sunday week columns (clipped to the month), e.g. "3-9", "10-16" … */
function buildWeekBuckets(month: Date): WeekBucket[] {
  const first = startOfMonth(month);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const buckets: WeekBucket[] = [];
  let d = 1;
  while (d <= daysInMonth) {
    const date = new Date(first.getFullYear(), first.getMonth(), d);
    const mondayIndex = (date.getDay() + 6) % 7; // 0 = Monday
    const daysLeftInWeek = 7 - mondayIndex;
    const endDay = Math.min(d + daysLeftInWeek - 1, daysInMonth);
    buckets.push({
      label: d === endDay ? `${d}` : `${d}-${endDay}`,
      start: new Date(first.getFullYear(), first.getMonth(), d),
      end: new Date(first.getFullYear(), first.getMonth(), endDay),
    });
    d = endDay + 1;
  }
  return buckets;
}

export default function CalendarPage() {
  const flash = useFlash();
  const { me } = useAuth();
  const isPlatformAdmin = Boolean(me?.isAdmin);

  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [meetings, setMeetings] = useState<CalMeeting[]>([]);
  const [leave, setLeave] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => dateKey(new Date()));

  // Team availability — shows the members of one committee at a time. A Central
  // Committee member sees every committee in the dropdown; everyone else only
  // sees the committee(s) they belong to (the /committees endpoint already
  // scopes the list that way).
  const [committeeOptions, setCommitteeOptions] = useState<CommitteeSummary[]>([]);
  const [availCommitteeId, setAvailCommitteeId] = useState<number | null>(null);
  const [availMembers, setAvailMembers] = useState<{ userId: number; fullName: string }[]>([]);
  const [availLoading, setAvailLoading] = useState(false);

  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveUser, setLeaveUser] = useState<{ id: number; fullName: string; email: string } | null>(null);
  const [leaveFrom, setLeaveFrom] = useState("");
  const [leaveTo, setLeaveTo] = useState("");
  const [leaveNote, setLeaveNote] = useState("");
  const [leaveBusy, setLeaveBusy] = useState(false);

  const range = useMemo(() => {
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    from.setHours(0, 0, 0, 0);
    const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    to.setHours(23, 59, 59, 999);
    from.setDate(from.getDate() - 7);
    to.setDate(to.getDate() + 14);
    return { from, to };
  }, [cursor]);

  const load = async () => {
    setLoading(true);
    try {
      const [m, l] = await Promise.all([
        endpoints.myMeetings({ from: range.from.toISOString(), to: range.to.toISOString() }),
        endpoints.listLeave({ from: ymd(range.from), to: ymd(range.to) }),
      ]);
      setMeetings(m as CalMeeting[]);
      setLeave(l as LeaveRow[]);
    } catch (err: unknown) {
      flash(err instanceof ApiClientError ? err.message : "Could not load calendar.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [range.from.toISOString(), range.to.toISOString()]);

  // Load the committees this user may view for the availability dropdown, once.
  useEffect(() => {
    (async () => {
      try {
        const list = await endpoints.committees();
        setCommitteeOptions(list);
        setAvailCommitteeId((prev) => prev ?? list[0]?.id ?? null);
      } catch {
        // Non-critical panel — fail quietly and just show nothing to pick from.
      }
    })();
  }, []);

  // Load the member list for whichever committee is selected in the dropdown.
  useEffect(() => {
    if (availCommitteeId == null) {
      setAvailMembers([]);
      return;
    }
    let cancelled = false;
    setAvailLoading(true);
    (async () => {
      try {
        const detail = await endpoints.committee(availCommitteeId);
        if (!cancelled) {
          setAvailMembers(detail.members.map((m) => ({ userId: m.userId, fullName: m.fullName })));
        }
      } catch {
        if (!cancelled) setAvailMembers([]);
      } finally {
        if (!cancelled) setAvailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [availCommitteeId]);

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

  const leaveOnDay = (key: string) =>
    leave.filter((r) => r.startsOn <= key && r.endsOn >= key);

  const cells = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const weekBuckets = useMemo(() => buildWeekBuckets(cursor), [cursor]);
  const today = new Date();
  const selectedMeetings = selectedKey ? byDay.get(selectedKey) ?? [] : [];
  const selectedLeave = selectedKey ? leaveOnDay(selectedKey) : [];

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" }).toUpperCase();

  const monthMeetings = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    return meetings
      .filter((mt) => {
        const d = new Date(mt.startsAt);
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  }, [meetings, cursor]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    const limit = now + 28 * 24 * 60 * 60 * 1000;
    return meetings
      .filter((m) => {
        const t = +new Date(m.startsAt);
        return t >= now && t <= limit;
      })
      .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
      .slice(0, 12);
  }, [meetings]);

  const monthLeave = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const start = ymd(new Date(y, m, 1));
    const end = ymd(new Date(y, m + 1, 0));
    return leave.filter((r) => r.startsOn <= end && r.endsOn >= start);
  }, [leave, cursor]);

  const committeeLegend = useMemo(() => {
    const map = new Map<string, { code: string; name: string; count: number }>();
    for (const m of monthMeetings) {
      const k = m.committee.code;
      const cur = map.get(k);
      if (cur) cur.count += 1;
      else map.set(k, { code: k, name: m.committee.name, count: 1 });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [monthMeetings]);

  const submitLeave = async () => {
    if (!leaveUser || !leaveFrom || !leaveTo) {
      flash("Select a user and leave dates.", "error");
      return;
    }
    setLeaveBusy(true);
    try {
      await endpoints.createLeave({
        userId: leaveUser.id,
        startsOn: leaveFrom,
        endsOn: leaveTo,
        note: leaveNote.trim() || undefined,
      });
      flash("Leave recorded");
      setShowLeaveForm(false);
      setLeaveUser(null);
      setLeaveFrom("");
      setLeaveTo("");
      setLeaveNote("");
      await load();
    } catch (err: unknown) {
      flash(err instanceof ApiClientError ? err.message : "Could not save leave.", "error");
    } finally {
      setLeaveBusy(false);
    }
  };

  const removeLeave = async (id: number) => {
    if (!confirm("Remove this leave record?")) return;
    try {
      await endpoints.deleteLeave(id);
      flash("Leave removed");
      await load();
    } catch (err: unknown) {
      flash(err instanceof ApiClientError ? err.message : "Could not delete leave.", "error");
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      {/* Header bar */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-100 to-slate-50 text-slate-900 shadow-sm dark:border-slate-700 dark:from-slate-800 dark:to-slate-900 dark:text-white">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-white/50">
              Meetings · Leave · Key activities
            </p>
            <h1 className="mt-0.5 flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
              <CalendarDays className="h-6 w-6 text-brand-600 dark:text-brand-300" />
              Organisational calendar
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700" onClick={() => setCursor((c) => addMonths(c, -1))} aria-label="Previous month">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-[9rem] rounded-lg border border-slate-200 bg-white px-4 py-2 text-center text-sm font-bold text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white">
              {monthLabel}
            </div>
            <button type="button" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700" onClick={() => setCursor((c) => addMonths(c, 1))} aria-label="Next month">
              <ChevronRight className="h-5 w-5" />
            </button>
            <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700" onClick={() => setCursor(startOfMonth(new Date()))}>
              Today
            </button>
            {isPlatformAdmin && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-500"
                onClick={() => setShowLeaveForm(true)}
              >
                <Plus className="h-3.5 w-3.5" /> Add leave
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <LoadingLogo message="Loading calendar…" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          {/* Main month grid */}
          <div className="xl:col-span-8">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100 text-center text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="px-1 py-2.5">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 auto-rows-fr">
                {cells.map((day, i) => {
                  if (!day) {
                    return (
                      <div
                        key={`e-${i}`}
                        className="min-h-[7.5rem] border-b border-r border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40"
                      />
                    );
                  }
                  const key = dateKey(day);
                  const dayMeetings = byDay.get(key) ?? [];
                  const dayLeave = leaveOnDay(key);
                  const isToday = dateKey(today) === key;
                  const isSelected = selectedKey === key;
                  const inMonth = day.getMonth() === cursor.getMonth();

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedKey(key)}
                      className={`min-h-[7.5rem] border-b border-r border-slate-100 p-1.5 text-left transition dark:border-slate-800 ${
                        isSelected
                          ? "bg-brand-50/80 ring-2 ring-inset ring-brand-400 dark:bg-brand-950/30"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      } ${!inMonth ? "opacity-40" : ""}`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                            isToday
                              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                              : "text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {day.getDate()}
                        </span>
                        {dayLeave.length > 0 && (
                          <span title={`${dayLeave.length} on leave`} className="text-sky-600">
                            <Plane className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        {dayMeetings.slice(0, 3).map((m) => {
                          const c = colorForCommittee(m.committee.code);
                          return (
                            <div
                              key={m.id}
                              className={`truncate rounded border px-1 py-0.5 text-[10px] font-medium leading-tight ${c.bg}`}
                              title={`${m.title} · ${formatTime(m.startsAt)}`}
                            >
                              {formatTime(m.startsAt)} {m.title}
                            </div>
                          );
                        })}
                        {dayMeetings.length > 3 && (
                          <p className="text-[10px] font-medium text-slate-400">+{dayMeetings.length - 3} more</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected day detail */}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                {selectedKey
                  ? new Date(selectedKey + "T12:00:00").toLocaleDateString(undefined, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                  : "Select a day"}
              </h2>
              {selectedMeetings.length === 0 && selectedLeave.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No meetings or leave on this day.</p>
              ) : (
                <div className="mt-3 max-h-56 space-y-3 overflow-y-auto pr-1">
                  {selectedMeetings.map((m) => {
                    const c = colorForCommittee(m.committee.code);
                    return (
                      <Link
                        key={m.id}
                        to={`/meetings/${m.id}`}
                        className="flex gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-brand-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                      >
                        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${c.dot}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{m.title}</p>
                          <p className="text-xs text-slate-500">
                            {m.committee.name} · {formatTime(m.startsAt)}
                            {m.endsAt ? ` – ${formatTime(m.endsAt)}` : ""}
                            {m.venue ? ` · ${m.venue}` : ""}
                          </p>
                          {m.teamsJoinUrl && (
                            <p className="mt-1 inline-flex items-center gap-1 text-xs text-brand-700 dark:text-brand-300">
                              <Video className="h-3 w-3" /> Teams available
                            </p>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                  {selectedLeave.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50/50 p-3 dark:border-sky-900 dark:bg-sky-950/30"
                    >
                      <Plane className="mt-0.5 h-4 w-4 text-sky-600" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{r.user.fullName}</p>
                        <p className="text-xs text-slate-500">
                          {leaveStatus(r.startsOn, r.endsOn) === "active"
                            ? "On leave now"
                            : leaveStatus(r.startsOn, r.endsOn) === "upcoming"
                              ? "Leave scheduled"
                              : "Leave ended"}{" "}
                          · {r.startsOn} → {r.endsOn}
                          {r.note ? ` · ${r.note}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Upcoming events + Leave overview, side by side under the calendar */}
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Upcoming */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="border-b border-slate-200 bg-slate-100 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Upcoming events (next 4 weeks)
                </div>
                <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                  {upcoming.length === 0 ? (
                    <li className="px-4 py-3 text-sm text-slate-500">No upcoming meetings.</li>
                  ) : (
                    upcoming.map((m) => {
                      const col = colorForCommittee(m.committee.code);
                      const d = new Date(m.startsAt);
                      return (
                        <li key={m.id}>
                          <Link
                            to={`/meetings/${m.id}`}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50"
                          >
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${col.dot}`} />
                            <span className="w-14 shrink-0 text-xs font-semibold text-slate-500">
                              {d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-100">
                              {m.title}
                            </span>
                            <span className="shrink-0 text-xs text-slate-400">{formatTime(m.startsAt)}</span>
                          </Link>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>

              {/* Leave overview */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                    Leave overview ({monthLabel})
                  </span>
                  {isPlatformAdmin && (
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-brand-700 hover:text-brand-900 dark:text-brand-300 dark:hover:text-white"
                      onClick={() => setShowLeaveForm(true)}
                    >
                      + Add
                    </button>
                  )}
                </div>
                {monthLeave.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-500">No leave recorded this month.</p>
                ) : (
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
                        <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                          <th className="px-3 py-2 font-semibold">Name</th>
                          <th className="px-3 py-2 font-semibold">From</th>
                          <th className="px-3 py-2 font-semibold">To</th>
                          <th className="px-3 py-2 font-semibold">Notes</th>
                          {isPlatformAdmin && <th className="px-3 py-2" />}
                        </tr>
                      </thead>
                      <tbody>
                        {monthLeave.map((r) => (
                          <tr key={r.id} className="border-b border-slate-50 dark:border-slate-800/80">
                            <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">
                              {r.user.fullName}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-500">{r.startsOn}</td>
                            <td className="px-3 py-2 text-xs text-slate-500">{r.endsOn}</td>
                            <td className="max-w-[8rem] truncate px-3 py-2 text-xs text-slate-500">
                              {r.note || "—"}
                            </td>
                            {isPlatformAdmin && (
                              <td className="px-2 py-2">
                                <button
                                  type="button"
                                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                  title="Remove leave"
                                  onClick={() => void removeLeave(r.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-800">
                  Leave has a start and end date. After the end date, the person is no longer shown as on leave.
                  {isPlatformAdmin ? "" : " Leave is maintained by platform administrators only."}
                </p>
              </div>
            </div>
          </div>

          {/* Right panels */}
          <div className="space-y-4 xl:col-span-4">
            {/* Team availability */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="border-b border-slate-200 bg-slate-100 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                Team availability
              </div>
              {committeeOptions.length > 0 && (
                <div className="border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
                  {committeeOptions.length > 1 ? (
                    <select
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      value={availCommitteeId ?? ""}
                      onChange={(e) => setAvailCommitteeId(Number(e.target.value))}
                    >
                      {committeeOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs font-semibold text-slate-500">{committeeOptions[0].name}</p>
                  )}
                </div>
              )}
              {availLoading ? (
                <p className="px-4 py-3 text-sm text-slate-500">Loading…</p>
              ) : committeeOptions.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-500">You're not on any committees yet.</p>
              ) : availMembers.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-500">No members to show.</p>
              ) : (
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
                      <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wide text-slate-500 dark:border-slate-800">
                        <th className="px-3 py-2 font-semibold">Name</th>
                        {weekBuckets.map((w) => (
                          <th key={w.label} className="px-2 py-2 text-center font-semibold">
                            {w.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {availMembers.map((m) => (
                        <tr key={m.userId} className="border-b border-slate-50 dark:border-slate-800/80">
                          <td className="max-w-[8rem] truncate px-3 py-2 font-medium text-slate-800 dark:text-slate-100">
                            {m.fullName}
                          </td>
                          {weekBuckets.map((w) => {
                            const wStart = ymd(w.start);
                            const wEnd = ymd(w.end);
                            const onLeave = leave.some(
                              (r) => r.userId === m.userId && r.startsOn <= wEnd && r.endsOn >= wStart,
                            );
                            return (
                              <td key={w.label} className="px-2 py-2 text-center">
                                {onLeave ? (
                                  <Plane className="mx-auto h-3.5 w-3.5 text-sky-500" aria-label="On leave" />
                                ) : (
                                  <span
                                    className="mx-auto block h-2.5 w-2.5 rounded-full bg-emerald-400"
                                    aria-label="Available"
                                  />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex items-center gap-4 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-800">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Available
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Plane className="h-3 w-3 text-sky-500" /> On leave
                </span>
              </div>
            </div>

            {/* Key meetings legend */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="border-b border-slate-200 bg-slate-100 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                Key meetings & activities ({monthLabel})
              </div>
              <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto p-0 dark:divide-slate-800">
                {committeeLegend.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-slate-500">No meetings this month.</li>
                ) : (
                  committeeLegend.map((c) => {
                    const col = colorForCommittee(c.code);
                    return (
                      <li key={c.code} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                        <span className={`h-3 w-3 shrink-0 rounded-sm ${col.dot}`} />
                        <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-100">
                          {c.name}
                        </span>
                        <span className="text-xs text-slate-400">{c.count}</span>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Add leave modal — platform admin only */}
      {showLeaveForm && isPlatformAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Record staff leave</h3>
              <button type="button" className="rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setShowLeaveForm(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Only platform administrators can add leave. Committee admins cannot manage leave.
            </p>
            <div className="space-y-3">
              <UserTypeahead
                value={leaveUser as any}
                onChange={(u) => setLeaveUser(u)}
                label="Staff member"
                placeholder="Search by name or email…"
              />
              <div className="grid grid-cols-2 gap-2">
                <label className="field-label">
                  From
                  <input type="date" className="field-input" value={leaveFrom} onChange={(e) => setLeaveFrom(e.target.value)} />
                </label>
                <label className="field-label">
                  To
                  <input type="date" className="field-input" value={leaveTo} onChange={(e) => setLeaveTo(e.target.value)} />
                </label>
              </div>
              <label className="field-label">
                Notes (optional)
                <input
                  className="field-input"
                  value={leaveNote}
                  onChange={(e) => setLeaveNote(e.target.value)}
                  placeholder="e.g. Annual leave"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn" onClick={() => setShowLeaveForm(false)}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" disabled={leaveBusy} onClick={() => void submitLeave()}>
                  {leaveBusy ? "Saving…" : "Save leave"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, Filter } from "lucide-react";
import { endpoints } from "@/api/endpoints";
import { ActionDetailPanel } from "@/components/ActionDetailPanel";
import { LoadingLogo } from "@/components/LoadingLogo";
import { useFlash } from "@/state/toastContext";
import type { NotificationItem } from "@/types";

const TYPE_LABELS: Record<string, string> = {
  CREATED: "New action point assigned",
  DAILY_REMINDER: "Reminder — deadline approaching",
  OVERDUE_ESCALATION: "Escalation — action overdue",
  STATUS_CHANGE: "Status updated",
  EVIDENCE_SUBMITTED: "Evidence submitted for verification",
  EVIDENCE_VERIFIED: "Evidence verified — action completed",
  MINUTES_ISSUED: "Meeting minutes issued",
  MEETING_ACTIONS_REMINDER: "Action points needed for yesterday's meeting",
  MEETING_MINUTES_REMINDER: "Minutes needed — create and send to members",
};

function deliveryBadge(status: string) {
  switch (status) {
    case "SENT":
      return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
    case "PENDING":
      return "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
    case "FAILED":
      return "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300";
    default:
      return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  }
}

export default function Notifications() {
  const flash = useFlash();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [openActionId, setOpenActionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "UNREAD" | "FAILED">("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  const load = async () => {
    setLoading(true);
    try {
      const data = await endpoints.notifications();
      setItems(data);
    } catch (err) {
      flash("Failed to load notifications", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return items.filter((n) => {
      if (filter === "UNREAD" && n.readAt) return false;
      if (filter === "FAILED" && n.deliveryStatus !== "FAILED") return false;
      if (typeFilter !== "ALL" && n.notificationType !== typeFilter) return false;
      return true;
    });
  }, [items, filter, typeFilter]);

  const typeOptions = useMemo(() => {
    const set = new Set(items.map((n) => n.notificationType));
    return Array.from(set).sort();
  }, [items]);

  const markAllRead = async () => {
    try {
      await endpoints.markAllNotificationsRead();
      flash("All notifications marked as read", "success");
      await load();
    } catch {
      flash("Failed to mark as read", "error");
    }
  };

  const openItem = async (n: NotificationItem) => {
    try {
      if (!n.readAt) {
        await endpoints.markNotificationRead(n.id);
        setItems((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
        );
      }
      if (n.action) {
        setOpenActionId(n.action.id);
      } else {
        flash("No linked action for this notification");
      }
    } catch {
      flash("Failed to process notification", "error");
    }
  };

  if (loading) {
    return <LoadingLogo scope="page" message="Loading notifications..." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink dark:text-white">Notifications</h1>
          <p className="text-sm text-slate-500">
            Reminders, escalations and status changes. Delivery status reflects the outbox (email/in-app).
          </p>
        </div>
        {items.length > 0 && (
          <button className="btn" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Filter className="h-3.5 w-3.5" /> Filter
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["ALL", "UNREAD", "FAILED"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filter === f ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600"
              }`}
            >
              {f === "ALL" ? "All" : f === "UNREAD" ? "Unread" : "Failed delivery"}
            </button>
          ))}
        </div>
        <select
          className="field-input w-full py-1.5 text-xs sm:w-auto"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="ALL">All types</option>
          {typeOptions.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t] ?? t}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center">
          <Bell className="mx-auto mb-2 h-12 w-12 text-slate-300" />
          <p className="text-slate-400">No notifications match this filter.</p>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden p-0 dark:divide-slate-800">
          {filtered.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => openItem(n)}
              className={`flex w-full items-start gap-3 px-5 py-3.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-700/60 dark:hover:bg-slate-800/50 ${
                !n.readAt ? "bg-brand-50/40 dark:bg-brand-950/20" : ""
              }`}
            >
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
                <Bell className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className={`text-sm ${!n.readAt ? "text-slate-900 dark:text-slate-100" : "text-slate-600 dark:text-slate-300"}`}>
                    {TYPE_LABELS[n.notificationType] ?? n.notificationType}
                  </b>
                  <span className="shrink-0 text-xs text-slate-400">
                    {new Date(n.scheduledFor).toLocaleString()}
                  </span>
                </div>
                {n.action && (
                  <p className="truncate text-sm text-slate-500">
                    {n.action.referenceNo} · {n.action.title} · {n.action.committee}
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${deliveryBadge(n.deliveryStatus)}`}>
                    {n.deliveryStatus}
                  </span>
                  {n.channel && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {n.channel}
                    </span>
                  )}
                  {n.deliveryStatus === "FAILED" && n.errorMessage && (
                    <span className="text-red-600 dark:text-red-400" title={n.errorMessage}>
                      {n.errorMessage}
                    </span>
                  )}
                </div>
              </div>
              {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
            </button>
          ))}
        </div>
      )}

      {openActionId && (
        <ActionDetailPanel actionId={openActionId} onClose={() => setOpenActionId(null)} onChanged={load} />
      )}
    </div>
  );
}

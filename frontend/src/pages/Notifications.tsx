import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
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
};

export default function Notifications() {
  const flash = useFlash();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [openActionId, setOpenActionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await endpoints.notifications();
      setItems(data);
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markAllRead = async () => {
    try {
      await endpoints.markAllNotificationsRead();
      flash("All notifications marked as read", "success");
      await load();
    } catch (err) {
      flash("Failed to mark as read", "error");
    }
  };

  const openItem = async (n: NotificationItem) => {
    try {
      if (!n.readAt) {
        await endpoints.markNotificationRead(n.id);
      }
      if (n.action) {
        setOpenActionId(n.action.id);
      }
    } catch (err) {
      flash("Failed to process notification", "error");
    }
  };

  if (loading) {
    return <LoadingLogo scope="page" message="Loading notifications..." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Notifications</h1>
          <p className="text-sm text-slate-500">Reminders, escalations and status changes relevant to you.</p>
        </div>
        {items.length > 0 && (
          <button className="btn" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card text-center">
          <Bell className="mx-auto h-12 w-12 text-slate-300 mb-2" />
          <p className="text-slate-400">No notifications yet.</p>
          <p className="text-xs text-slate-400 mt-1">You'll see notifications when actions are created or updated.</p>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden p-0">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => openItem(n)}
              className={`flex w-full items-start gap-3 px-5 py-3.5 text-left transition hover:bg-slate-50 ${
                !n.readAt ? "bg-brand-50/40" : ""
              }`}
            >
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-600">
                <Bell className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <b className={`text-sm ${!n.readAt ? "text-slate-900" : "text-slate-600"}`}>
                    {TYPE_LABELS[n.notificationType] ?? n.notificationType}
                  </b>
                  <span className="shrink-0 text-xs text-slate-400">{new Date(n.scheduledFor).toLocaleString()}</span>
                </div>
                {n.action && (
                  <p className="text-sm text-slate-500 truncate">
                    {n.action.referenceNo} · {n.action.title} · {n.action.committee}
                  </p>
                )}
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

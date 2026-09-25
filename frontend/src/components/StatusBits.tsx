import { AlertTriangle, CheckCircle2, CircleDot, Clock3, FileCheck2 } from "lucide-react";
import type { ActionStatus } from "@/types";

const STATUS_STYLES: Record<ActionStatus, { label: string; className: string; icon: JSX.Element }> = {
  OPEN: {
    label: "Open",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100",
    icon: <CircleDot className="h-3.5 w-3.5" />,
  },
  IN_PROGRESS: {
    label: "In Progress",
    className: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
    icon: <CircleDot className="h-3.5 w-3.5" />,
  },
  OVERDUE: {
    label: "Overdue",
    className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  PENDING_VERIFICATION: {
    label: "Pending Verification",
    className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
    icon: <FileCheck2 className="h-3.5 w-3.5" />,
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300",
    icon: <CircleDot className="h-3.5 w-3.5" />,
  },
};

export function StatusPill({ status }: { status: ActionStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`status-pill ${s.className}`}>
      {s.icon}
      {s.label}
    </span>
  );
}

export function DueBadge({ deadline, status }: { deadline: string; status: ActionStatus }) {
  if (status === "COMPLETED" || status === "CANCELLED") return null;
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  if (days < 0) {
    return <span className="text-xs font-medium text-red-600 dark:text-red-400">{Math.abs(days)} days overdue</span>;
  }
  return (
    <span className="text-xs text-slate-500">
      {days === 0 ? "Due today" : `${days} day${days === 1 ? "" : "s"} remaining`}
    </span>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
      <div className="h-full rounded-full bg-brand-500" style={{ width: `${value}%` }} />
    </div>
  );
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export const Clock3Icon = Clock3;

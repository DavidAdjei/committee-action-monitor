import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, FileText, Download, BarChart3 } from "lucide-react";
import { endpoints } from "@/api/endpoints";
import { useAuth } from "@/state/authContext";
import { useFlash } from "@/state/toastContext";
import { ApiClientError } from "@/api/client";
import { Navigate } from "react-router-dom";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type Preview = {
  year: number;
  month: number;
  monthLabel: string;
  total: number;
  completed: number;
  open: number;
  inProgress: number;
  overdue: number;
  completionRate: number;
  avgProgress: number;
  byCommittee: {
    committeeId: number;
    name: string;
    code: string;
    total: number;
    completed: number;
    completionRate: number;
  }[];
};

export default function ReportsPage() {
  const { me } = useAuth();
  const flash = useFlash();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [format, setFormat] = useState<"xlsx" | "csv" | "pdf">("xlsx");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const canReport = Boolean(me?.isAdmin || me?.isCentralCommittee);

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y, y - 1, y - 2, y - 3];
  }, [now.getFullYear()]);

  useEffect(() => {
    if (!canReport) return;
    let cancelled = false;
    setPreviewLoading(true);
    endpoints
      .monthlyActionsPreview(year, month)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year, month, canReport]);

  if (me && !canReport) {
    return <Navigate to="/committees" replace />;
  }

  const download = async () => {
    setBusy(true);
    try {
      await endpoints.monthlyActionsReport(year, month, format);
      flash(`Report downloaded (${format.toUpperCase()})`);
    } catch (err: unknown) {
      flash(err instanceof ApiClientError ? err.message : "Could not generate report.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
          <BarChart3 className="h-7 w-7 text-brand-600" />
          Reports
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Central Committee and platform administrators can export monthly action-point reports with
          completion rates.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Monthly action points report
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Includes all action points <strong>created</strong> in the selected month, bank-wide totals,
          completion rate, average progress, and a per-committee breakdown.{" "}
          <strong>Completed</strong> means status Completed only.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="field-label">
            Month
            <select
              className="field-input"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {MONTHS.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Year
            <select
              className="field-input"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Preview counts before download */}
        <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Preview · {MONTHS[month - 1]} {year}
          </p>
          {previewLoading ? (
            <p className="mt-2 text-sm text-slate-500">Loading counts…</p>
          ) : preview ? (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{preview.total}</p>
                <p className="text-xs text-slate-500">Created</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                  {preview.completed}
                </p>
                <p className="text-xs text-slate-500">Completed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">{preview.overdue}</p>
                <p className="text-xs text-slate-500">Overdue</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-brand-700 dark:text-brand-300">
                  {preview.completionRate}%
                </p>
                <p className="text-xs text-slate-500">Completion rate</p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Could not load preview for this period.</p>
          )}
          {preview && preview.total === 0 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              No actions were created in this month — the download will be empty of line items.
            </p>
          )}
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Format</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "xlsx" as const, label: "Excel", desc: "Spreadsheet" },
                { id: "csv" as const, label: "CSV", desc: "Universal" },
                { id: "pdf" as const, label: "PDF", desc: "Printable" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFormat(opt.id)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${
                  format === opt.id
                    ? "border-brand-500 bg-brand-50 text-brand-900 dark:bg-brand-950/40 dark:text-brand-100"
                    : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                }`}
              >
                {opt.id === "pdf" ? (
                  <FileText className="h-4 w-4" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
                <span>
                  <span className="font-semibold">{opt.label}</span>
                  <span className="ml-1 text-xs text-slate-500">{opt.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Exporting {MONTHS[month - 1]} {year} as {format.toUpperCase()}
          </p>
          <button type="button" className="btn-primary gap-2" disabled={busy} onClick={() => void download()}>
            <Download className="h-4 w-4" />
            {busy ? "Preparing…" : "Download report"}
          </button>
        </div>
      </div>
    </div>
  );
}

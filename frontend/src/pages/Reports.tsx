import { useMemo, useState } from "react";
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

export default function ReportsPage() {
  const { me } = useAuth();
  const flash = useFlash();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [format, setFormat] = useState<"xlsx" | "csv" | "pdf">("xlsx");
  const [busy, setBusy] = useState(false);

  const canReport = Boolean(me?.isAdmin || me?.isCentralCommittee);

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y, y - 1, y - 2, y - 3];
  }, [now.getFullYear()]);

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
          completion rate, average progress, and a per-committee breakdown.
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

        <fieldset className="mt-5">
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Format
          </legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(
              [
                {
                  id: "xlsx" as const,
                  title: "Excel",
                  desc: "Opens in Microsoft Excel",
                  icon: FileSpreadsheet,
                },
                {
                  id: "csv" as const,
                  title: "CSV",
                  desc: "Universal spreadsheet format",
                  icon: FileText,
                },
                {
                  id: "pdf" as const,
                  title: "PDF",
                  desc: "Printable summary document",
                  icon: FileText,
                },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const selected = format === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFormat(opt.id)}
                  className={`flex items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                    selected
                      ? "border-brand-500 bg-brand-50 ring-1 ring-brand-400 dark:bg-brand-950/40"
                      : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
                  }`}
                >
                  <Icon
                    className={`mt-0.5 h-5 w-5 shrink-0 ${
                      selected ? "text-brand-700 dark:text-brand-300" : "text-slate-400"
                    }`}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                      {opt.title}
                    </span>
                    <span className="block text-xs text-slate-500">{opt.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Reporting period:{" "}
            <span className="font-semibold">
              {MONTHS[month - 1]} {year}
            </span>
          </p>
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-2"
            disabled={busy}
            onClick={() => void download()}
          >
            <Download className="h-4 w-4" />
            {busy ? "Generating…" : "Download report"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
        Completion rate counts actions with status <strong>COMPLETED</strong>. Overdue counts
        non-completed actions past their deadline (or revised deadline). Excel downloads as{" "}
        <code className="rounded bg-white px-1 dark:bg-slate-900">.xls</code> (SpreadsheetML) for
        compatibility without extra libraries.
      </div>
    </div>
  );
}

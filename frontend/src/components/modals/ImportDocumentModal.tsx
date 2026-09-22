import { FormEvent, useEffect, useMemo, useState } from "react";
import { FileUp, Upload } from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { endpoints } from "@/api/endpoints";
import { ApiClientError } from "@/api/client";
import { extractTextFromFile } from "@/lib/docxText";
import {
  matchOwnerId,
  parseImportDocument,
  type ParsedActionDraft,
} from "@/lib/importParse";
import { parseSpreadsheetActions } from "@/lib/xlsxImport";
import type { DirectoryUser, Meeting } from "@/types";

type Mode = "minutes_and_actions" | "actions_only";
type Step = "choose" | "preview";

export function ImportDocumentModal({
  committeeId,
  committeeName,
  onClose,
  onImported,
}: {
  committeeId: number;
  committeeName: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [mode, setMode] = useState<Mode>("minutes_and_actions");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingId, setMeetingId] = useState<number | "">("");
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [discussion, setDiscussion] = useState("");
  const [actions, setActions] = useState<ParsedActionDraft[]>([]);
  const [ownerIds, setOwnerIds] = useState<Record<string, number[]>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);

  useEffect(() => {
    Promise.all([
      endpoints.meetings(committeeId),
      endpoints.directory(""),
    ]).then(([m, d]) => {
      setMeetings(m);
      setDirectory(d);
      if (m[0]) setMeetingId(m[0].id);
    }).catch(() => {
      setError("Could not load meetings or directory.");
    });
  }, [committeeId]);

  const defaultOwnerId = useMemo(() => {
    return directory[0]?.id ?? "";
  }, [directory]);

  const onFile = async (file: File | null) => {
    if (!file) return;
    setParsing(true);
    setError(null);
    setFileName(file.name);
    try {
      const lower = file.name.toLowerCase();
      let actionsList: ParsedActionDraft[] = [];
      let discussionText = "";
      let warn: string[] = [];

      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        actionsList = await parseSpreadsheetActions(file);
        if (mode === "minutes_and_actions") {
          warn.push(
            "Excel import fills action points only. Add or paste minutes discussion in the preview if needed.",
          );
        }
        if (actionsList.length === 0) {
          warn.push("No action rows detected in the spreadsheet. Check that the sheet has Action/Owner/Due columns.");
        }
      } else {
        const textContent = await extractTextFromFile(file);
        const parsed = parseImportDocument(textContent, mode);
        discussionText = parsed.discussion;
        actionsList = parsed.actions;
        warn = parsed.warnings;
      }

      setDiscussion(discussionText);
      setActions(actionsList);
      setWarnings(warn);
      const owners: Record<string, number[]> = {};
      for (const a of actionsList) {
        // Support "Parry/Edward/Patrick" style owner hints → multiple matches
        const hints = a.ownerHint.split(/[/&,]+/).map((s) => s.trim()).filter(Boolean);
        const matched = new Set<number>();
        if (hints.length === 0 && defaultOwnerId) matched.add(Number(defaultOwnerId));
        for (const h of hints.length ? hints : [a.ownerHint]) {
          const id = matchOwnerId(h, directory);
          if (id != null) matched.add(id);
        }
        if (matched.size === 0 && defaultOwnerId) matched.add(Number(defaultOwnerId));
        owners[a.key] = [...matched];
      }
      setOwnerIds(owners);
      setStep("preview");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not read the file.");
    } finally {
      setParsing(false);
    }
  };

  const included = actions.filter((a) => a.include);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!meetingId) {
      setError("Select the meeting these items belong to.");
      return;
    }
    if (included.length === 0) {
      setError("Select at least one action point to upload.");
      return;
    }
    if (mode === "minutes_and_actions" && !discussion.trim()) {
      setError("Discussion / minutes body is required.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payloadActions = included.map((a) => {
        const ids = ownerIds[a.key] ?? [];
        if (ids.length === 0) {
          throw new Error(`Choose at least one owner for: ${a.title.slice(0, 60)}…`);
        }
        return {
          title: a.title,
          description: a.statusHint ? `Imported status note: ${a.statusHint}` : undefined,
          ownerIds: ids,
          deadline: a.deadline,
          priority: "MEDIUM" as const,
        };
      });

      const result = await endpoints.importMinutes(Number(meetingId), {
        discussion: mode === "minutes_and_actions" ? discussion.trim() : undefined,
        documentUrl: fileName ? `uploaded:${fileName}` : undefined,
        actionsOnly: mode === "actions_only",
        sourcePopulation: "LATEST_MEETING",
        actions: payloadActions,
      });

      onImported();
      // Surface summary via parent flash — parent already flashes success
      void result;
    } catch (err: unknown) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Upload failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Import from document"
      subtitle={committeeName}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="space-y-4">
        {step === "choose" && (
          <>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Upload a Word minutes pack or action tracker. You will preview and edit the extracted content before anything is saved.
            </p>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">What are you importing?</legend>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-600">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "minutes_and_actions"}
                  onChange={() => setMode("minutes_and_actions")}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold">Minutes and action points</span>
                  <span className="text-xs text-slate-500">Discussion body + decision/action tracker rows</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-600">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "actions_only"}
                  onChange={() => setMode("actions_only")}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold">Action points only</span>
                  <span className="text-xs text-slate-500">From an action tracker (e.g. summary of decisions)</span>
                </span>
              </label>
            </fieldset>

            <label className="field-label">
              Meeting
              <select
                className="field-input"
                required
                value={meetingId}
                onChange={(e) => setMeetingId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Select meeting…</option>
                {meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.reference} — {m.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center dark:border-slate-600 dark:bg-slate-900/40">
              <FileUp className="h-8 w-8 text-brand-600 dark:text-brand-400" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {parsing ? "Reading document…" : "Choose .docx, .xlsx, .csv or .txt"}
              </span>
              <span className="text-xs text-slate-500">Preview opens before upload · Excel best for action trackers</span>
              <input
                type="file"
                accept=".docx,.xlsx,.xls,.csv,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/plain,text/csv"
                className="sr-only"
                disabled={parsing || !meetingId}
                onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </>
        )}

        {step === "preview" && (
          <>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900/40">
              <span className="font-medium">File:</span> {fileName}{" "}
              <button
                type="button"
                className="ml-2 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                onClick={() => {
                  setStep("choose");
                  setActions([]);
                  setDiscussion("");
                  setFileName(null);
                }}
              >
                Choose another
              </button>
            </div>

            {warnings.map((w) => (
              <p key={w} className="text-sm text-amber-700 dark:text-amber-300">
                {w}
              </p>
            ))}

            {mode === "minutes_and_actions" && (
              <label className="field-label">
                Minutes / discussion (editable)
                <textarea
                  className="field-input min-h-[120px] font-normal"
                  value={discussion}
                  onChange={(e) => setDiscussion(e.target.value)}
                  required
                />
              </label>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Action points preview ({included.length} selected)
                </p>
              </div>
              {actions.length === 0 ? (
                <p className="text-sm text-slate-500">No rows detected in the file.</p>
              ) : (
                <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                  {actions.map((a) => (
                    <div
                      key={a.key}
                      className={`rounded-lg border p-3 ${
                        a.include
                          ? "border-slate-200 dark:border-slate-600"
                          : "border-slate-100 opacity-60 dark:border-slate-700"
                      }`}
                    >
                      <label className="mb-2 flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={a.include}
                          onChange={(e) =>
                            setActions((prev) =>
                              prev.map((x) =>
                                x.key === a.key ? { ...x, include: e.target.checked } : x,
                              ),
                            )
                          }
                        />
                        <textarea
                          className="field-input min-h-[60px] flex-1 font-normal"
                          value={a.title}
                          disabled={!a.include}
                          onChange={(e) =>
                            setActions((prev) =>
                              prev.map((x) =>
                                x.key === a.key ? { ...x, title: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <label className="field-label text-xs">
                          Owners {a.ownerHint ? <span className="font-normal text-slate-400">({a.ownerHint})</span> : null}
                          <select
                            className="field-input min-h-[88px]"
                            multiple
                            disabled={!a.include}
                            value={(ownerIds[a.key] ?? []).map(String)}
                            onChange={(e) => {
                              const selected = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
                              setOwnerIds((prev) => ({ ...prev, [a.key]: selected }));
                            }}
                          >
                            {directory.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.fullName}
                              </option>
                            ))}
                          </select>
                          <span className="font-normal text-[11px] text-slate-400">Hold Ctrl/Cmd to select multiple</span>
                        </label>
                        <label className="field-label text-xs">
                          Deadline
                          <input
                            type="date"
                            className="field-input"
                            disabled={!a.include}
                            value={a.deadline}
                            onChange={(e) =>
                              setActions((prev) =>
                                prev.map((x) =>
                                  x.key === a.key ? { ...x, deadline: e.target.value } : x,
                                ),
                              )
                            }
                          />
                        </label>
                        <label className="field-label text-xs">
                          Note from file
                          <input
                            className="field-input"
                            disabled
                            value={a.statusHint || "—"}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <ModalActions>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {step === "preview" && (
            <button type="submit" className="btn-primary" disabled={busy || parsing}>
              <Upload className="h-4 w-4" />
              {busy ? "Uploading…" : "Confirm upload"}
            </button>
          )}
        </ModalActions>
      </form>
    </Modal>
  );
}

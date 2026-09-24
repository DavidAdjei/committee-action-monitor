import { FormEvent, useEffect, useMemo, useState } from "react";
import { FileUp, Plus, Upload, UserMinus, UserPlus, X } from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { endpoints } from "@/api/endpoints";
import { ApiClientError } from "@/api/client";
import { extractTextFromFile, parseDocxImport } from "@/lib/docxText";
import {
  matchOwnersFromHint,
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
  /** Resolved system users per action key */
  const [ownerIds, setOwnerIds] = useState<Record<string, number[]>>({});
  /** Names from the file that could not be matched */
  const [unmatchedNames, setUnmatchedNames] = useState<Record<string, string[]>>({});
  /** Per-row "add user" search */
  const [addQuery, setAddQuery] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);

  useEffect(() => {
    Promise.all([endpoints.meetings(committeeId), endpoints.directory("")])
      .then(([m, d]) => {
        setMeetings(m);
        setDirectory(d);
        if (m[0]) setMeetingId(m[0].id);
      })
      .catch(() => setError("Could not load meetings or directory."));
  }, [committeeId]);

  const userById = useMemo(() => {
    const map = new Map<number, DirectoryUser>();
    for (const u of directory) map.set(u.id, u);
    return map;
  }, [directory]);

  const applyOwnerMatches = (actionsList: ParsedActionDraft[]) => {
    const owners: Record<string, number[]> = {};
    const unmatched: Record<string, string[]> = {};
    for (const a of actionsList) {
      const result = matchOwnersFromHint(a.ownerHint, directory);
      owners[a.key] = result.matched.map((m) => m.id);
      unmatched[a.key] = result.unmatched;
    }
    setOwnerIds(owners);
    setUnmatchedNames(unmatched);
  };

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
          warn.push(
            "No action rows detected in the spreadsheet. Check that the sheet has Action/Owner/Due columns.",
          );
        }
      } else if (lower.endsWith(".docx")) {
        const parsed = await parseDocxImport(file, mode);
        discussionText = parsed.discussion;
        actionsList = parsed.actions;
        warn = parsed.warnings;
      } else {
        const textContent = await extractTextFromFile(file);
        const parsed = parseImportDocument(textContent, mode);
        discussionText = parsed.discussion;
        actionsList = parsed.actions;
        warn = parsed.warnings;
      }

      setDiscussion(discussionText);
      setActions(actionsList);
      applyOwnerMatches(actionsList);
      setWarnings(warn);
      setStep("preview");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not read the file.");
    } finally {
      setParsing(false);
    }
  };

  // Re-match when directory loads after file parse
  useEffect(() => {
    if (step === "preview" && actions.length > 0 && directory.length > 0) {
      applyOwnerMatches(actions);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directory.length]);

  const included = actions.filter((a) => a.include);

  const removeOwner = (key: string, userId: number) => {
    setOwnerIds((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).filter((id) => id !== userId),
    }));
  };

  const addOwner = (key: string, userId: number) => {
    setOwnerIds((prev) => {
      const cur = prev[key] ?? [];
      if (cur.includes(userId)) return prev;
      return { ...prev, [key]: [...cur, userId] };
    });
    setAddQuery((prev) => ({ ...prev, [key]: "" }));
  };

  const dismissUnmatched = (key: string, name: string) => {
    setUnmatchedNames((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).filter((n) => n !== name),
    }));
  };

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
          throw new Error(`Choose at least one action owner for: ${a.title.slice(0, 60)}…`);
        }
        return {
          title: a.title,
          description: a.statusHint ? `Imported status note: ${a.statusHint}` : undefined,
          ownerIds: ids,
          deadline: a.deadline,
          priority: "MEDIUM" as const,
          status: a.status,
          progress: a.progress,
        };
      });

      await endpoints.importMinutes(Number(meetingId), {
        discussion: mode === "minutes_and_actions" ? discussion.trim() : undefined,
        documentUrl: fileName ? `uploaded:${fileName}` : undefined,
        actionsOnly: mode === "actions_only",
        sourcePopulation: "LATEST_MEETING",
        actions: payloadActions,
      });

      onImported();
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
    <Modal title="Import from document" subtitle={committeeName} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        {step === "choose" && (
          <>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Upload a Word minutes pack or action tracker. You will preview and edit owners before anything is saved.
              Names in the <strong>Owner</strong> column are matched to users in the system.
            </p>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">
                What are you importing?
              </legend>
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
              <span className="text-xs text-slate-500">
                Preview opens before upload · Owner column → action owners
              </span>
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
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900/40">
              <span>
                <span className="font-medium">File:</span> {fileName}
              </span>
              <button
                type="button"
                className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                onClick={() => {
                  setStep("choose");
                  setActions([]);
                  setDiscussion("");
                  setFileName(null);
                  setOwnerIds({});
                  setUnmatchedNames({});
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
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Action points preview
                  <span className="ml-1.5 font-normal text-slate-500">
                    ({included.length} selected)
                  </span>
                </p>
              </div>

              {actions.length === 0 ? (
                <p className="text-sm text-slate-500">No rows detected in the file.</p>
              ) : (
                <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                  {actions.map((a, idx) => {
                    const selectedIds = ownerIds[a.key] ?? [];
                    const unmatched = unmatchedNames[a.key] ?? [];
                    const q = (addQuery[a.key] ?? "").trim().toLowerCase();
                    const suggestions =
                      q.length >= 1
                        ? directory
                            .filter(
                              (u) =>
                                !selectedIds.includes(u.id) &&
                                (u.fullName.toLowerCase().includes(q) ||
                                  (u.email ?? "").toLowerCase().includes(q)),
                            )
                            .slice(0, 6)
                        : [];

                    return (
                      <div
                        key={a.key}
                        className={`rounded-xl border p-3.5 shadow-sm transition ${
                          a.include
                            ? "border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-900/50"
                            : "border-slate-100 bg-slate-50/80 opacity-60 dark:border-slate-700 dark:bg-slate-900/20"
                        }`}
                      >
                        <div className="mb-2 flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-1.5"
                            checked={a.include}
                            onChange={(e) =>
                              setActions((prev) =>
                                prev.map((x) =>
                                  x.key === a.key ? { ...x, include: e.target.checked } : x,
                                ),
                              )
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              Action {idx + 1}
                            </p>
                            <textarea
                              className="field-input mt-1 min-h-[56px] w-full font-normal"
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
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          {/* Owners */}
                          <div className="sm:col-span-2 space-y-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                                Action owners
                              </span>
                              {a.ownerHint ? (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                  From file: {a.ownerHint}
                                </span>
                              ) : null}
                            </div>

                            {/* Matched / selected users */}
                            <div className="flex min-h-[36px] flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 p-2 dark:border-slate-600 dark:bg-slate-800/40">
                              {selectedIds.length === 0 ? (
                                <span className="text-xs text-slate-400">No owners selected — add below</span>
                              ) : (
                                selectedIds.map((id) => {
                                  const u = userById.get(id);
                                  return (
                                    <span
                                      key={id}
                                      className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-medium text-brand-900 dark:bg-brand-950 dark:text-brand-200"
                                    >
                                      {u?.fullName ?? `User #${id}`}
                                      <button
                                        type="button"
                                        disabled={!a.include}
                                        className="rounded-full p-0.5 hover:bg-brand-200/80 dark:hover:bg-brand-900"
                                        title="Remove owner"
                                        onClick={() => removeOwner(a.key, id)}
                                      >
                                        <UserMinus className="h-3 w-3" />
                                      </button>
                                    </span>
                                  );
                                })
                              )}
                            </div>

                            {/* Unmatched names from file */}
                            {unmatched.length > 0 && (
                              <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-2.5 py-2 dark:border-amber-900 dark:bg-amber-950/30">
                                <p className="mb-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                                  Could not match — select a user manually
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {unmatched.map((name) => (
                                    <span
                                      key={name}
                                      className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-100"
                                    >
                                      {name}
                                      <button
                                        type="button"
                                        className="rounded-full p-0.5 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900"
                                        title="Dismiss"
                                        onClick={() => dismissUnmatched(a.key, name)}
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Add user search */}
                            {a.include && (
                              <div className="relative">
                                <div className="flex items-center gap-1.5">
                                  <UserPlus className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                  <input
                                    className="field-input py-1.5 text-xs"
                                    placeholder="Search directory to add an owner…"
                                    value={addQuery[a.key] ?? ""}
                                    onChange={(e) =>
                                      setAddQuery((prev) => ({ ...prev, [a.key]: e.target.value }))
                                    }
                                  />
                                </div>
                                {suggestions.length > 0 && (
                                  <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-900">
                                    {suggestions.map((u) => (
                                      <li key={u.id}>
                                        <button
                                          type="button"
                                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                          onClick={() => addOwner(a.key, u.id)}
                                        >
                                          <Plus className="h-3 w-3 text-brand-600" />
                                          <span className="font-medium">{u.fullName}</span>
                                          {u.email && (
                                            <span className="text-slate-400">{u.email}</span>
                                          )}
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
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
                              Status
                              <select
                                className="field-input"
                                disabled={!a.include}
                                value={a.status}
                                onChange={(e) => {
                                  const status = e.target.value as ParsedActionDraft["status"];
                                  setActions((prev) =>
                                    prev.map((x) => {
                                      if (x.key !== a.key) return x;
                                      const progress =
                                        status === "COMPLETED"
                                          ? 100
                                          : status === "OPEN"
                                            ? 0
                                            : x.progress || 25;
                                      return { ...x, status, progress };
                                    }),
                                  );
                                }}
                              >
                                <option value="OPEN">Pending / Open</option>
                                <option value="IN_PROGRESS">In Progress</option>
                                <option value="OVERDUE">Overdue</option>
                                <option value="PENDING_VERIFICATION">Pending verification</option>
                                <option value="COMPLETED">Completed</option>
                              </select>
                              {a.statusHint ? (
                                <span className="mt-1 block text-[10px] text-slate-400">
                                  From file: {a.statusHint}
                                  {a.status === "IN_PROGRESS" || a.status === "OVERDUE"
                                    ? ` · ${a.progress}%`
                                    : ""}
                                </span>
                              ) : null}
                            </label>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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

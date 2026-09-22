import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
  ScrollText,
  XCircle,
} from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { StatusPill, formatDate } from "@/components/StatusBits";
import { StatusUpdateModal } from "@/components/modals/StatusUpdateModal";
import { endpoints } from "@/api/endpoints";
import { ApiClientError } from "@/api/client";
import { useAuth } from "@/state/authContext";
import { useFlash } from "@/state/toastContext";
import {
  canUpdateAction,
  canVerifyAction,
  canViewAudit,
  canModifyAction,
  canCancelAction,
  isCommitteeOfficer,
} from "@/lib/permissions";
import type { ActionDetail, AuditEvent } from "@/types";

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatAuditValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function ActionDetailPanel({
  actionId,
  onClose,
  onChanged,
}: {
  actionId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { me } = useAuth();
  const flash = useFlash();
  const [detail, setDetail] = useState<ActionDetail | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [audit, setAudit] = useState<AuditEvent[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [showReopen, setShowReopen] = useState(false);
  const [reopenNote, setReopenNote] = useState("");
  const [reopening, setReopening] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editPriority, setEditPriority] = useState("MEDIUM");
  const [editBusy, setEditBusy] = useState(false);

  const load = () => endpoints.actionDetail(actionId).then(setDetail);
  useEffect(() => {
    load();
  }, [actionId]);

  if (!detail) return null;

  const committeeId = detail.committee.id;
  const isOfficerStakeholder = detail.stakeholders.some(
    (s) => s.userId === me?.id && (s.stakeholderType === "CHAIRPERSON" || s.stakeholderType === "SECRETARY"),
  );

  const canUpdate = canUpdateAction(me, {
    committeeId,
    ownerId: detail.owner.id,
    status: detail.status,
    isOfficerStakeholder,
  });
  const canVerify = canVerifyAction(me, {
    committeeId,
    status: detail.status,
    isOfficerStakeholder,
  });
  const isOfficer =
    isOfficerStakeholder || isCommitteeOfficer(me, committeeId);
  const canReopen =
    isOfficer && ["COMPLETED", "CANCELLED"].includes(detail.status);
  const canModify =
    canModifyAction(me, committeeId) && !["COMPLETED", "CANCELLED"].includes(detail.status);
  const canCancel = canCancelAction(me, committeeId, detail.status);
  const showAuditSection = canViewAudit(me, committeeId);

  const handleDownloadEvidence = async (evidenceId: number, filename: string) => {
    setDownloadingId(evidenceId);
    try {
      await endpoints.downloadEvidence(evidenceId, filename);
      flash(`Downloading ${filename}`);
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError ? err.message : "Failed to download evidence file.";
      flash(msg, "error");
    } finally {
      setDownloadingId(null);
    }
  };

  const verify = async (approve: boolean) => {
    setVerifying(true);
    try {
      await endpoints.verifyAction(
        actionId,
        approve,
        approve ? "Evidence reviewed and approved." : undefined,
        detail.version,
      );
      flash(approve ? "Action verified as completed" : "Action returned for further work");
      load();
      onChanged();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.isConflict) {
          flash(
            "This action was changed by someone else. The panel will refresh — review and verify again.",
            "error",
          );
          load();
        } else if (err.isForbidden) {
          flash(err.message || "You are not authorized to verify this action.", "error");
        } else {
          flash(err.message, "error");
        }
      } else {
        flash((err as Error)?.message ?? "Verification failed.", "error");
      }
    } finally {
      setVerifying(false);
    }
  };

  const openEdit = () => {
    setEditTitle(detail.title);
    setEditDeadline((detail.revisedDeadline ?? detail.deadline).slice(0, 10));
    setEditPriority(detail.priority);
    setShowEdit(true);
  };

  const handleEditSave = async () => {
    setEditBusy(true);
    try {
      await endpoints.modifyAction(actionId, {
        title: editTitle.trim(),
        deadline: editDeadline,
        priority: editPriority,
        version: detail.version,
      });
      flash("Action details updated");
      setShowEdit(false);
      load();
      onChanged();
    } catch (err: unknown) {
      flash(err instanceof ApiClientError ? err.message : "Could not update action.", "error");
    } finally {
      setEditBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Cancel this action point? Stakeholders will be notified and history retained.")) return;
    try {
      await endpoints.deleteAction(actionId, { version: detail.version });
      flash("Action cancelled");
      onChanged();
      onClose();
    } catch (err: unknown) {
      flash(err instanceof ApiClientError ? err.message : "Could not cancel action.", "error");
    }
  };

  const handleReopen = async () => {
    if (!reopenNote.trim()) {
      flash("A reason for reopening is required.", "error");
      return;
    }
    setReopening(true);
    try {
      await endpoints.reopenAction(actionId, reopenNote.trim(), detail.version);
      flash("Action reopened and stakeholders notified");
      setShowReopen(false);
      setReopenNote("");
      load();
      onChanged();
    } catch (err: unknown) {
      flash(err instanceof ApiClientError ? err.message : "Could not reopen action.", "error");
    } finally {
      setReopening(false);
    }
  };

  const loadAudit = async () => {
    if (audit != null || auditLoading) {
      setShowAudit((v) => !v);
      return;
    }
    setShowAudit(true);
    setAuditLoading(true);
    setAuditError(null);
    try {
      const events = await endpoints.actionAudit(actionId);
      setAudit(events);
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.isForbidden) {
        setAuditError("You are not authorized to view the audit trail for this action.");
      } else {
        setAuditError((err as Error)?.message ?? "Could not load audit events.");
      }
      setAudit([]);
    } finally {
      setAuditLoading(false);
    }
  };

  const submissionUpdate =
    detail.updates.find(
      (u) =>
        (u.status === "PENDING_VERIFICATION" || u.progress === 100) &&
        (u.evidenceFiles.length > 0 || u.evidenceLink || u.note),
    ) ?? detail.updates[0];
  const pendingFiles = submissionUpdate?.evidenceFiles ?? [];

  return (
    <>
      <Modal title={detail.referenceNo} subtitle={detail.title} onClose={onClose} wide>
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusPill status={detail.status} />
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span>{detail.progress}% complete</span>
              <span className="font-mono text-xs text-slate-400" title="Optimistic concurrency version">
                v{detail.version}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2 sm:gap-4 dark:bg-slate-800/50">
            <div>
              <small className="block text-slate-400">Committee</small>
              <b>{detail.committee.name}</b>
            </div>
            <div>
              <small className="block text-slate-400">Meeting</small>
              <b>{detail.meeting.reference}</b>
            </div>
            <div>
              <small className="block text-slate-400">Owner</small>
              <b>{detail.owner.fullName}</b>
            </div>
            <div>
              <small className="block text-slate-400">Deadline</small>
              <b>{formatDate(detail.revisedDeadline ?? detail.deadline)}</b>
              {detail.revisedDeadline && <span className="ml-1 text-xs text-amber-600">(revised)</span>}
            </div>
            <div>
              <small className="block text-slate-400">Priority</small>
              <b>{detail.priority}</b>
            </div>
            {detail.statusReason && (
              <div className="sm:col-span-2">
                <small className="block text-slate-400">Status reason</small>
                <p className="text-slate-700 dark:text-slate-300">{detail.statusReason}</p>
              </div>
            )}
            {detail.description && (
              <div className="sm:col-span-2">
                <small className="block text-slate-400">Description</small>
                <p>{detail.description}</p>
              </div>
            )}
          </div>

          {detail.status === "PENDING_VERIFICATION" && (
            <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900 dark:bg-amber-950/40">
              <div>
                <b className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                  Awaiting Verification & Approval
                </b>
                <p className="mt-1 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                  The action owner has submitted evidence claiming completion. Review and download the attached
                  evidence file(s) below before verifying.
                </p>
              </div>

              {submissionUpdate && (
                <div className="space-y-3 rounded-lg border border-amber-200 bg-white/90 p-3.5 dark:border-amber-900 dark:bg-slate-900/80">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Submitted by <b className="text-slate-700 dark:text-slate-200">{submissionUpdate.author.fullName}</b>
                    </span>
                    <span>{formatDate(submissionUpdate.createdAt)}</span>
                  </div>

                  {submissionUpdate.note && (
                    <p className="rounded border border-slate-100 dark:border-slate-700 bg-slate-50 p-2.5 text-sm italic text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      "{submissionUpdate.note}"
                    </p>
                  )}

                  {pendingFiles.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <small className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          <Paperclip className="h-3.5 w-3.5 text-amber-700" />
                          Attached Evidence ({pendingFiles.length} {pendingFiles.length === 1 ? "file" : "files"}):
                        </small>
                        {pendingFiles.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              pendingFiles.forEach((f) => handleDownloadEvidence(f.id, f.filename));
                            }}
                            className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                          >
                            <Download className="h-3 w-3" /> Download all
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {pendingFiles.map((f) => (
                          <div
                            key={f.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <div className="grid h-8 w-8 shrink-0 place-items-center rounded bg-amber-100 text-amber-800">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100" title={f.filename}>
                                  {f.filename}
                                </p>
                                <p className="text-[11px] text-slate-400">{formatBytes(f.sizeBytes)}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={downloadingId === f.id}
                              onClick={() => handleDownloadEvidence(f.id, f.filename)}
                              className="btn shrink-0 !px-2.5 !py-1 text-xs"
                              title={`Download ${f.filename}`}
                            >
                              {downloadingId === f.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" />
                              ) : (
                                <Download className="h-3.5 w-3.5 text-brand-600" />
                              )}
                              <span>Download</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {submissionUpdate.evidenceLink && (
                    <div className="pt-1">
                      <a
                        href={submissionUpdate.evidenceLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>View External Evidence Link</span>
                      </a>
                    </div>
                  )}

                  {pendingFiles.length === 0 && !submissionUpdate.evidenceLink && (
                    <p className="text-xs italic text-slate-400">No files attached to this submission.</p>
                  )}
                </div>
              )}

              {canVerify && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button className="btn-primary" disabled={verifying} onClick={() => verify(true)}>
                    <CheckCircle2 className="h-4 w-4" /> Approve & close
                  </button>
                  <button className="btn-danger" disabled={verifying} onClick={() => verify(false)}>
                    <XCircle className="h-4 w-4" /> Return for more work
                  </button>
                </div>
              )}
              {!canVerify && detail.status === "PENDING_VERIFICATION" && (
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Only the committee Chairperson or Secretary may verify this evidence.
                </p>
              )}
            </div>
          )}

          <div>
            <b className="mb-2 block text-sm text-slate-800 dark:text-slate-100">History</b>
            <div className="space-y-3">
              {detail.updates.map((u) => (
                <div key={u.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                    <span>
                      <b className="text-slate-700 dark:text-slate-200">{u.author.fullName}</b> · {formatDate(u.createdAt)}
                    </span>
                    <StatusPill status={u.status} />
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{u.note}</p>
                  {(u.evidenceFiles.length > 0 || u.evidenceLink) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {u.evidenceFiles.map((f) => (
                        <button
                          type="button"
                          key={f.id}
                          disabled={downloadingId === f.id}
                          onClick={() => handleDownloadEvidence(f.id, f.filename)}
                          className="group flex cursor-pointer items-center gap-1.5 rounded-full border border-transparent bg-slate-100 px-3 py-1 text-xs text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 dark:bg-slate-800 dark:text-slate-300"
                          title={`Click to download ${f.filename}`}
                        >
                          {downloadingId === f.id ? (
                            <Loader2 className="h-3 w-3 animate-spin text-brand-600" />
                          ) : (
                            <Download className="h-3 w-3 text-slate-400 transition group-hover:text-brand-600" />
                          )}
                          <span className="font-medium">{f.filename}</span>
                          <span className="text-[10px] text-slate-400">({formatBytes(f.sizeBytes)})</span>
                        </button>
                      ))}
                      {u.evidenceLink && (
                        <a
                          href={u.evidenceLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-brand-700 dark:text-brand-300 underline transition hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800"
                        >
                          <ExternalLink className="h-3 w-3" /> External evidence link
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {detail.updates.length === 0 && <p className="text-sm text-slate-400">No updates recorded yet.</p>}
            </div>
          </div>

          <div>
            <b className="mb-1.5 block text-sm text-slate-800 dark:text-slate-100">Stakeholders</b>
            <div className="flex flex-wrap gap-2">
              {detail.stakeholders.map((s) => (
                <span
                  key={s.userId}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                >
                  {s.fullName} · {s.stakeholderType.replace("_", " ").toLowerCase()}
                </span>
              ))}
            </div>
          </div>

          {showAuditSection && (
            <div className="border-t border-slate-100 dark:border-slate-700 pt-4 dark:border-slate-700">
              <button
                type="button"
                onClick={loadAudit}
                className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-brand-700 dark:text-slate-200"
              >
                <ScrollText className="h-4 w-4" />
                {showAudit ? "Hide audit trail" : "Show audit trail"}
              </button>
              {showAudit && (
                <div className="mt-3 space-y-2">
                  {auditLoading && (
                    <p className="flex items-center gap-2 text-xs text-slate-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading audit events…
                    </p>
                  )}
                  {auditError && <p className="text-xs text-red-600 dark:text-red-400">{auditError}</p>}
                  {!auditLoading && audit && audit.length === 0 && !auditError && (
                    <p className="text-xs text-slate-400">No audit events recorded for this action yet.</p>
                  )}
                  {!auditLoading &&
                    audit?.map((ev) => (
                      <div
                        key={ev.eventId}
                        className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-xs dark:border-slate-700 dark:bg-slate-800/50"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-800 dark:text-slate-100">{ev.action}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 font-medium ${
                              ev.result === "SUCCEEDED"
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                            }`}
                          >
                            {ev.result}
                          </span>
                        </div>
                        <p className="mt-1 text-slate-500">
                          {ev.actorFullName ?? `User #${ev.actorUserId}`} · {formatDate(ev.occurredAt)}
                          {ev.reason ? ` · ${ev.reason}` : ""}
                        </p>
                        {(ev.before || ev.after) && (
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {ev.before && (
                              <div>
                                <small className="font-semibold text-slate-400">Before</small>
                                <pre className="mt-0.5 overflow-x-auto rounded bg-white p-1.5 text-[10px] text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                                  {formatAuditValue(ev.before)}
                                </pre>
                              </div>
                            )}
                            {ev.after && (
                              <div>
                                <small className="font-semibold text-slate-400">After</small>
                                <pre className="mt-0.5 overflow-x-auto rounded bg-white p-1.5 text-[10px] text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                                  {formatAuditValue(ev.after)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        <ModalActions>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          {canModify && (
            <button className="btn" onClick={openEdit}>
              Edit details
            </button>
          )}
          {canCancel && (
            <button className="btn text-red-600" onClick={handleDelete}>
              Cancel action
            </button>
          )}
          {canReopen && (
            <button className="btn" onClick={() => setShowReopen(true)}>
              Reopen action
            </button>
          )}
          {canUpdate && (
            <button className="btn-primary" onClick={() => setShowUpdate(true)}>
              Update progress
            </button>
          )}
        </ModalActions>
      </Modal>

      {showUpdate && (
        <StatusUpdateModal
          item={{
            id: detail.id,
            referenceNo: detail.referenceNo,
            title: detail.title,
            owner: detail.owner,
            deadline: detail.revisedDeadline ?? detail.deadline,
            status: detail.status,
            progress: detail.progress,
          }}
          version={detail.version}
          isOfficer={isOfficer}
          onClose={() => setShowUpdate(false)}
          onSaved={() => {
            load();
            onChanged();
          }}
        />
      )}

      {showEdit && (
        <Modal title="Edit action details" subtitle={detail.referenceNo} onClose={() => setShowEdit(false)}>
          <div className="space-y-3">
            <label className="field-label">
              Title
              <input className="field-input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </label>
            <label className="field-label">
              Deadline
              <input type="date" className="field-input" value={editDeadline} onChange={(e) => setEditDeadline(e.target.value)} />
            </label>
            <label className="field-label">
              Priority
              <select className="field-input" value={editPriority} onChange={(e) => setEditPriority(e.target.value)}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </label>
            <p className="text-xs text-slate-400">
              Only Chairperson/Secretary may change these fields. Progress updates remain with the action owner.
            </p>
            <ModalActions>
              <button type="button" className="btn" onClick={() => setShowEdit(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={editBusy} onClick={handleEditSave}>
                {editBusy ? "Saving…" : "Save changes"}
              </button>
            </ModalActions>
          </div>
        </Modal>
      )}

      {showReopen && (
        <Modal
          title="Reopen action"
          subtitle={`${detail.referenceNo} · Formal reopen of a closed action`}
          onClose={() => setShowReopen(false)}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              This returns the action to <b>In progress</b> and notifies stakeholders. Provide the governance reason.
            </p>
            <label className="field-label">
              Reason for reopening
              <textarea
                className="field-input min-h-[80px]"
                value={reopenNote}
                onChange={(e) => setReopenNote(e.target.value)}
                placeholder="e.g. Additional evidence required after audit review"
              />
            </label>
            <ModalActions>
              <button type="button" className="btn" onClick={() => setShowReopen(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={reopening} onClick={handleReopen}>
                {reopening ? "Reopening…" : "Confirm reopen"}
              </button>
            </ModalActions>
          </div>
        </Modal>
      )}
    </>
  );
}

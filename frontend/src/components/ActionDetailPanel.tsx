import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  MessageSquare,
  Paperclip,
  ScrollText,
  Send,
  XCircle,
  Calendar,
  User,
  Building2,
  Flag,
  Percent,
} from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { StatusPill, DueBadge, ProgressBar, formatDate } from "@/components/StatusBits";
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
  onChanged,
}: {
  actionId: number;
  onChanged?: () => void;
}) {
  const { me } = useAuth();
  const flash = useFlash();
  const [commentBody, setCommentBody] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
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

  const submitComment = async () => {
    if (!detail || !commentBody.trim()) return;
    setCommentBusy(true);
    try {
      await endpoints.postActionComment(actionId, commentBody.trim());
      flash("Comment posted — secretary and owners notified by email");
      setCommentBody("");
      load();
      onChanged?.();
    } catch (err: unknown) {
      flash(err instanceof ApiClientError ? err.message : "Could not post comment.", "error");
    } finally {
      setCommentBusy(false);
    }
  };

  if (!detail) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading action…
      </div>
    );
  }

  const committeeId = detail.committee.id;
  const isOfficerStakeholder = detail.stakeholders.some(
    (s) =>
      s.userId === me?.id &&
      (s.stakeholderType === "CHAIRPERSON" || s.stakeholderType === "SECRETARY"),
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
  const isOfficer = isOfficerStakeholder || isCommitteeOfficer(me, committeeId);
  const canReopen = isOfficer && ["COMPLETED", "CANCELLED"].includes(detail.status);
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
      flash(
        err instanceof ApiClientError ? err.message : "Failed to download evidence file.",
        "error",
      );
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
      onChanged?.();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.isConflict) {
          flash(
            "This action was changed by someone else. Refreshing — review and verify again.",
            "error",
          );
          load();
        } else {
          flash(err.message || "Verification failed.", "error");
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
      onChanged?.();
    } catch (err: unknown) {
      flash(err instanceof ApiClientError ? err.message : "Could not update action.", "error");
    } finally {
      setEditBusy(false);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        "Cancel this action point? Stakeholders will be notified and history retained.",
      )
    )
      return;
    try {
      await endpoints.deleteAction(actionId, { version: detail.version });
      flash("Action cancelled");
      onChanged?.();
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
      onChanged?.();
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
        u.status === "PENDING_VERIFICATION" ||
        (detail.status === "PENDING_VERIFICATION" && u.status === detail.status),
    ) ?? detail.updates[0];
  const pendingFiles = submissionUpdate?.evidenceFiles ?? [];

  const owners = detail.stakeholders.filter((s) => s.stakeholderType === "ACTION_OWNER");
  const others = detail.stakeholders.filter((s) => s.stakeholderType !== "ACTION_OWNER");

  return (
    <>
      <div className="space-y-6">
        {/* ── Hero header with primary actions ── */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="bg-gradient-to-br from-brand-700 via-brand-800 to-slate-900 px-5 py-6 text-white sm:px-8 sm:py-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-white/15 px-2 py-0.5 font-mono text-xs font-semibold tracking-wide">
                    {detail.referenceNo}
                  </span>
                  <StatusPill status={detail.status} />
                  {detail.priority && (
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                      {detail.priority}
                    </span>
                  )}
                </div>
                <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                  {detail.title}
                </h1>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-brand-100/90">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 opacity-80" />
                    {detail.committee.name}
                  </span>
                  {detail.meeting?.reference && (
                    <Link
                      to={`/meetings/${detail.meeting.id}`}
                      className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
                    >
                      {detail.meeting.reference}
                    </Link>
                  )}
                </p>
              </div>

              {/* Header action buttons */}
              <div className="flex shrink-0 flex-wrap gap-2">
                {canUpdate && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-brand-800 shadow-sm hover:bg-brand-50"
                    onClick={() => setShowUpdate(true)}
                  >
                    Update progress
                  </button>
                )}
                {canModify && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-3.5 py-2 text-sm font-medium text-white hover:bg-white/20"
                    onClick={openEdit}
                  >
                    Edit
                  </button>
                )}
                {canReopen && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-3.5 py-2 text-sm font-medium text-white hover:bg-white/20"
                    onClick={() => setShowReopen(true)}
                  >
                    Reopen
                  </button>
                )}
                {canCancel && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-300/40 bg-red-500/20 px-3.5 py-2 text-sm font-medium text-red-100 hover:bg-red-500/30"
                    onClick={() => void handleDelete()}
                  >
                    Cancel action
                  </button>
                )}
              </div>
            </div>

            {/* Progress strip */}
            <div className="mt-6 rounded-xl bg-white/10 p-4 backdrop-blur-sm">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-brand-50">Progress</span>
                <span className="font-bold tabular-nums text-white">{detail.progress}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-black/25">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, detail.progress))}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Two-column body ── */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* LEFT — main story */}
          <div className="space-y-6 xl:col-span-7">
            {/* Key facts */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
              <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400">
                Key details
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex gap-3 rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
                  <User className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Primary owner
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                      {detail.owner.fullName}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Deadline
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                      {formatDate(detail.revisedDeadline ?? detail.deadline)}
                      {detail.revisedDeadline && (
                        <span className="ml-1.5 text-xs font-normal text-amber-600">(revised)</span>
                      )}
                    </p>
                    <div className="mt-1">
                      <DueBadge
                        deadline={detail.revisedDeadline ?? detail.deadline}
                        status={detail.status}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
                  <Flag className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Priority
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                      {detail.priority}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
                  <Percent className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Completion
                    </p>
                    <div className="mt-1.5">
                      <ProgressBar value={detail.progress} />
                    </div>
                  </div>
                </div>
              </div>

              {detail.description && (
                <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Description
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                    {detail.description}
                  </p>
                </div>
              )}
              {detail.statusReason && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <span className="font-semibold">Status note: </span>
                  {detail.statusReason}
                </div>
              )}
            </section>

            {/* Pending verification banner */}
            {detail.status === "PENDING_VERIFICATION" && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50/90 p-5 shadow-sm dark:border-amber-900 dark:bg-amber-950/40 sm:p-6">
                <h2 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  Awaiting verification
                </h2>
                <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-300/90">
                  The owner submitted this action as complete. Review evidence, then approve or return
                  it.
                </p>
                {submissionUpdate && (
                  <div className="mt-4 space-y-3">
                    {submissionUpdate.note && (
                      <p className="rounded-lg bg-white/70 p-3 text-sm text-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
                        {submissionUpdate.note}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {pendingFiles.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className="btn text-xs"
                          disabled={downloadingId === f.id}
                          onClick={() => void handleDownloadEvidence(f.id, f.filename)}
                        >
                          {downloadingId === f.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          {f.filename}
                          <span className="text-slate-400">({formatBytes(f.sizeBytes)})</span>
                        </button>
                      ))}
                      {submissionUpdate.evidenceLink && (
                        <a
                          href={submissionUpdate.evidenceLink}
                          target="_blank"
                          rel="noreferrer"
                          className="btn text-xs"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          External evidence
                        </a>
                      )}
                    </div>
                  </div>
                )}
                {canVerify && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={verifying}
                      onClick={() => void verify(true)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve completion
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      disabled={verifying}
                      onClick={() => void verify(false)}
                    >
                      <XCircle className="h-4 w-4" />
                      Return for more work
                    </button>
                  </div>
                )}
                {!canVerify && (
                  <p className="mt-3 text-xs text-amber-800 dark:text-amber-300">
                    Only the committee chairperson or secretary may verify this submission.
                  </p>
                )}
              </section>
            )}

            {/* History timeline */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Progress history
                </h2>
                <span className="text-xs text-slate-400">
                  {detail.updates.length} update{detail.updates.length === 1 ? "" : "s"}
                </span>
              </div>
              {detail.updates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center dark:border-slate-700">
                  <FileText className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                    No updates yet
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Progress notes and evidence will appear here when the owner reports in.
                  </p>
                  {canUpdate && (
                    <button
                      type="button"
                      className="btn-primary mt-4 text-sm"
                      onClick={() => setShowUpdate(true)}
                    >
                      Add first update
                    </button>
                  )}
                </div>
              ) : (
                <ol className="relative space-y-0 border-l-2 border-slate-200 pl-5 dark:border-slate-700">
                  {detail.updates.map((u) => (
                    <li key={u.id} className="relative pb-6 last:pb-0">
                      <span className="absolute -left-[1.4rem] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-500 dark:border-slate-900" />
                      <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {u.author.fullName}
                          </p>
                          <div className="flex items-center gap-2">
                            <StatusPill status={u.status} />
                            <span className="text-xs text-slate-400">{formatDate(u.createdAt)}</span>
                          </div>
                        </div>
                        {u.note && (
                          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                            {u.note}
                          </p>
                        )}
                        {(u.evidenceFiles.length > 0 || u.evidenceLink) && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {u.evidenceFiles.map((f) => (
                              <button
                                key={f.id}
                                type="button"
                                className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
                                disabled={downloadingId === f.id}
                                onClick={() => void handleDownloadEvidence(f.id, f.filename)}
                              >
                                <Paperclip className="h-3 w-3" />
                                {f.filename}
                              </button>
                            ))}
                            {u.evidenceLink && (
                              <a
                                href={u.evidenceLink}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200 dark:bg-slate-900 dark:text-brand-300 dark:ring-brand-900"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Link
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* Central comments */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
              <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                <MessageSquare className="h-3.5 w-3.5" />
                Central Committee comments
              </h2>
              <div className="space-y-3">
                {(detail.comments ?? []).length === 0 && (
                  <p className="text-sm text-slate-400">No oversight comments yet.</p>
                )}
                {(detail.comments ?? []).map((c) => (
                  <div
                    key={c.id}
                    className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {c.author.fullName}
                      </span>
                      <span>·</span>
                      <span>{formatDate(c.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">
                      {c.body}
                    </p>
                  </div>
                ))}
              </div>
              {me?.isCentralCommittee && (
                <div className="mt-4 space-y-2 rounded-xl border border-dashed border-brand-300 bg-brand-50/50 p-4 dark:border-brand-800 dark:bg-brand-950/20">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Visible on the portal and emailed to the secretary and action owner(s).
                  </p>
                  <textarea
                    className="field-input min-h-[88px]"
                    placeholder="Write an oversight comment…"
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    maxLength={4000}
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="btn-primary text-xs"
                      disabled={commentBusy || !commentBody.trim()}
                      onClick={() => void submitComment()}
                    >
                      <Send className="h-3.5 w-3.5" />
                      {commentBusy ? "Sending…" : "Post comment"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* RIGHT — people & meta */}
          <aside className="space-y-5 xl:col-span-5">
            {/* Owners */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                Action owners
              </h2>
              <ul className="space-y-2">
                {owners.length === 0 && (
                  <li className="text-sm text-slate-500">{detail.owner.fullName}</li>
                )}
                {(owners.length ? owners : [{ userId: detail.owner.id, fullName: detail.owner.fullName, stakeholderType: "ACTION_OWNER" as const }]).map(
                  (s) => (
                    <li
                      key={s.userId}
                      className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/50"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800 dark:bg-brand-950 dark:text-brand-200">
                        {s.fullName
                          .split(" ")
                          .map((p) => p[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {s.fullName}
                        </p>
                        <p className="text-[11px] text-slate-500">Action owner</p>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            </section>

            {/* Other stakeholders */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                Committee roles
              </h2>
              <ul className="space-y-2">
                {others.map((s) => (
                  <li
                    key={`${s.userId}-${s.stakeholderType}`}
                    className="flex items-center justify-between gap-2 rounded-lg px-1 py-1.5"
                  >
                    <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {s.fullName}
                    </span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {s.stakeholderType.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </li>
                ))}
                {others.length === 0 && (
                  <li className="text-sm text-slate-400">No additional roles listed.</li>
                )}
              </ul>
            </section>

            {/* Quick links */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                Related
              </h2>
              <div className="space-y-2 text-sm">
                <Link
                  to={`/committees/${detail.committee.id}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950/40"
                >
                  <Building2 className="h-4 w-4" />
                  Open committee workspace
                </Link>
                {detail.meeting?.id && (
                  <Link
                    to={`/meetings/${detail.meeting.id}`}
                    className="flex items-center gap-2 rounded-lg px-2 py-2 font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950/40"
                  >
                    <Calendar className="h-4 w-4" />
                    Open source meeting
                  </Link>
                )}
              </div>
            </section>

            {/* Audit */}
            {showAuditSection && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => void loadAudit()}
                  className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-slate-800 dark:text-slate-100"
                >
                  <span className="inline-flex items-center gap-2">
                    <ScrollText className="h-4 w-4 text-slate-400" />
                    Audit trail
                  </span>
                  <span className="text-xs font-normal text-slate-400">
                    {showAudit ? "Hide" : "Show"}
                  </span>
                </button>
                {showAudit && (
                  <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                    {auditLoading && (
                      <p className="flex items-center gap-2 text-xs text-slate-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                      </p>
                    )}
                    {auditError && (
                      <p className="text-xs text-red-600 dark:text-red-400">{auditError}</p>
                    )}
                    {!auditLoading && audit && audit.length === 0 && !auditError && (
                      <p className="text-xs text-slate-400">No audit events yet.</p>
                    )}
                    {!auditLoading &&
                      audit?.map((ev) => (
                        <div
                          key={ev.eventId}
                          className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="font-semibold text-slate-800 dark:text-slate-100">
                              {ev.action}
                            </span>
                            <span className="text-slate-400">{formatDate(ev.occurredAt)}</span>
                          </div>
                          {ev.actor && (
                            <p className="mt-0.5 text-slate-500">{ev.actor.fullName}</p>
                          )}
                          {ev.after != null && (
                            <pre className="mt-1 overflow-x-auto rounded bg-white p-1.5 text-[10px] text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                              {formatAuditValue(ev.after)}
                            </pre>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </section>
            )}
          </aside>
        </div>
      </div>

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
            onChanged?.();
          }}
        />
      )}

      {showEdit && (
        <Modal title="Edit action details" subtitle={detail.referenceNo} onClose={() => setShowEdit(false)}>
          <div className="space-y-3">
            <label className="field-label">
              Title
              <input
                className="field-input"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </label>
            <label className="field-label">
              Deadline
              <input
                type="date"
                className="field-input"
                value={editDeadline}
                onChange={(e) => setEditDeadline(e.target.value)}
              />
            </label>
            <label className="field-label">
              Priority
              <select
                className="field-input"
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value)}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </label>
            <p className="text-xs text-slate-400">
              Only chairperson/secretary may change these fields. Progress updates stay with the owner.
            </p>
          </div>
          <ModalActions>
            <button type="button" className="btn" onClick={() => setShowEdit(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={editBusy}
              onClick={() => void handleEditSave()}
            >
              {editBusy ? "Saving…" : "Save changes"}
            </button>
          </ModalActions>
        </Modal>
      )}

      {showReopen && (
        <Modal
          title="Reopen action"
          subtitle={`${detail.referenceNo} · Formal reopen of a closed action`}
          onClose={() => setShowReopen(false)}
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Reopening moves this action out of a terminal status so work can continue. A reason is
              required.
            </p>
            <label className="field-label">
              Reason
              <textarea
                className="field-input min-h-[80px]"
                value={reopenNote}
                onChange={(e) => setReopenNote(e.target.value)}
                placeholder="e.g. Additional evidence required after audit review"
              />
            </label>
          </div>
          <ModalActions>
            <button type="button" className="btn" onClick={() => setShowReopen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={reopening}
              onClick={() => void handleReopen()}
            >
              {reopening ? "Reopening…" : "Confirm reopen"}
            </button>
          </ModalActions>
        </Modal>
      )}
    </>
  );
}

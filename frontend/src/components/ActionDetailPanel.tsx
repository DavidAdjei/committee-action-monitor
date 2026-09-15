import { useEffect, useState } from "react";
import { CheckCircle2, Download, ExternalLink, FileText, Loader2, Paperclip, XCircle } from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { StatusPill, formatDate } from "@/components/StatusBits";
import { StatusUpdateModal } from "@/components/modals/StatusUpdateModal";
import { endpoints } from "@/api/endpoints";
import { useAuth } from "@/state/authContext";
import { useFlash } from "@/state/toastContext";
import type { ActionDetail } from "@/types";

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
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

  const load = () => endpoints.actionDetail(actionId).then(setDetail);
  useEffect(() => {
    load();
  }, [actionId]);

  if (!detail) return null;

  const isOfficer = detail.stakeholders.some(
    (s) => s.userId === me?.id && (s.stakeholderType === "CHAIRPERSON" || s.stakeholderType === "SECRETARY"),
  );
  const isOwner = detail.owner.id === me?.id;
  const canUpdate = (isOfficer || isOwner) && !["COMPLETED", "CANCELLED"].includes(detail.status);
  const canVerify = isOfficer && detail.status === "PENDING_VERIFICATION";

  const handleDownloadEvidence = async (evidenceId: number, filename: string) => {
    setDownloadingId(evidenceId);
    try {
      await endpoints.downloadEvidence(evidenceId, filename);
      flash(`Downloading ${filename}`);
    } catch (err: any) {
      flash(err.message ?? "Failed to download evidence file.");
    } finally {
      setDownloadingId(null);
    }
  };

  const verify = async (approve: boolean) => {
    setVerifying(true);
    try {
      await endpoints.verifyAction(actionId, approve, approve ? "Evidence reviewed and approved." : undefined);
      flash(approve ? "Action verified as completed" : "Action returned for further work");
      load();
      onChanged();
    } finally {
      setVerifying(false);
    }
  };

  const submissionUpdate = detail.updates.find(
    (u) => (u.status === "PENDING_VERIFICATION" || u.progress === 100) && (u.evidenceFiles.length > 0 || u.evidenceLink || u.note),
  ) ?? detail.updates[0];
  const pendingFiles = submissionUpdate?.evidenceFiles ?? [];

  return (
    <>
      <Modal
        title={detail.referenceNo}
        subtitle={detail.title}
        onClose={onClose}
        wide
      >
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <StatusPill status={detail.status} />
            <span className="text-sm text-slate-500">{detail.progress}% complete</span>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-4 text-sm">
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
            {detail.description && (
              <div className="col-span-2">
                <small className="block text-slate-400">Description</small>
                <p>{detail.description}</p>
              </div>
            )}
          </div>

          {detail.status === "PENDING_VERIFICATION" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 space-y-4">
              <div>
                <b className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  Awaiting Verification & Approval
                </b>
                <p className="mt-1 text-xs text-amber-700 leading-relaxed">
                  The action owner has submitted evidence claiming completion. Review and download the attached evidence file(s) below before verifying.
                </p>
              </div>

              {submissionUpdate && (
                <div className="rounded-lg border border-amber-200 bg-white/90 p-3.5 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Submitted by <b className="text-slate-700">{submissionUpdate.author.fullName}</b>
                    </span>
                    <span>{formatDate(submissionUpdate.createdAt)}</span>
                  </div>

                  {submissionUpdate.note && (
                    <p className="text-sm text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-100 italic">
                      "{submissionUpdate.note}"
                    </p>
                  )}

                  {pendingFiles.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <small className="font-semibold text-slate-600 text-xs flex items-center gap-1.5">
                          <Paperclip className="h-3.5 w-3.5 text-amber-700" />
                          Attached Evidence ({pendingFiles.length} {pendingFiles.length === 1 ? "file" : "files"}):
                        </small>
                        {pendingFiles.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              pendingFiles.forEach((f) => handleDownloadEvidence(f.id, f.filename));
                            }}
                            className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1 hover:underline"
                          >
                            <Download className="h-3 w-3" /> Download all
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {pendingFiles.map((f) => (
                          <div
                            key={f.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 hover:bg-slate-100/80 transition"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="grid h-8 w-8 shrink-0 place-items-center rounded bg-amber-100 text-amber-800">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium text-slate-800" title={f.filename}>
                                  {f.filename}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {formatBytes(f.sizeBytes)}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={downloadingId === f.id}
                              onClick={() => handleDownloadEvidence(f.id, f.filename)}
                              className="btn-secondary shrink-0 !py-1 !px-2.5 text-xs flex items-center gap-1 hover:border-brand-300 hover:text-brand-700"
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
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>View External Evidence Link</span>
                      </a>
                    </div>
                  )}

                  {pendingFiles.length === 0 && !submissionUpdate.evidenceLink && (
                    <p className="text-xs text-slate-400 italic">No files attached to this submission.</p>
                  )}
                </div>
              )}

              {canVerify && (
                <div className="pt-1 flex items-center gap-2">
                  <button className="btn-primary" disabled={verifying} onClick={() => verify(true)}>
                    <CheckCircle2 className="h-4 w-4" /> Approve & close
                  </button>
                  <button className="btn-danger" disabled={verifying} onClick={() => verify(false)}>
                    <XCircle className="h-4 w-4" /> Return for more work
                  </button>
                </div>
              )}
            </div>
          )}

          <div>
            <b className="mb-2 block text-sm text-slate-800">History</b>
            <div className="space-y-3">
              {detail.updates.map((u) => (
                <div key={u.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                    <span>
                      <b className="text-slate-700">{u.author.fullName}</b> · {formatDate(u.createdAt)}
                    </span>
                    <StatusPill status={u.status} />
                  </div>
                  <p className="text-sm text-slate-700">{u.note}</p>
                  {(u.evidenceFiles.length > 0 || u.evidenceLink) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {u.evidenceFiles.map((f) => (
                        <button
                          type="button"
                          key={f.id}
                          disabled={downloadingId === f.id}
                          onClick={() => handleDownloadEvidence(f.id, f.filename)}
                          className="flex items-center gap-1.5 rounded-full bg-slate-100 hover:bg-brand-50 hover:text-brand-700 px-3 py-1 text-xs text-slate-600 border border-transparent hover:border-brand-200 transition group cursor-pointer"
                          title={`Click to download ${f.filename}`}
                        >
                          {downloadingId === f.id ? (
                            <Loader2 className="h-3 w-3 animate-spin text-brand-600" />
                          ) : (
                            <Download className="h-3 w-3 text-slate-400 group-hover:text-brand-600 transition" />
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
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 hover:bg-blue-50 hover:text-blue-700 px-3 py-1 text-xs text-brand-700 underline transition"
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
            <b className="mb-1.5 block text-sm text-slate-800">Stakeholders</b>
            <div className="flex flex-wrap gap-2">
              {detail.stakeholders.map((s) => (
                <span key={s.userId} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                  {s.fullName} · {s.stakeholderType.replace("_", " ").toLowerCase()}
                </span>
              ))}
            </div>
          </div>
        </div>

        <ModalActions>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          {canUpdate && (
            <button className="btn-primary" onClick={() => setShowUpdate(true)}>
              Update status
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
          onClose={() => setShowUpdate(false)}
          onSaved={() => {
            load();
            onChanged();
          }}
        />
      )}
    </>
  );
}

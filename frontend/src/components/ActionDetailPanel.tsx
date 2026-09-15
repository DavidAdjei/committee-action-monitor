import { useEffect, useState } from "react";
import { CheckCircle2, Paperclip, XCircle } from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { StatusPill, formatDate } from "@/components/StatusBits";
import { StatusUpdateModal } from "@/components/modals/StatusUpdateModal";
import { endpoints } from "@/api/endpoints";
import { useAuth } from "@/state/authContext";
import { useFlash } from "@/state/toastContext";
import type { ActionDetail } from "@/types";

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
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <b className="text-sm text-amber-800">Awaiting verification</b>
              <p className="mt-1 text-sm text-amber-700">
                The owner has submitted evidence of completion. A Chairperson or Secretary must verify before this
                action closes.
              </p>
              {canVerify && (
                <div className="mt-3 flex gap-2">
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
                        <span
                          key={f.id}
                          className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                        >
                          <Paperclip className="h-3 w-3" /> {f.filename}
                        </span>
                      ))}
                      {u.evidenceLink && (
                        <a
                          href={u.evidenceLink}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-brand-700 underline"
                        >
                          External evidence link
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

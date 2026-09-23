import { useEffect, useState } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { formatDate } from "@/components/StatusBits";
import { endpoints } from "@/api/endpoints";
import { ApiClientError } from "@/api/client";
import { useAuth } from "@/state/authContext";
import { useFlash } from "@/state/toastContext";
import type { ActionComment } from "@/types";

/**
 * View all comments on an action; Central Committee may also post.
 */
export function ActionCommentsModal({
  actionId,
  referenceNo,
  title,
  mode,
  onClose,
  onChanged,
}: {
  actionId: number;
  referenceNo: string;
  title: string;
  /** view = read-only list; add = focus composer (Central only) */
  mode: "view" | "add";
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { me } = useAuth();
  const flash = useFlash();
  const canComment = Boolean(me?.isCentralCommittee || me?.isAdmin);
  const [comments, setComments] = useState<ActionComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    endpoints.actionDetail(actionId).then((d) => {
      setComments(d.comments ?? []);
    });

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err: unknown) => {
        flash(err instanceof ApiClientError ? err.message : "Could not load comments.", "error");
        onClose();
      })
      .finally(() => setLoading(false));
  }, [actionId]);

  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await endpoints.addActionComment(actionId, body.trim());
      setBody("");
      flash("Comment sent to the secretary and action owner(s)");
      await load();
      onChanged?.();
    } catch (err: unknown) {
      flash(err instanceof ApiClientError ? err.message : "Could not post comment.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={mode === "add" ? "Add comment" : "Comments"}
      subtitle={`${referenceNo} · ${title}`}
      onClose={onClose}
      wide
    >
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading comments…
        </p>
      ) : (
        <div className="space-y-4">
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {comments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center dark:border-slate-700">
                <MessageSquare className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
                <p className="mt-2 text-sm text-slate-500">No comments on this action yet.</p>
              </div>
            ) : (
              comments.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/40"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {c.author.fullName}
                    </span>
                    <span>·</span>
                    <span>{formatDate(c.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{c.body}</p>
                </div>
              ))
            )}
          </div>

          {canComment && (
            <div className="space-y-2 rounded-lg border border-dashed border-brand-300 bg-brand-50/40 p-3 dark:border-brand-800 dark:bg-brand-950/20">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Visible on the portal and emailed to the committee secretary and action owner(s).
              </p>
              <textarea
                className="field-input min-h-[88px]"
                placeholder="Write a comment…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={4000}
                autoFocus={mode === "add"}
              />
            </div>
          )}
        </div>
      )}

      <ModalActions>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
        {canComment && (
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !body.trim()}
            onClick={() => void submit()}
          >
            <Send className="h-4 w-4" />
            {busy ? "Sending…" : "Post comment"}
          </button>
        )}
      </ModalActions>
    </Modal>
  );
}

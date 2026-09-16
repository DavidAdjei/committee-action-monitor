import { FormEvent, useEffect, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { endpoints } from "@/api/endpoints";
import { useFlash } from "@/state/toastContext";
import type { DirectoryUser } from "@/types";

export function AddMemberModal({
  committeeId,
  committeeName,
  existingMemberIds,
  onClose,
  onAdded,
}: {
  committeeId: number;
  committeeName: string;
  existingMemberIds: number[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const flash = useFlash();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<DirectoryUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null);
  const [role, setRole] = useState<"MEMBER" | "SECRETARY" | "CHAIRPERSON">("MEMBER");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      endpoints.directory(query).then((users) => {
        // Exclude already active members
        setCandidates(users.filter((u) => !existingMemberIds.includes(u.id)));
      });
    }, 200);
    return () => window.clearTimeout(handle);
    // existingMemberIds is intentionally not a dep trigger for refetch on every parent render;
    // filter still uses the latest value when results arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedUser) {
      setError("Please select a user to add.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await endpoints.addCommitteeMember(committeeId, {
        userId: selectedUser.id,
        role,
      });
      flash(`${selectedUser.fullName} has been added to ${committeeName}`, "success");
      onAdded();
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Failed to add member to committee.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Add Committee Member"
      subtitle={`${committeeName} · Chairperson / Secretary may add members and assign roles`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        {/* User Search & Selection */}
        <div className="space-y-2">
          <label className="field-label">
            Search Employee
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                className="field-input w-full pl-9"
                placeholder="Type name or email to search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </label>

          {selectedUser && (
            <div className="flex items-center justify-between rounded-lg border border-brand-300 bg-brand-50/50 p-2.5 dark:border-brand-800 dark:bg-brand-950/30">
              <div>
                <b className="text-sm text-slate-800 dark:text-slate-100">{selectedUser.fullName}</b>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedUser.email} {selectedUser.department ? `· ${selectedUser.department}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="text-xs font-semibold text-slate-500 hover:text-red-600"
              >
                Change
              </button>
            </div>
          )}

          {!selectedUser && candidates.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-800">
              {candidates.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setSelectedUser(c)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                >
                  <span className="font-medium text-slate-700 dark:text-slate-200">{c.fullName}</span>
                  <span className="text-slate-400">{c.department ?? c.email}</span>
                </button>
              ))}
            </div>
          )}

          {!selectedUser && candidates.length === 0 && query && (
            <p className="text-xs text-slate-400 py-1">No available employees match "{query}".</p>
          )}
        </div>

        {/* Committee Role Selection */}
        <label className="field-label">
          Committee Role
          <select
            className="field-input"
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
          >
            <option value="MEMBER">Member (Standard member)</option>
            <option value="SECRETARY">Secretary (Minutes & meetings officer)</option>
            <option value="CHAIRPERSON">Chairperson (Committee Leader)</option>
          </select>
          <small className="text-slate-400 font-normal">
            Assigning Chairperson will automatically update committee leadership.
          </small>
        </label>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <ModalActions>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary gap-1.5" disabled={submitting || !selectedUser}>
            <UserPlus className="h-4 w-4" />
            {submitting ? "Adding…" : "Add to Committee"}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}

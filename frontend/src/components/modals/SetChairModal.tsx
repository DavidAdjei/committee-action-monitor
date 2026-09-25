import { FormEvent, useEffect, useState } from "react";
import { Crown, Search } from "lucide-react";
import { Modal, ModalActions } from "@/components/Modal";
import { endpoints } from "@/api/endpoints";
import { useFlash } from "@/state/toastContext";
import type { DirectoryUser } from "@/types";

export function SetChairModal({
  committeeId,
  committeeName,
  currentChairperson,
  onClose,
  onChanged,
}: {
  committeeId: number;
  committeeName: string;
  currentChairperson?: { id: number; fullName: string } | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const flash = useFlash();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<DirectoryUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    endpoints.directory(query).then((users) => {
      const excludeId = currentChairperson?.id;
      setCandidates(excludeId ? users.filter((u) => u.id !== excludeId) : users);
    });
  }, [query, currentChairperson.id]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedUser) {
      setError("Please select an employee to assign as Chairperson.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await endpoints.setCommitteeChair(committeeId, {
        chairpersonId: selectedUser.id,
      });
      flash(`${selectedUser.fullName} is now the Chairperson of ${committeeName}`, "success");
      onChanged();
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Failed to update committee chairperson.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Set Committee Chairperson"
      subtitle={`${committeeName} · Central Committee Governance`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-medium uppercase text-slate-400">Current Chairperson</p>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 mt-0.5">
            <Crown className="h-4 w-4 text-brand-500" />
            {currentChairperson?.fullName ?? "None"}
          </p>
        </div>

        <div className="space-y-2">
          <label className="field-label">
            Select New Chairperson
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                className="field-input w-full pl-9"
                placeholder="Search employee directory…"
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
            <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-800 bg-white dark:bg-slate-800">
              {candidates.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setSelectedUser(c)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                >
                  <span className="font-medium text-slate-700 dark:text-slate-200">{c.fullName}</span>
                  <span className="text-slate-400">{c.department ?? c.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Changing the chairperson will transfer primary committee leadership, meeting approval authority, and action verification rights to the selected employee.
        </p>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <ModalActions>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary gap-1.5" disabled={submitting || !selectedUser}>
            <Crown className="h-4 w-4" />
            {submitting ? "Updating…" : "Confirm New Chairperson"}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}

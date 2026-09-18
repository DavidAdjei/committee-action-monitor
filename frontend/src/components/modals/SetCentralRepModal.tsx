import { FormEvent, useEffect, useState } from "react";
import { Modal, ModalActions } from "@/components/Modal";
import { endpoints } from "@/api/endpoints";
import { ApiClientError } from "@/api/client";
import type { DirectoryUser } from "@/types";

export function SetCentralRepModal({
  committeeId,
  committeeName,
  currentRepId,
  onClose,
  onSaved,
}: {
  committeeId: number;
  committeeName: string;
  currentRepId?: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [selectedId, setSelectedId] = useState<string>(
    currentRepId != null ? String(currentRepId) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    endpoints.directory("").then((list) => {
      setUsers(list.filter((u) => u.isCentralCommittee));
    });
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await endpoints.setCommitteeCentralRep(committeeId, {
        centralRepId: selectedId ? Number(selectedId) : null,
      });
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof ApiClientError ? err.message : "Could not update Central representative.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Central Committee representative"
      subtitle={committeeName}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-500">
          Only Central Committee members can be assigned. Choose <b>None</b> to clear the seat.
        </p>
        <label className="field-label">
          Representative
          <select
            className="field-input"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">None</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} ({u.email})
              </option>
            ))}
          </select>
        </label>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <ModalActions>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}

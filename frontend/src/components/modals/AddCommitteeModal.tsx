import { FormEvent, useMemo, useState } from "react";
import { Modal, ModalActions } from "@/components/Modal";
import { MultiStakeholderPicker } from "@/components/MultiStakeholderPicker";
import { UserTypeahead } from "@/components/UserTypeahead";
import { endpoints } from "@/api/endpoints";
import { useFlash } from "@/state/toastContext";
import type { DirectoryUser } from "@/types";

export function AddCommitteeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const flash = useFlash();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [mandate, setMandate] = useState("");
  const [distributionEmail, setDistributionEmail] = useState("");
  const [meetingFrequency, setMeetingFrequency] = useState("Monthly");
  const [chairperson, setChairperson] = useState<DirectoryUser | null>(null);
  const [secretary, setSecretary] = useState<DirectoryUser | null>(null);
  const [centralRep, setCentralRep] = useState<DirectoryUser | null>(null);
  const [members, setMembers] = useState<DirectoryUser[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leadershipIds = useMemo(
    () => [chairperson?.id, secretary?.id, centralRep?.id].filter((id): id is number => id != null),
    [chairperson, secretary, centralRep],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!chairperson || !secretary || !centralRep) {
      setError("Chairperson, Secretary, and Central Committee representative are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await endpoints.createCommittee({
        name,
        code,
        mandate: mandate || undefined,
        distributionEmail: distributionEmail.trim() || undefined,
        meetingFrequency,
        chairpersonId: chairperson.id,
        secretaryId: secretary.id,
        centralRepId: centralRep.id,
        memberIds: members.map((m) => m.id),
      });
      flash("Committee created and leadership notified");
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Could not create the committee.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Create committee" subtitle="Central Committee Administrator only" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="field-label">
            Committee name
            <input required className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field-label">
            Short code
            <input
              required
              className="field-input"
              placeholder="e.g. ISC"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </label>
        </div>

        <label className="field-label">
          Mandate
          <textarea
            className="field-input min-h-[70px]"
            placeholder="Optional description of the committee’s purpose"
            value={mandate}
            onChange={(e) => setMandate(e.target.value)}
          />
        </label>

        <label className="field-label">
          Meeting frequency
          <select
            className="field-input"
            value={meetingFrequency}
            onChange={(e) => setMeetingFrequency(e.target.value)}
          >
            <option>Weekly</option>
            <option>Monthly</option>
            <option>Quarterly</option>
          </select>
        </label>

        <label className="field-label">
          Distribution email (optional)
          <input
            className="field-input"
            type="email"
            placeholder="e.g. ALCO@myumbbank.com"
            value={distributionEmail}
            onChange={(e) => setDistributionEmail(e.target.value)}
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <UserTypeahead
            label="Chairperson"
            value={chairperson}
            onChange={setChairperson}
            required
            placeholder="Type name or email…"
            excludeIds={leadershipIds.filter((id) => id !== chairperson?.id)}
            helpText="Type to search. Top 5 matches."
          />
          <UserTypeahead
            label="Secretary"
            value={secretary}
            onChange={setSecretary}
            required
            placeholder="Type name or email…"
            excludeIds={leadershipIds.filter((id) => id !== secretary?.id)}
            helpText="Type to search. Top 5 matches."
          />
          <UserTypeahead
            label="Central Committee representative"
            value={centralRep}
            onChange={setCentralRep}
            required
            placeholder="Type name or email…"
            excludeIds={leadershipIds.filter((id) => id !== centralRep?.id)}
            filterUser={(u) => Boolean(u.isCentralCommittee)}
            helpText="Must be a Central Committee member. Type to search."
          />
        </div>

        <MultiStakeholderPicker
          label="Ordinary members"
          helpText="Anyone selected here joins with the Member role."
          selected={members}
          onChange={setMembers}
          excludeIds={leadershipIds}
        />

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <ModalActions>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Creating…" : "Create committee"}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}

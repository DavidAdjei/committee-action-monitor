import { FormEvent, useState } from "react";
import { Modal, ModalActions } from "@/components/Modal";
import { MultiStakeholderPicker } from "@/components/MultiStakeholderPicker";
import { endpoints } from "@/api/endpoints";
import { useFlash } from "@/state/toastContext";
import type { DirectoryUser } from "@/types";

export function AddCommitteeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const flash = useFlash();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [mandate, setMandate] = useState("");
  const [meetingFrequency, setMeetingFrequency] = useState("Monthly");
  const [chairperson, setChairperson] = useState<DirectoryUser | null>(null);
  const [secretary, setSecretary] = useState<DirectoryUser | null>(null);
  const [centralRep, setCentralRep] = useState<DirectoryUser | null>(null);
  const [members, setMembers] = useState<DirectoryUser[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!chairperson || !secretary || !centralRep) return;
    setSubmitting(true);
    setError(null);
    try {
      await endpoints.createCommittee({
        name,
        code,
        mandate: mandate || undefined,
        meetingFrequency,
        chairpersonId: chairperson.id,
        secretaryId: secretary.id,
        centralRepId: centralRep.id,
        memberIds: members.map((m) => m.id),
      });
      flash("Committee created and leadership notified");
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Could not create the committee.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Create committee"
      subtitle="Central Committee Administrator only"
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
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
            placeholder="What this committee is responsible for"
            value={mandate}
            onChange={(e) => setMandate(e.target.value)}
          />
        </label>

        <label className="field-label">
          Meeting frequency
          <select className="field-input" value={meetingFrequency} onChange={(e) => setMeetingFrequency(e.target.value)}>
            <option>Weekly</option>
            <option>Bi-weekly</option>
            <option>Monthly</option>
            <option>Quarterly</option>
          </select>
        </label>

        <div className="grid grid-cols-3 gap-4">
          <PersonSelect label="Chairperson" value={chairperson} onChange={setChairperson} />
          <PersonSelect label="Secretary" value={secretary} onChange={setSecretary} />
          <PersonSelect label="Central Committee representative" value={centralRep} onChange={setCentralRep} centralOnly />
        </div>

        <MultiStakeholderPicker
          label="Ordinary members"
          helpText="Anyone selected here joins with the Member role."
          selected={members}
          onChange={setMembers}
          excludeIds={[chairperson?.id, secretary?.id, centralRep?.id].filter(Boolean) as number[]}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

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

function PersonSelect({
  label,
  value,
  onChange,
  centralOnly = false,
}: {
  label: string;
  value: DirectoryUser | null;
  onChange: (u: DirectoryUser | null) => void;
  centralOnly?: boolean;
}) {
  const [options, setOptions] = useState<DirectoryUser[]>([]);
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    endpoints.directory("").then((all) => {
      setOptions(all);
      setLoaded(true);
    });
  }

  return (
    <label className="field-label">
      {label}
      <select
        required
        className="field-input"
        value={value?.id ?? ""}
        onChange={(e) => onChange(options.find((o) => o.id === Number(e.target.value)) ?? null)}
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.fullName}
          </option>
        ))}
      </select>
      {centralOnly && <small className="font-normal text-slate-400">Must be a Central Committee Member.</small>}
    </label>
  );
}

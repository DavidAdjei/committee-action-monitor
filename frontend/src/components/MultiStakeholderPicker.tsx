import { useEffect, useRef, useState } from "react";
import { Search, UserRound, X } from "lucide-react";
import { endpoints } from "@/api/endpoints";
import type { DirectoryUser } from "@/types";

export function MultiStakeholderPicker({
  label = "Additional stakeholders",
  helpText = "Search the directory by name, email or department.",
  selected,
  onChange,
  excludeIds = [],
}: {
  label?: string;
  helpText?: string;
  selected: DirectoryUser[];
  onChange: (users: DirectoryUser[]) => void;
  excludeIds?: number[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      endpoints.directory(query).then((users) => {
        const excluded = new Set([...excludeIds, ...selected.map((s) => s.id)]);
        setResults(users.filter((u) => !excluded.has(u.id)));
      });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query, selected, excludeIds]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const add = (u: DirectoryUser) => {
    onChange([...selected, u]);
    setQuery("");
  };
  const remove = (id: number) => onChange(selected.filter((u) => u.id !== id));

  return (
    <label className="field-label">
      {label} <span className="font-normal text-slate-400">(select one or more)</span>
      <div ref={boxRef} className="relative rounded-lg border border-slate-300 bg-white p-2">
        {selected.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selected.map((u) => (
              <span
                key={u.id}
                className="flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700"
              >
                <UserRound className="h-3 w-3" />
                {u.fullName}
                <button type="button" aria-label={`Remove ${u.fullName}`} onClick={() => remove(u.id)}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 rounded-md border border-slate-200 px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <input
            className="w-full text-sm outline-none"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            placeholder="Search Entra ID by name, email or department"
          />
        </div>
        {open && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {results.length ? (
              results.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => add(u)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                    {u.fullName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </span>
                  <span>
                    <b className="block text-slate-800">{u.fullName}</b>
                    <small className="text-slate-500">
                      {u.email} · {u.department}
                    </small>
                  </span>
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-slate-400">No matching directory users</p>
            )}
          </div>
        )}
      </div>
      <small className="font-normal text-slate-400">{helpText}</small>
    </label>
  );
}

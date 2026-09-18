import { useEffect, useMemo, useRef, useState } from "react";
import { Search, UserRound, X } from "lucide-react";
import { endpoints } from "@/api/endpoints";
import type { DirectoryUser } from "@/types";

const EMPTY_EXCLUDE: number[] = [];

export function MultiStakeholderPicker({
  label = "Additional stakeholders",
  helpText = "Search the directory by name, email or department.",
  selected,
  onChange,
  excludeIds = EMPTY_EXCLUDE,
}: {
  label?: string;
  helpText?: string;
  selected: DirectoryUser[];
  onChange: (users: DirectoryUser[]) => void;
  excludeIds?: number[];
}) {
  const [query, setQuery] = useState("");
  const [rawResults, setRawResults] = useState<DirectoryUser[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Stable key for excludeIds so parent-created arrays don't retrigger fetches
  const excludeKey = useMemo(
    () => excludeIds.slice().sort((a, b) => a - b).join(","),
    [excludeIds],
  );

  // Fetch only when the search query changes (debounced)
  useEffect(() => {
    const handle = window.setTimeout(() => {
      endpoints.directory(query).then((users) => {
        setRawResults(users);
      });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query]);

  // Derive visible results by filtering out already-selected and excluded users
  const results = useMemo(() => {
    const excluded = new Set([...excludeIds, ...selected.map((s) => s.id)]);
    return rawResults.filter((u) => !excluded.has(u.id));
  }, [rawResults, selected, excludeKey, excludeIds]);

  // Close on outside click (capture phase so it wins over modal handlers)
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const add = (u: DirectoryUser) => {
    onChange([...selected, u]);
    setQuery("");
    setOpen(false); // close after selecting so Save button is reachable
  };

  const remove = (id: number) => onChange(selected.filter((u) => u.id !== id));

  return (
    <div className="field-label">
      <span>
        {label} <span className="font-normal text-slate-400">(select one or more)</span>
      </span>
      <div ref={boxRef} className="relative rounded-lg border border-slate-300 bg-white p-2 dark:border-slate-600 dark:bg-slate-800">
        {selected.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selected.map((u) => (
              <span
                key={u.id}
                className="flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300"
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
        <div className="flex items-center gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 dark:border-slate-600">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            className="w-full bg-transparent text-sm outline-none dark:text-slate-100"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
                inputRef.current?.blur();
              }
            }}
            placeholder="Search Entra ID by name, email or department"
            autoComplete="off"
          />
          {open && (
            <button
              type="button"
              className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              aria-label="Close suggestions"
              onClick={() => {
                setOpen(false);
                inputRef.current?.blur();
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {open && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
            {results.length ? (
              results.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => add(u)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700/60 dark:hover:bg-slate-700"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {u.fullName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </span>
                  <span>
                    <b className="block text-slate-800 dark:text-slate-100">{u.fullName}</b>
                    <small className="text-slate-500 dark:text-slate-400">
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
    </div>
  );
}

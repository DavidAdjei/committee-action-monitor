import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { endpoints } from "@/api/endpoints";
import type { DirectoryUser } from "@/types";

/**
 * Single-user typeahead: type to search the full directory; shows the best 5 matches.
 */
export function UserTypeahead({
  value,
  onChange,
  label = "User",
  placeholder = "Start typing a name or email…",
  required = false,
  excludeIds = [],
  helpText = "Type to search all active users in CAM (synced from Entra). Top 5 matches are shown.",
  filterUser,
}: {
  value: DirectoryUser | null;
  onChange: (user: DirectoryUser | null) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  excludeIds?: number[];
  helpText?: string;
  /** Optional extra filter (e.g. Central Committee only). */
  filterUser?: (u: DirectoryUser) => boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      setQuery(value.fullName);
    }
  }, [value?.id]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1 || (value && q === value.fullName)) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(() => {
      void endpoints
        .directory(q, filterUser ? 25 : 5)
        .then((users) => {
          if (cancelled) return;
          const filtered = users.filter(
            (u) => !excludeIds.includes(u.id) && (filterUser ? filterUser(u) : true),
          );
          setResults(filtered.slice(0, 5));
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, value, excludeIds.join(","), filterUser]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="field-label" ref={wrapRef}>
      {label}
      <div className="relative">
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 dark:border-slate-600 dark:bg-slate-900">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            required={required && !value}
            className="field-input border-0 px-0 shadow-none focus:ring-0"
            value={query}
            placeholder={placeholder}
            autoComplete="off"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              if (value) onChange(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                inputRef.current?.blur();
              }
            }}
          />
          {(value || query) && (
            <button
              type="button"
              className="text-slate-400 hover:text-slate-600"
              aria-label="Clear"
              onClick={() => {
                onChange(null);
                setQuery("");
                setResults([]);
                inputRef.current?.focus();
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {open && query.trim().length >= 1 && !value && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
            {loading && <p className="px-3 py-2 text-sm text-slate-400">Searching…</p>}
            {!loading && results.length === 0 && (
              <p className="px-3 py-2 text-sm text-slate-400">No matching users in the directory</p>
            )}
            {!loading &&
              results.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  onClick={() => {
                    onChange(u);
                    setQuery(u.fullName);
                    setOpen(false);
                  }}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {u.fullName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                  <span>
                    <b className="block text-slate-800 dark:text-slate-100">{u.fullName}</b>
                    <small className="text-slate-500">
                      {u.email}
                      {u.department ? ` · ${u.department}` : ""}
                    </small>
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>
      <small className="font-normal text-slate-400">{helpText}</small>
    </div>
  );
}

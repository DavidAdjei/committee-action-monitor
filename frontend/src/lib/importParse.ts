import type { MappedActionRow } from "./docxTables";
/**
 * Heuristic parsers for UMB-style minutes & action-tracker Word/CSV exports.
 */

export type ParsedActionDraft = {
  key: string;
  title: string;
  ownerHint: string;
  deadline: string; // YYYY-MM-DD
  statusHint: string;
  /** Canonical schema status derived from Status column */
  status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE" | "PENDING_VERIFICATION";
  progress: number;
  include: boolean;
};

export type ParsedImport = {
  kind: "minutes_and_actions" | "actions_only";
  discussion: string;
  actions: ParsedActionDraft[];
  warnings: string[];
};

function normalize(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function parseDueDate(raw: string, fallbackDays = 14): string {
  const t = raw.trim();
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // e.g. Friday, 18 Sep 2026 / 18 September 2026 / 18 Sep 2026
  const months: Record<string, string> = {
    jan: "01", january: "01",
    feb: "02", february: "02",
    mar: "03", march: "03",
    apr: "04", april: "04",
    may: "05",
    jun: "06", june: "06",
    jul: "07", july: "07",
    aug: "08", august: "08",
    sep: "09", sept: "09", september: "09",
    oct: "10", october: "10",
    nov: "11", november: "11",
    dec: "12", december: "12",
  };
  const m = t.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) {
    const mon = months[m[2].toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${m[1].padStart(2, "0")}`;
  }
  // "Immediately" / ongoing → +14 days from today
  const d = new Date();
  d.setDate(d.getDate() + fallbackDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Map free-text Status column values to schema status + progress.
 * Ongoing / Ongoing (50%) → IN_PROGRESS (+ optional %)
 * Complete / Completed → COMPLETED (100%)
 * Pending → OPEN (not started)
 * Overdue → OVERDUE
 */
export function mapImportStatus(raw: string): {
  status: ParsedActionDraft["status"];
  progress: number;
} {
  const s = (raw ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return { status: "OPEN", progress: 0 };

  // Extract percentage if present e.g. Ongoing (50%), 50% complete
  const pctMatch = s.match(/(\d{1,3})\s*%/);
  const pct = pctMatch ? Math.min(100, Math.max(0, Number(pctMatch[1]))) : null;

  if (/overdue/.test(s)) {
    return { status: "OVERDUE", progress: pct ?? 0 };
  }
  if (/complete|completed|done|closed/.test(s)) {
    return { status: "COMPLETED", progress: 100 };
  }
  if (/pending verification|awaiting verification/.test(s)) {
    return { status: "PENDING_VERIFICATION", progress: pct ?? 100 };
  }
  if (/in progress|ongoing|in-progress|started|working/.test(s)) {
    return { status: "IN_PROGRESS", progress: pct ?? 25 };
  }
  if (/pending|not started|to do|todo|open/.test(s)) {
    return { status: "OPEN", progress: 0 };
  }
  // Default: treat unknown as open unless a % suggests work started
  if (pct != null && pct > 0 && pct < 100) {
    return { status: "IN_PROGRESS", progress: pct };
  }
  if (pct === 100) return { status: "COMPLETED", progress: 100 };
  return { status: "OPEN", progress: 0 };
}

function looksLikeActionHeader(line: string): boolean {
  const l = line.toLowerCase();
  return (
    (l.includes("decision") && l.includes("action")) ||
    (l.includes("no.") && l.includes("owner") && l.includes("due")) ||
    (l.includes("decision / action") && l.includes("owner"))
  );
}

/**
 * Extract numbered action rows from tracker / minutes section 7 tables.
 * Pattern: leading number, action text, owner names, due date, optional status.
 */
export function parseActionsFromText(text: string): ParsedActionDraft[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const actions: ParsedActionDraft[] = [];
  let inTracker = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (looksLikeActionHeader(line) || /summary of decisions/i.test(line) || /action tracker/i.test(line)) {
      inTracker = true;
      continue;
    }
    if (/^sign-off|^document control|^date of next meeting/i.test(line)) {
      inTracker = false;
    }

    // Numbered row start: "1", "1.", "1)" at beginning
    const num = line.match(/^(\d{1,2})[.)]?\s+(.*)$/);
    if (!num) continue;
    if (!inTracker && !/complete|start|update|share|merge|review|revise|tag|validate|submit/i.test(line)) {
      // still accept clear action-like numbered lines
      if (line.length < 40) continue;
    }

    let body = num[2];
    // Sometimes columns are tab-separated
    const parts = body.split(/\t+/).map(normalize).filter(Boolean);
    let title = body;
    let ownerHint = "";
    let deadlineRaw = "";
    let statusHint = "";

    if (parts.length >= 3) {
      title = parts[0];
      ownerHint = parts[1] ?? "";
      deadlineRaw = parts[2] ?? "";
      statusHint = parts[3] ?? "";
    } else {
      // Try to peel status from the end
      const statusMatch = body.match(/\b(Completed|Complete|Ongoing|In Progress|Pending|In Progress \(.*?\)|Merger completed.*?)\s*$/i);
      if (statusMatch) {
        statusHint = statusMatch[1];
        body = body.slice(0, statusMatch.index).trim();
      }
      // Date near end
      const dateMatch = body.match(
        /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}|Immediately|Ongoing|By COB.*?|Friday,?\s+\d{1,2}\s+\w+\s+\d{4}|Current list.*)/i,
      );
      if (dateMatch && dateMatch.index != null) {
        deadlineRaw = dateMatch[1];
        // owner often sits just before the date
        const before = body.slice(0, dateMatch.index).trim();
        // Split owner: last segment after a long title — heuristic using common separators
        const ownerSplit = before.match(/^(.*?)[\s—-]+([A-Z][A-Za-z./\s,&]+(?:Parry|Edward|Patrick|Abigail|Justus|Sharon|Dorcas|Nana|Samuel|Fred|HCM|Committee|NSPs|Team)[A-Za-z./\s,&]*)$/);
        if (ownerSplit) {
          title = normalize(ownerSplit[1]);
          ownerHint = normalize(ownerSplit[2]);
        } else {
          title = normalize(before);
        }
      } else {
        title = normalize(body);
      }
    }

    title = normalize(title).replace(/^\*+|\*+$/g, "");
    if (title.length < 12) continue;

    const mapped = mapImportStatus(statusHint);
    actions.push({
      key: `a-${num[1]}-${actions.length}`,
      title,
      ownerHint: normalize(ownerHint),
      deadline: parseDueDate(deadlineRaw || "Immediately"),
      statusHint: normalize(statusHint),
      status: mapped.status,
      progress: mapped.progress,
      include: true,
    });
  }

  // De-dupe by title
  const seen = new Set<string>();
  return actions.filter((a) => {
    const k = a.title.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function parseDiscussionFromMinutes(text: string): string {
  const lines = text.split(/\r?\n/);
  const chunks: string[] = [];
  let capture = false;
  for (const line of lines) {
    if (/^3\.\s*OPENING|^4\.\s*AGENDA|^5\.\s*AGENDA ITEMS|^OPENING|^AGENDA FOR THE MEETING/i.test(line.trim())) {
      capture = true;
    }
    if (/^6\.\s*ANY OTHER BUSINESS|^7\.\s*SUMMARY|^SIGN-OFF|^DOCUMENT CONTROL/i.test(line.trim())) {
      capture = false;
    }
    if (capture) chunks.push(line);
  }
  const discussion = chunks.join("\n").trim();
  if (discussion.length > 40) return discussion;
  // Fallback: first 2000 chars excluding header noise
  return text.slice(0, 2000);
}

export function parseImportDocument(text: string, mode: "minutes_and_actions" | "actions_only"): ParsedImport {
  const warnings: string[] = [];
  const actions = parseActionsFromText(text);
  if (actions.length === 0) {
    warnings.push("No action rows could be detected. You can add them manually in the preview or try a clearer table export.");
  }
  const discussion =
    mode === "minutes_and_actions" ? parseDiscussionFromMinutes(text) : "";
  if (mode === "minutes_and_actions" && discussion.length < 40) {
    warnings.push("Could not auto-detect discussion text — please review and edit before uploading.");
  }
  return { kind: mode, discussion, actions, warnings };
}

/** Split an Owner cell into individual name tokens. */
export function splitOwnerNames(ownerHint: string): string[] {
  if (!ownerHint?.trim()) return [];
  return ownerHint
    .split(/[,;/|&\n\r]+|\band\b/i)
    .map((s) => s.replace(/^\s*[-•*]+\s*/, "").trim())
    .filter((s) => s.length > 1);
}

function scoreNameMatch(candidate: string, fullName: string): number {
  const c = candidate.toLowerCase().replace(/\s+/g, " ").trim();
  const n = fullName.toLowerCase().replace(/\s+/g, " ").trim();
  if (!c || !n) return 0;
  if (n === c) return 100;
  if (n.includes(c) || c.includes(n)) return 80;
  const cParts = c.split(" ").filter((p) => p.length > 1);
  const nParts = n.split(" ");
  let hits = 0;
  for (const p of cParts) {
    if (nParts.some((np) => np === p || np.startsWith(p) || p.startsWith(np))) hits += 1;
  }
  if (hits === 0) return 0;
  if (hits >= 2 || (cParts.length === 1 && hits === 1 && cParts[0].length > 3)) {
    return 40 + hits * 15;
  }
  return 20;
}

/** Best single-user match for one name token, or null. */
export function matchOwnerId(
  ownerHint: string,
  directory: { id: number; fullName: string }[],
): number | null {
  const result = matchOwnersFromHint(ownerHint, directory);
  return result.matched[0]?.id ?? null;
}

export type OwnerMatchResult = {
  /** Distinct users resolved from the Owner cell */
  matched: { id: number; fullName: string }[];
  /** Name fragments from the file that could not be matched */
  unmatched: string[];
};

/**
 * Map an Owner column value to system users.
 * Supports multiple names separated by comma, semicolon, slash, newline, &, or "and".
 */
export function matchOwnersFromHint(
  ownerHint: string,
  directory: { id: number; fullName: string }[],
): OwnerMatchResult {
  const tokens = splitOwnerNames(ownerHint);
  if (tokens.length === 0 || directory.length === 0) {
    return { matched: [], unmatched: tokens };
  }

  const matched: { id: number; fullName: string }[] = [];
  const unmatched: string[] = [];
  const usedIds = new Set<number>();

  for (const token of tokens) {
    let best: { id: number; fullName: string; score: number } | null = null;
    for (const u of directory) {
      if (usedIds.has(u.id)) continue;
      const score = scoreNameMatch(token, u.fullName);
      if (score >= 40 && (!best || score > best.score)) {
        best = { id: u.id, fullName: u.fullName, score };
      }
    }
    if (best) {
      usedIds.add(best.id);
      matched.push({ id: best.id, fullName: best.fullName });
    } else {
      unmatched.push(token);
    }
  }

  return { matched, unmatched };
}

/** Convert structured DOCX/XLSX table rows into action drafts. */
export function parseActionsFromMappedTable(rows: MappedActionRow[]): ParsedActionDraft[] {
  const seen = new Set<string>();
  const out: ParsedActionDraft[] = [];
  rows.forEach((r, i) => {
    const title = r.title.replace(/^\*+|\*+$/g, "").trim();
    if (title.length < 5) return;
    const k = title.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    const mapped = mapImportStatus(r.statusHint);
    out.push({
      key: `tbl-${r.no || i + 1}-${i}`,
      title,
      ownerHint: r.ownerHint,
      deadline: parseDueDate(r.deadlineRaw || "Immediately"),
      statusHint: r.statusHint,
      status: mapped.status,
      progress: mapped.progress,
      include: true,
    });
  });
  return out;
}

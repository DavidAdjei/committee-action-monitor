/**
 * URL / filename helpers for Veracode CWE-80 (XSS via href/download).
 * Only allow http(s) links in the UI; reject javascript:, data:, etc.
 */

/** Returns a safe http(s) URL string, or null if the value is not safe to use in href. */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Sanitize a suggested download filename (no path segments or control chars). */
export function safeDownloadFilename(name: string | null | undefined, fallback = "download"): string {
  const base = (name ?? fallback).replace(/[/\\?%*:|"<>]/g, "_").replace(/\.\./g, "_").trim();
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 180);
  return cleaned || fallback;
}

/** Only trusted Teams join-link hosts are allowed for Teams meeting URLs. */
export function safeTeamsUrl(raw: string | null | undefined): string | null {
  const safe = safeHttpUrl(raw);
  if (!safe) return null;
  const u = new URL(safe);
  return u.protocol === "https:" &&
    (u.hostname === "teams.microsoft.com" || u.hostname === "teams.live.com") &&
    !u.username && !u.password ? u.href : null;
}

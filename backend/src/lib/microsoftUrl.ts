/** Enforce exact Microsoft endpoints before sending credentials or Graph bearer tokens. */
export function assertMicrosoftUrl(value: string, purpose: "token" | "graph" | "users"): void {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid Microsoft endpoint URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) {
    throw new Error("Untrusted Microsoft endpoint URL.");
  }
  if (purpose === "token") {
    if (url.hostname !== "login.microsoftonline.com" ||
        !/^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/oauth2\/v2\.0\/token$/i.test(url.pathname) || url.search) {
      throw new Error("Untrusted Microsoft token endpoint.");
    }
  } else if (url.hostname !== "graph.microsoft.com" ||
             !url.pathname.startsWith("/v1.0/") ||
             (purpose === "users" && url.pathname !== "/v1.0/users")) {
    throw new Error("Untrusted Microsoft Graph endpoint.");
  }
}

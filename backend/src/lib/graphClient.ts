/**
 * Shared Microsoft Graph app-only (client credentials) client.
 * Used by directory sync and Teams online-meeting creation.
 *
 * Env (either prefix works):
 *   ENTRA_GRAPH_TENANT_ID / GRAPH_TENANT_ID
 *   ENTRA_GRAPH_CLIENT_ID  / GRAPH_CLIENT_ID
 *   ENTRA_GRAPH_CLIENT_SECRET / GRAPH_CLIENT_SECRET
 */

import { Errors } from "./http";

export function graphEnv(name: string, aliases: string[] = []): string | undefined {
  const keys = [name, ...aliases];
  for (const k of keys) {
    const v = process.env[k];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

export function isGraphAppConfigured(): boolean {
  return Boolean(
    graphEnv("ENTRA_GRAPH_TENANT_ID", ["GRAPH_TENANT_ID"]) &&
      graphEnv("ENTRA_GRAPH_CLIENT_ID", ["GRAPH_CLIENT_ID"]) &&
      graphEnv("ENTRA_GRAPH_CLIENT_SECRET", ["GRAPH_CLIENT_SECRET"]),
  );
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

/**
 * Acquire (and briefly cache) an app-only Graph access token.
 */
export async function getGraphAppToken(): Promise<string> {
  if (!isGraphAppConfigured()) {
    throw Errors.badRequest(
      "Microsoft Graph is not configured. Set ENTRA_GRAPH_TENANT_ID, ENTRA_GRAPH_CLIENT_ID, ENTRA_GRAPH_CLIENT_SECRET.",
    );
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.accessToken;
  }

  const tenant = graphEnv("ENTRA_GRAPH_TENANT_ID", ["GRAPH_TENANT_ID"])!;
  const clientId = graphEnv("ENTRA_GRAPH_CLIENT_ID", ["GRAPH_CLIENT_ID"])!;
  const clientSecret = graphEnv("ENTRA_GRAPH_CLIENT_SECRET", ["GRAPH_CLIENT_SECRET"])!;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw Errors.badRequest(`Graph token request failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw Errors.badRequest("Graph token response missing access_token.");

  const expiresInSec = json.expires_in ?? 3600;
  cachedToken = {
    accessToken: json.access_token,
    expiresAt: now + expiresInSec * 1000,
  };
  return json.access_token;
}

export async function graphFetch(
  path: string,
  init?: RequestInit & { accessToken?: string },
): Promise<Response> {
  const token = init?.accessToken ?? (await getGraphAppToken());
  const { accessToken: _a, ...rest } = init ?? {};
  const headers = new Headers(rest.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (rest.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`https://graph.microsoft.com/v1.0${path}`, { ...rest, headers });
}

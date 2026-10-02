/**
 * Microsoft Graph client — application (client credentials) and delegated (OBO / user token).
 *
 * Application (.default / OnlineMeetings.ReadWrite.All):
 *   Directory sync, email send, background/timer Teams meeting creation.
 *
 * Delegated (OnlineMeetings.ReadWrite):
 *   Interactive meeting create as the signed-in user (/me/onlineMeetings).
 *   Prefer On-Behalf-Of exchange of the API access token; optional direct Graph token header.
 *
 * Env:
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

let cachedAppToken: { accessToken: string; expiresAt: number } | null = null;

/**
 * Acquire (and briefly cache) an app-only Graph access token.
 * Uses application permissions (e.g. OnlineMeetings.ReadWrite.All, Mail.Send, User.Read.All).
 */
export async function getGraphAppToken(): Promise<string> {
  if (!isGraphAppConfigured()) {
    throw Errors.badRequest(
      "Microsoft Graph is not configured. Set ENTRA_GRAPH_TENANT_ID, ENTRA_GRAPH_CLIENT_ID, ENTRA_GRAPH_CLIENT_SECRET.",
    );
  }

  const now = Date.now();
  if (cachedAppToken && cachedAppToken.expiresAt > now + 60_000) {
    return cachedAppToken.accessToken;
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
  cachedAppToken = {
    accessToken: json.access_token,
    expiresAt: now + expiresInSec * 1000,
  };
  return json.access_token;
}

/**
 * On-Behalf-Of: exchange the user's API access token for a Graph token
 * with delegated OnlineMeetings.ReadWrite (and offline_access if granted).
 *
 * Requires:
 *   - API app registration is the same client (or confidential client) with client secret
 *   - API has delegated permission OnlineMeetings.ReadWrite on Microsoft Graph + admin consent
 *   - SPA requested an API scope that allows OBO (access_as_user)
 */
export async function getGraphDelegatedTokenViaObo(userAccessToken: string): Promise<string> {
  if (!isGraphAppConfigured()) {
    throw Errors.badRequest(
      "Microsoft Graph is not configured for delegated Teams (set ENTRA_GRAPH_* credentials).",
    );
  }
  if (!userAccessToken?.trim()) {
    throw Errors.badRequest("User access token is required for delegated Graph access.");
  }

  const tenant = graphEnv("ENTRA_GRAPH_TENANT_ID", ["GRAPH_TENANT_ID"])!;
  const clientId = graphEnv("ENTRA_GRAPH_CLIENT_ID", ["GRAPH_CLIENT_ID"])!;
  const clientSecret = graphEnv("ENTRA_GRAPH_CLIENT_SECRET", ["GRAPH_CLIENT_SECRET"])!;

  const scope =
    graphEnv("ENTRA_GRAPH_DELEGATED_SCOPES", ["GRAPH_DELEGATED_SCOPES"]) ||
    "https://graph.microsoft.com/OnlineMeetings.ReadWrite offline_access";

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: userAccessToken.trim(),
    requested_token_use: "on_behalf_of",
    scope,
  });

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw Errors.badRequest(
      `Graph OBO token exchange failed: ${res.status} ${t.slice(0, 300)}. ` +
        `Ensure the API app has delegated OnlineMeetings.ReadWrite and admin consent, ` +
        `and the SPA token is for this API (OBO).`,
    );
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw Errors.badRequest("Graph OBO response missing access_token.");
  }
  return json.access_token;
}

/**
 * Resolve a Graph access token for interactive (delegated) use.
 * 1. Explicit Graph token (X-Graph-Access-Token / body) if provided
 * 2. Else OBO exchange of the API bearer token
 */
export async function resolveDelegatedGraphToken(params: {
  apiAccessToken?: string | null;
  graphAccessToken?: string | null;
}): Promise<string> {
  if (params.graphAccessToken?.trim()) {
    return params.graphAccessToken.trim();
  }
  if (params.apiAccessToken?.trim()) {
    return getGraphDelegatedTokenViaObo(params.apiAccessToken);
  }
  throw Errors.badRequest(
    "Delegated Teams requires a user session: send Authorization Bearer (API token for OBO) " +
      "or X-Graph-Access-Token with OnlineMeetings.ReadWrite.",
  );
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

/**
 * Validates Microsoft Entra ID access tokens sent as Authorization: Bearer.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type EntraClaims = {
  oid: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  tid?: string;
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksForTenant(tenantId: string) {
  let set = jwksCache.get(tenantId);
  if (!set) {
    set = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`),
    );
    jwksCache.set(tenantId, set);
  }
  return set;
}

export function isEntraJwtConfigured(): boolean {
  return Boolean(process.env.ENTRA_TENANT_ID && process.env.ENTRA_API_AUDIENCE);
}

/**
 * Build accepted audience list.
 * Tokens often use the API app's client GUID as `aud`, while config may use
 * Application ID URI (`api://{guid}`). Accept both forms for each configured value.
 */
function acceptedAudiences(raw: string): string[] {
  const out = new Set<string>();
  for (const part of raw.split(",").map((a) => a.trim()).filter(Boolean)) {
    out.add(part);
    if (part.startsWith("api://")) {
      const rest = part.slice("api://".length);
      // api://{guid} or api://{guid}/...
      const guid = rest.split("/")[0];
      if (guid) out.add(guid);
    } else if (/^[0-9a-fA-F-]{36}$/.test(part)) {
      out.add(`api://${part}`);
    }
  }
  return [...out];
}

/**
 * Verify a Bearer access token issued for this API.
 */
export async function verifyEntraAccessToken(token: string): Promise<EntraClaims | null> {
  const tenantId = process.env.ENTRA_TENANT_ID;
  const audienceEnv = process.env.ENTRA_API_AUDIENCE;
  if (!tenantId || !audienceEnv) return null;

  const audiences = acceptedAudiences(audienceEnv);
  const issuerV2 = `https://login.microsoftonline.com/${tenantId}/v2.0`;
  const issuerV1 = `https://sts.windows.net/${tenantId}/`;

  try {
    const { payload } = await jwtVerify(token, jwksForTenant(tenantId), {
      audience: audiences,
      issuer: [issuerV2, issuerV1],
      clockTolerance: 60,
    });
    return claimsFromPayload(payload);
  } catch {
    try {
      const { payload } = await jwtVerify(token, jwksForTenant(tenantId), {
        audience: audiences,
        clockTolerance: 60,
      });
      const tid = typeof payload.tid === "string" ? payload.tid : undefined;
      if (tid && tid !== tenantId) return null;
      return claimsFromPayload(payload);
    } catch (err) {
      console.warn(
        "[entraJwt] token verification failed:",
        err instanceof Error ? err.message : err,
        "| accepted audiences:",
        audiences.join(", "),
      );
      return null;
    }
  }
}

function claimsFromPayload(payload: JWTPayload): EntraClaims | null {
  const oid =
    (typeof payload.oid === "string" && payload.oid) ||
    (typeof payload.sub === "string" && payload.sub) ||
    "";
  if (!oid) return null;

  const email =
    (typeof payload.email === "string" && payload.email) ||
    (typeof payload.preferred_username === "string" && payload.preferred_username) ||
    (typeof payload.upn === "string" && payload.upn) ||
    undefined;

  return {
    oid,
    email: email?.toLowerCase(),
    name: typeof payload.name === "string" ? payload.name : undefined,
    preferred_username:
      typeof payload.preferred_username === "string" ? payload.preferred_username : undefined,
    tid: typeof payload.tid === "string" ? payload.tid : undefined,
  };
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1].trim() : null;
}

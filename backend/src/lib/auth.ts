import { HttpRequest } from "@azure/functions";
import { prisma } from "./prisma";
import { Errors } from "./http";
import type { User } from "@prisma/client";

/**
 * Identity resolution.
 *
 * Production path: Azure Functions is fronted by Azure App Service
 * Authentication (Easy Auth) configured for Microsoft Entra ID, or by APIM
 * validating the Entra-issued JWT. Either way, the platform injects
 * `x-ms-client-principal` — a base64-encoded JSON blob of verified claims.
 * We only ever *read* claims from this platform-injected header; the
 * application never validates a raw bearer token itself, and it never
 * trusts anything the browser could forge (a corresponding capability is
 * enforced by the platform, not by this code).
 *
 * Dev path: when DEV_AUTH_ENABLED=true (local development / demo only,
 * never set in production app settings), a `x-dev-user-id` header selects a
 * seeded local user directly. See functions/devAuth.ts for the matching
 * sign-in-picker endpoint. This mirrors the prototype's "choose a role"
 * screen, but the switch is between *real seeded identities* — permissions
 * are still resolved from committee_memberships on the server, never from
 * anything the client sends.
 */

interface ClientPrincipalClaim {
  typ: string;
  val: string;
}

interface ClientPrincipal {
  auth_typ: string;
  claims: ClientPrincipalClaim[];
  name_typ: string;
  role_typ: string;
}

function claim(principal: ClientPrincipal, type: string): string | undefined {
  return principal.claims.find((c) => c.typ === type)?.val;
}

async function resolveFromEasyAuth(req: HttpRequest): Promise<User | null> {
  const header = req.headers.get("x-ms-client-principal");
  if (!header) return null;

  const decoded = Buffer.from(header, "base64").toString("utf8");
  const principal = JSON.parse(decoded) as ClientPrincipal;

  const objectId =
    claim(principal, "http://schemas.microsoft.com/identity/claims/objectidentifier") ??
    claim(principal, "oid");
  const email =
    claim(principal, "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress") ??
    claim(principal, "preferred_username") ??
    claim(principal, "email");

  if (!objectId) return null;

  let user = await prisma.user.findUnique({ where: { entraObjectId: objectId } });

  // First sign-in for a directory account we already know by email (e.g.
  // seeded ahead of go-live): link the Entra object id so future look-ups
  // no longer depend on email at all.
  if (!user && email) {
    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail && !byEmail.entraObjectId) {
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: { entraObjectId: objectId },
      });
    }
  }

  return user;
}

async function resolveFromDevHeader(req: HttpRequest): Promise<User | null> {
  if (process.env.DEV_AUTH_ENABLED !== "true") return null;
  const idHeader = req.headers.get("x-dev-user-id") ?? req.query.get("devUserId");
  if (!idHeader) return null;
  const id = Number(idHeader);
  if (!Number.isInteger(id)) return null;
  return prisma.user.findUnique({ where: { id } });
}

/** Resolve the authenticated local user, or throw 401. */
export async function requireUser(req: HttpRequest): Promise<User> {
  const user = (await resolveFromEasyAuth(req)) ?? (await resolveFromDevHeader(req));
  if (!user || !user.active) throw Errors.unauthenticated();
  return user;
}

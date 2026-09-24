import { HttpRequest } from "@azure/functions";
import { prisma } from "./prisma";
import { Errors } from "./http";
import type { User } from "@prisma/client";
import {
  extractBearerToken,
  isEntraJwtConfigured,
  verifyEntraAccessToken,
} from "./entraJwt";

/**
 * Identity resolution (priority order):
 *
 * 1. Azure Easy Auth — `x-ms-client-principal` (App Service / Functions host)
 * 2. Bearer JWT — MSAL access token validated against Entra JWKS
 *    (local SPA or any host without Easy Auth)
 * 3. Dev header — `x-dev-user-id` when DEV_AUTH_ENABLED=true only
 *
 * Users must exist (or be auto-provisioned) in the local User table.
 * Committee roles still come only from committee_memberships / flags.
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

async function findOrLinkUser(params: {
  objectId: string;
  email?: string;
  fullName?: string;
}): Promise<User | null> {
  const { objectId, email, fullName } = params;

  let user = await prisma.user.findUnique({ where: { entraObjectId: objectId } });
  if (user) return user.active ? user : null;

  if (email) {
    const normalized = email.toLowerCase().trim();
    // Case-insensitive match (DB may store mixed-case emails from seed)
    let byEmail = await prisma.user.findUnique({ where: { email: normalized } });
    if (!byEmail) {
      byEmail = await prisma.user.findFirst({
        where: { email: { equals: normalized } },
      });
    }
    if (!byEmail) {
      const rows = await prisma.$queryRaw<
        { id: number }[]
      >`SELECT id FROM users WHERE LOWER(email) = ${normalized} LIMIT 1`;
      if (rows[0]) {
        byEmail = await prisma.user.findUnique({ where: { id: rows[0].id } });
      }
    }
    if (byEmail) {
      if (!byEmail.active) return null;
      if (!byEmail.entraObjectId) {
        return prisma.user.update({
          where: { id: byEmail.id },
          data: { entraObjectId: objectId },
        });
      }
      // Already linked to a different oid — still allow login by email match
      return byEmail;
    }
  }

  // Optional first-login create (directory sync is preferred for bank rollouts)
  if (process.env.ENTRA_AUTO_PROVISION === "true" && email) {
    return prisma.user.create({
      data: {
        entraObjectId: objectId,
        email: email.toLowerCase(),
        fullName: fullName || email.split("@")[0],
        active: true,
        isCentralCommittee: false,
        isAdmin: false,
      },
    });
  }

  return null;
}

async function resolveFromEasyAuth(req: HttpRequest): Promise<User | null> {
  const header = req.headers.get("x-ms-client-principal");
  if (!header) return null;

  try {
    const decoded = Buffer.from(header, "base64").toString("utf8");
    const principal = JSON.parse(decoded) as ClientPrincipal;

    const objectId =
      claim(principal, "http://schemas.microsoft.com/identity/claims/objectidentifier") ??
      claim(principal, "oid");
    const email =
      claim(principal, "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress") ??
      claim(principal, "preferred_username") ??
      claim(principal, "email");
    const name =
      claim(principal, "name") ??
      claim(principal, "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name");

    if (!objectId) return null;
    return findOrLinkUser({ objectId, email, fullName: name });
  } catch {
    return null;
  }
}

async function resolveFromBearerJwt(req: HttpRequest): Promise<User | null> {
  if (!isEntraJwtConfigured()) return null;
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return null;

  const claims = await verifyEntraAccessToken(token);
  if (!claims) return null;

  return findOrLinkUser({
    objectId: claims.oid,
    email: claims.email,
    fullName: claims.name,
  });
}

async function resolveFromDevHeader(req: HttpRequest): Promise<User | null> {
  if (process.env.DEV_AUTH_ENABLED !== "true") return null;
  const idHeader =
    req.headers.get("x-dev-user-id") ?? req.query.get("devUserId") ?? undefined;
  if (!idHeader) return null;
  const id = Number(idHeader);
  if (!Number.isInteger(id)) return null;
  const user = await prisma.user.findUnique({ where: { id } });
  return user && user.active ? user : null;
}

export async function requireUser(req: HttpRequest): Promise<User> {
  const user =
    (await resolveFromEasyAuth(req)) ??
    (await resolveFromBearerJwt(req)) ??
    (await resolveFromDevHeader(req));

  if (!user) {
    throw Errors.unauthenticated();
  }
  return user;
}

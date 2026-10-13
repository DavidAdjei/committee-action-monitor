import { HttpRequest } from "@azure/functions";
import { prisma } from "./prisma";
import { ApiError, Errors } from "./http";
import type { User } from "@prisma/client";
import {
  extractBearerToken,
  isEntraJwtConfigured,
  verifyEntraAccessToken,
} from "./entraJwt";
import { recordDenied, auditRow } from "../services/auditService";

/**
 * Identity resolution (production): Bearer JWT only.
 *
 * Email fallback when oid is not yet linked:
 * - Match active user by email and entraObjectId is null → link this oid (first login).
 * - Match active user already linked to a different oid → deny with clear error (HIGH-1).
 */

async function findOrLinkUser(params: {
  objectId: string;
  email?: string;
  fullName?: string;
}): Promise<User> {
  const { objectId, email, fullName } = params;

  const byOid = await prisma.user.findUnique({ where: { entraObjectId: objectId } });
  if (byOid) {
    if (!byOid.active) {
      throw new ApiError(
        403,
        "ACCOUNT_INACTIVE",
        "Your Committee Action Monitor account is inactive. Contact Cyber & Information Security to restore access.",
      );
    }
    return byOid;
  }

  if (email) {
    const normalized = email.toLowerCase().trim();
    let byEmail = await prisma.user.findUnique({ where: { email: normalized } });
    if (!byEmail) {
      byEmail = await prisma.user.findFirst({
        where: { email: { equals: normalized } },
      });
    }
    if (!byEmail) {
      const rows = await prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM users WHERE LOWER(email) = ${normalized} LIMIT 1`;
      if (rows[0]) {
        byEmail = await prisma.user.findUnique({ where: { id: rows[0].id } });
      }
    }

    if (byEmail) {
      if (!byEmail.active) {
        throw new ApiError(
          403,
          "ACCOUNT_INACTIVE",
          "Your Committee Action Monitor account is inactive. Contact Cyber & Information Security to restore access.",
        );
      }

      // First login: email known, Entra oid not yet stored → bind once.
      if (!byEmail.entraObjectId) {
        const linked = await prisma.user.update({
          where: { id: byEmail.id },
          data: { entraObjectId: objectId },
        });
        try {
          await prisma.auditEvent.create({
            data: auditRow({
              actorUserId: linked.id,
              action: "IDENTITY_LINKED",
              resourceType: "User",
              resourceId: linked.id,
              after: {
                entraObjectId: objectId,
                email: normalized,
                reason: "First sign-in linked Entra object id to existing user by email",
              },
              result: "SUCCESS",
            }),
          });
        } catch (err) {
          console.error("[auth] Failed to audit IDENTITY_LINKED", err);
        }
        return linked;
      }

      // Email already linked to a different Entra identity — do not silent re-link (HIGH-1).
      if (byEmail.entraObjectId !== objectId) {
        console.warn("[auth] IDENTITY_CONFLICT", {
          email: normalized,
          tokenOid: objectId,
          storedOid: byEmail.entraObjectId,
          userId: byEmail.id,
        });
        await recordDenied({
          actorUserId: byEmail.id,
          action: "IDENTITY_CONFLICT",
          resourceType: "User",
          resourceId: byEmail.id,
          reason: `Sign-in denied: email ${normalized} is linked to a different Entra object id. Token oid=${objectId}, stored oid=${byEmail.entraObjectId}.`,
        });
        throw new ApiError(
          403,
          "IDENTITY_CONFLICT",
          "Your Microsoft account does not match the identity already linked to this email in Committee Action Monitor. An administrator must resolve the conflict before you can sign in. Contact Cyber & Information Security.",
        );
      }

      return byEmail;
    }
  }

  // Optional first-login create (directory sync is preferred)
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

  const who = email ? ` (${email})` : "";
  throw new ApiError(
    403,
    "ACCOUNT_NOT_PROVISIONED",
    `Your Microsoft account${who} is signed in, but it is not set up in Committee Action Monitor yet. Ask an administrator to run directory sync or add your account, then try again.`,
  );
}

/**
 * Resolve the signed-in user from an Authorization: Bearer <Entra access token>.
 * Throws ApiError with a user-facing message on failure.
 */
export async function resolveFromBearerJwt(req: HttpRequest): Promise<User> {
  if (!isEntraJwtConfigured()) {
    console.error(
      "[auth] ENTRA_TENANT_ID and ENTRA_API_AUDIENCE must be set for JWT authentication.",
    );
    throw new ApiError(
      503,
      "AUTH_NOT_CONFIGURED",
      "Sign-in is temporarily unavailable: the server is not configured for Microsoft authentication. Contact support.",
    );
  }

  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) {
    throw Errors.unauthenticated();
  }

  const claims = await verifyEntraAccessToken(token);
  if (!claims) {
    throw new ApiError(
      401,
      "TOKEN_INVALID",
      "Your sign-in session is invalid or has expired. Sign out and sign in with Microsoft again.",
    );
  }

  return findOrLinkUser({
    objectId: claims.oid,
    email: claims.email,
    fullName: claims.name,
  });
}

export async function requireUser(req: HttpRequest): Promise<User> {
  return resolveFromBearerJwt(req);
}

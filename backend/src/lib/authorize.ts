import { prisma } from "./prisma";
import { Errors } from "./http";
import type { User, CommitteeRole } from "@prisma/client";

export interface EffectiveCommitteeAccess {
  committeeId: number;
  role: CommitteeRole;
}

/** All active committee roles held by this user, freshly loaded from the DB. */
export async function loadMemberships(userId: number): Promise<EffectiveCommitteeAccess[]> {
  const memberships = await prisma.committeeMembership.findMany({
    where: { userId, active: true },
    select: { committeeId: true, role: true },
  });
  return memberships;
}

/** True if the user is the active Chairperson or Secretary of the committee. */
export async function isCommitteeOfficer(userId: number, committeeId: number): Promise<boolean> {
  const membership = await prisma.committeeMembership.findFirst({
    where: {
      userId,
      committeeId,
      active: true,
      role: { in: ["CHAIRPERSON", "SECRETARY"] },
    },
  });
  return membership !== null;
}

/** Throws 403 unless the user is the active Chairperson or Secretary of the committee. */
export async function requireCommitteeOfficer(user: User, committeeId: number): Promise<void> {
  if (isCentralMember(user)) {
    // Central Committee access is read-only for writes — sub-role does not
    // grant Chair/Secretary powers on a sub-committee.
  }
  const authorized = await isCommitteeOfficer(user.id, committeeId);
  if (!authorized) {
    throw Errors.forbidden("Only the committee's active Chairperson or Secretary may do this.");
  }
}

/** True if the user can view the committee: Central Committee (bank-wide) or an active member. */
export async function canViewCommittee(user: User, committeeId: number): Promise<boolean> {
  if (isCentralMember(user)) return true;
  const membership = await prisma.committeeMembership.findFirst({
    where: { userId: user.id, committeeId, active: true },
  });
  return membership !== null;
}

export async function requireViewCommittee(user: User, committeeId: number): Promise<void> {
  const allowed = await canViewCommittee(user, committeeId);
  if (!allowed) throw Errors.forbidden("You do not have access to this committee.");
}

/**
 * View an action point: committee members / Central Committee, OR the primary
 * owner / any ACTION_OWNER stakeholder (owners may sit outside the committee).
 */
export async function canViewAction(
  user: User,
  action: { id: number; committeeId: number; ownerId: number },
): Promise<boolean> {
  if (await canViewCommittee(user, action.committeeId)) return true;
  if (action.ownerId === user.id) return true;
  const asOwner = await prisma.actionStakeholder.findFirst({
    where: {
      actionPointId: action.id,
      userId: user.id,
      stakeholderType: "ACTION_OWNER",
    },
  });
  return asOwner !== null;
}

export async function requireViewAction(
  user: User,
  action: { id: number; committeeId: number; ownerId: number },
): Promise<void> {
  const allowed = await canViewAction(user, action);
  if (!allowed) {
    throw Errors.forbidden("You do not have access to this action point.");
  }
}

type UserWithCentral = User & { centralRole?: "MEMBER" | "ADMINISTRATOR" | null };

function centralRoleOf(user: User): "MEMBER" | "ADMINISTRATOR" | null {
  const u = user as UserWithCentral;
  if (u.centralRole === "MEMBER" || u.centralRole === "ADMINISTRATOR") return u.centralRole;
  if (user.isAdmin) return "ADMINISTRATOR";
  if (user.isCentralCommittee) return "MEMBER";
  return null;
}

/** Central Committee member (any sub-role). All Central members share equal oversight rights. */
export function isCentralMember(user: User): boolean {
  return centralRoleOf(user) !== null;
}

/** Central Committee Administrator sub-role only (create committees, set chairs, etc.). */
export function isCentralAdministrator(user: User): boolean {
  return centralRoleOf(user) === "ADMINISTRATOR";
}

export async function requireAdmin(user: User): Promise<void> {
  if (!isCentralAdministrator(user)) {
    throw Errors.forbidden("Only a Central Committee Administrator may do this.");
  }
}

export async function requireCentralCommittee(user: User): Promise<void> {
  if (!isCentralMember(user)) {
    throw Errors.forbidden("Only Central Committee members may do this.");
  }
}

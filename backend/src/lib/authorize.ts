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

/**
 * Platform administrator (User.isAdmin) — full write access across the product.
 * Distinct from Central Committee Administrator (governance only).
 */
export function isPlatformAdmin(user: User): boolean {
  return Boolean(user.isAdmin);
}

type UserWithCentral = User & { centralRole?: "MEMBER" | "ADMINISTRATOR" | null };

/**
 * Central Committee role only — never derived from isAdmin.
 * - MEMBER: bank-wide view + action comments
 * - ADMINISTRATOR: create committees, set chairs/secretaries/reps + MEMBER rights
 */
export function centralRoleOf(user: User): "MEMBER" | "ADMINISTRATOR" | null {
  const u = user as UserWithCentral;
  if (u.centralRole === "MEMBER" || u.centralRole === "ADMINISTRATOR") return u.centralRole;
  // Legacy flag without centralRole column value
  if (user.isCentralCommittee) return "MEMBER";
  return null;
}

/** Any Central Committee membership (member or administrator). */
export function isCentralMember(user: User): boolean {
  return centralRoleOf(user) !== null || Boolean(user.isCentralCommittee);
}

/** Central Committee Administrator — governance rights, not full platform admin. */
export function isCentralAdministrator(user: User): boolean {
  return centralRoleOf(user) === "ADMINISTRATOR";
}

/**
 * Officer writes (meetings, minutes, actions, verification):
 * platform admin, or active Chair/Secretary of that committee.
 * Central administrators are view-only unless they hold an officer seat.
 */
export async function requireCommitteeOfficer(user: User, committeeId: number): Promise<void> {
  if (isPlatformAdmin(user)) return;
  const authorized = await isCommitteeOfficer(user.id, committeeId);
  if (!authorized) {
    throw Errors.forbidden("Only the committee's active Chairperson or Secretary may do this.");
  }
}

/** View a committee: platform admin, any Central member, or active committee member. */
export async function canViewCommittee(user: User, committeeId: number): Promise<boolean> {
  if (isPlatformAdmin(user)) return true;
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
 * View an action point: committee access, primary owner, or ACTION_OWNER stakeholder.
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

/** Create committees, set chairs/secretaries/central reps. */
export function canGovernCommittees(user: User): boolean {
  return isPlatformAdmin(user) || isCentralAdministrator(user);
}

export async function requireCentralAdministrator(user: User): Promise<void> {
  if (!canGovernCommittees(user)) {
    throw Errors.forbidden(
      "Only a Central Committee Administrator (or platform administrator) may do this.",
    );
  }
}

/** Platform-only operations (directory sync, system tools). */
export async function requirePlatformAdmin(user: User): Promise<void> {
  if (!isPlatformAdmin(user)) {
    throw Errors.forbidden("Only a platform administrator may do this.");
  }
}

/**
 * @deprecated Prefer requireCentralAdministrator or requirePlatformAdmin.
 * Kept for call sites that meant Central governance (create committee, etc.).
 */
export async function requireAdmin(user: User): Promise<void> {
  return requireCentralAdministrator(user);
}

export async function requireCentralCommittee(user: User): Promise<void> {
  if (!isCentralMember(user) && !isPlatformAdmin(user)) {
    throw Errors.forbidden("Only Central Committee members may do this.");
  }
}

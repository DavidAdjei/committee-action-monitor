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
  if (user.isCentralCommittee) {
    // Central Committee Member access is explicitly read-only — being a
    // Central member is never sufficient authority to write, even here.
  }
  const authorized = await isCommitteeOfficer(user.id, committeeId);
  if (!authorized) {
    throw Errors.forbidden("Only the committee's active Chairperson or Secretary may do this.");
  }
}

/** True if the user can view the committee: Central Committee (bank-wide) or an active member. */
export async function canViewCommittee(user: User, committeeId: number): Promise<boolean> {
  if (user.isCentralCommittee) return true;
  const membership = await prisma.committeeMembership.findFirst({
    where: { userId: user.id, committeeId, active: true },
  });
  return membership !== null;
}

export async function requireViewCommittee(user: User, committeeId: number): Promise<void> {
  const allowed = await canViewCommittee(user, committeeId);
  if (!allowed) throw Errors.forbidden("You do not have access to this committee.");
}

export async function requireAdmin(user: User): Promise<void> {
  if (!user.isAdmin) {
    throw Errors.forbidden("Only a Central Committee Administrator may do this.");
  }
}

export async function requireCentralCommittee(user: User): Promise<void> {
  if (!user.isCentralCommittee && !user.isAdmin) {
    throw Errors.forbidden("Only Central Committee members or Administrators may do this.");
  }
}

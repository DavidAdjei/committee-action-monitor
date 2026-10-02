import type { CommitteeRole, Me } from "@/types";

/**
 * Client-side authorization helpers (not a security boundary).
 *
 * Roles:
 * - **Platform admin** (`me.isAdmin`): full product access.
 * - **Central Committee Administrator** (`centralRole === "ADMINISTRATOR"`):
 *   create committees, set chairs/secretaries/central reps, comment on actions;
 *   view-only on committees unless also an officer/member with write rights.
 * - **Central Committee member**: bank-wide view + action comments.
 * - **Committee Chair/Secretary**: operational write on that committee.
 */

export type Capability =
  | "viewDashboard"
  | "viewAllCommittees"
  | "createCommittee"
  | "manageCommitteeMembership"
  | "createMeeting"
  | "createMinutes"
  | "createAction"
  | "updateActionStatus"
  | "verifyAction"
  | "viewAudit";

function roleInCommittee(me: Me | null | undefined, committeeId: number): CommitteeRole | null {
  if (!me) return null;
  const m = me.memberships?.find((x) => x.committeeId === committeeId);
  return m?.role ?? null;
}

/** Platform administrator — overall system access. */
export function isPlatformAdmin(me: Me | null | undefined): boolean {
  return Boolean(me?.isAdmin);
}

/** @deprecated use isPlatformAdmin */
export function isAdmin(me: Me | null | undefined): boolean {
  return isPlatformAdmin(me);
}

export function centralRoleOf(me: Me | null | undefined): "MEMBER" | "ADMINISTRATOR" | null {
  if (!me) return null;
  if (me.centralRole === "MEMBER" || me.centralRole === "ADMINISTRATOR") return me.centralRole;
  if (me.isCentralCommittee) return "MEMBER";
  return null;
}

export function isCentralViewer(me: Me | null | undefined): boolean {
  return Boolean(isPlatformAdmin(me) || centralRoleOf(me) != null || me?.isCentralCommittee);
}

export function isCentralAdministrator(me: Me | null | undefined): boolean {
  return centralRoleOf(me) === "ADMINISTRATOR" || isPlatformAdmin(me);
}

/** Chairperson or Secretary of the given committee */
export function isCommitteeOfficer(me: Me | null | undefined, committeeId: number): boolean {
  const role = roleInCommittee(me, committeeId);
  return role === "CHAIRPERSON" || role === "SECRETARY";
}

export function isCommitteeMember(me: Me | null | undefined, committeeId: number): boolean {
  return roleInCommittee(me, committeeId) != null;
}

export function canViewDashboard(me: Me | null | undefined): boolean {
  return isCentralViewer(me);
}

/** Central Administrator (or platform admin) may create committees. */
export function canCreateCommittee(me: Me | null | undefined): boolean {
  return isCentralAdministrator(me);
}

/** Set chair / secretary / central rep. */
export function canManageCommittee(me: Me | null | undefined, _committeeId?: number): boolean {
  return isCentralAdministrator(me);
}

/** Add ordinary members: officers of that committee, or platform admin. */
export function canManageMembers(me: Me | null | undefined, committeeId: number): boolean {
  if (!me) return false;
  if (isPlatformAdmin(me)) return true;
  return isCommitteeOfficer(me, committeeId);
}

export function canCreateMeeting(me: Me | null | undefined, committeeId: number): boolean {
  return isPlatformAdmin(me) || isCommitteeOfficer(me, committeeId);
}

export function canCreateMinutes(me: Me | null | undefined, committeeId: number): boolean {
  return isPlatformAdmin(me) || isCommitteeOfficer(me, committeeId);
}

export function canCreateAction(me: Me | null | undefined, committeeId: number): boolean {
  return isPlatformAdmin(me) || isCommitteeOfficer(me, committeeId);
}

/**
 * Progress / status updates: action owners (or platform admin).
 * Central roles do not get write access via this path.
 */
export function canUpdateAction(
  me: Me | null | undefined,
  opts: {
    committeeId: number;
    ownerId: number;
    ownerIds?: number[];
    status: string;
    isOfficerStakeholder?: boolean;
  },
): boolean {
  if (!me) return false;
  if (["COMPLETED", "CANCELLED"].includes(opts.status)) return false;
  if (isPlatformAdmin(me)) return true;
  if (opts.ownerIds && opts.ownerIds.length > 0) {
    return opts.ownerIds.includes(me.id);
  }
  return opts.ownerId === me.id;
}

/** Officers may cancel or structurally edit; platform admin may as well. */
export function canModifyAction(me: Me | null | undefined, committeeId: number): boolean {
  return isCommitteeOfficer(me, committeeId) || isPlatformAdmin(me);
}

export function canCancelAction(me: Me | null | undefined, committeeId: number, status: string): boolean {
  if (["COMPLETED", "CANCELLED"].includes(status)) return false;
  return canModifyAction(me, committeeId);
}

/** Only Chair/Secretary (or platform admin) may verify evidence */
export function canVerifyAction(
  me: Me | null | undefined,
  opts: { committeeId: number; status: string; isOfficerStakeholder?: boolean },
): boolean {
  if (!me) return false;
  if (opts.status !== "PENDING_VERIFICATION") return false;
  if (isPlatformAdmin(me)) return true;
  if (isCommitteeOfficer(me, opts.committeeId)) return true;
  if (opts.isOfficerStakeholder) return true;
  return false;
}

/** Audit: officers, central viewers, platform admin */
export function canViewAudit(me: Me | null | undefined, committeeId?: number): boolean {
  if (!me) return false;
  if (isPlatformAdmin(me) || isCentralViewer(me)) return true;
  if (committeeId != null && isCommitteeOfficer(me, committeeId)) return true;
  return false;
}

/** Directory sync and system tools — platform admin only */
export function canSyncDirectory(me: Me | null | undefined): boolean {
  return isPlatformAdmin(me);
}

export function assertCan(
  allowed: boolean,
  message = "You do not have permission to perform this action.",
): void {
  if (!allowed) {
    throw new Error(message);
  }
}

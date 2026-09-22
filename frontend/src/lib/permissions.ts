import type { CommitteeRole, Me } from "@/types";

/**
 * Client-side authorization helpers.
 * UI visibility is not a security control — the server must re-check every write.
 * These helpers keep the UI consistent with the permission matrix and fail closed
 * when membership data is missing.
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

export function isCentralViewer(me: Me | null | undefined): boolean {
  return Boolean(me?.isCentralCommittee || me?.isAdmin);
}

export function isAdmin(me: Me | null | undefined): boolean {
  return Boolean(me?.isAdmin);
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

export function canCreateCommittee(me: Me | null | undefined): boolean {
  // Docs: only a distinct Central Committee Administrator may create committees
  return isAdmin(me);
}

export function canManageCommittee(me: Me | null | undefined, _committeeId?: number): boolean {
  // Bank-wide governance (create committees, global admin tools)
  return Boolean(me?.isAdmin || me?.isCentralCommittee);
}

/** Chairperson/Secretary (or admin) may add members and assign roles. */
export function canManageMembers(me: Me | null | undefined, committeeId: number): boolean {
  if (!me) return false;
  if (me.isAdmin) return true;
  return isCommitteeOfficer(me, committeeId);
}

export function canCreateMeeting(me: Me | null | undefined, committeeId: number): boolean {
  return isCommitteeOfficer(me, committeeId);
}

export function canCreateMinutes(me: Me | null | undefined, committeeId: number): boolean {
  return isCommitteeOfficer(me, committeeId);
}

export function canCreateAction(me: Me | null | undefined, committeeId: number): boolean {
  return isCommitteeOfficer(me, committeeId);
}

/**
 * Progress / status updates (including completion with evidence): action owner only.
 * Terminal statuses cannot be updated this way.
 */
export function canUpdateAction(
  me: Me | null | undefined,
  opts: {
    committeeId: number;
    ownerId: number;
    /** Any co-owner may update progress when provided */
    ownerIds?: number[];
    status: string;
    isOfficerStakeholder?: boolean;
  },
): boolean {
  if (!me) return false;
  if (["COMPLETED", "CANCELLED"].includes(opts.status)) return false;
  if (opts.ownerIds && opts.ownerIds.length > 0) {
    return opts.ownerIds.includes(me.id);
  }
  return opts.ownerId === me.id;
}

/** Officers may cancel or structurally edit (title, owner, deadline). */
export function canModifyAction(me: Me | null | undefined, committeeId: number): boolean {
  return isCommitteeOfficer(me, committeeId) || Boolean(me?.isAdmin);
}

export function canCancelAction(me: Me | null | undefined, committeeId: number, status: string): boolean {
  if (["COMPLETED", "CANCELLED"].includes(status)) return false;
  return canModifyAction(me, committeeId);
}

/** Only Chair/Secretary may verify evidence */
export function canVerifyAction(
  me: Me | null | undefined,
  opts: { committeeId: number; status: string; isOfficerStakeholder?: boolean },
): boolean {
  if (!me) return false;
  if (opts.status !== "PENDING_VERIFICATION") return false;
  if (isCommitteeOfficer(me, opts.committeeId)) return true;
  if (opts.isOfficerStakeholder) return true;
  return false;
}

/** Audit trail visible to officers, central viewers, and admins */
export function canViewAudit(me: Me | null | undefined, committeeId?: number): boolean {
  if (!me) return false;
  if (me.isAdmin || me.isCentralCommittee) return true;
  if (committeeId != null && isCommitteeOfficer(me, committeeId)) return true;
  return false;
}

export function assertCan(
  allowed: boolean,
  message = "You do not have permission to perform this action.",
): void {
  if (!allowed) {
    throw new Error(message);
  }
}

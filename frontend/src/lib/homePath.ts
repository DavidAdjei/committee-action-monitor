import type { Me } from "@/types";

/**
 * Where to send the user after sign-in (and for unknown routes).
 * - Platform admin / Central → bank-wide dashboard
 * - Single committee membership → that workspace
 * - Multiple memberships → committees list
 * - Owner-only / no memberships → my action points
 */
export function homePathFor(me: Me | null | undefined): string {
  if (!me) return "/signin";
  if (me.isAdmin || me.isCentralCommittee) return "/dashboard";
  const memberships = me.memberships ?? [];
  if (memberships.length === 1) {
    const id = memberships[0].committeeId;
    if (id) return `/committees/${id}`;
  }
  if (memberships.length > 1) return "/committees";
  return "/actions";
}

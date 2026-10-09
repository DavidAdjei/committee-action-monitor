/**
 * Pure rules for how pending EMAIL notifications are batched into sends.
 * Kept separate from Graph I/O so unit tests can cover recipient policy without a DB.
 */

export type PendingEmailRow = {
  id: number;
  recipientId: number;
  notificationType: string;
  actionPointId: number | null;
};

/**
 * Build a batch key for an EMAIL outbox row.
 * - CREATED: one email per recipient + meeting (digest of many new actions)
 * - Other types: one email per type + action (all stakeholders share To:)
 */
export function emailBatchKey(
  n: PendingEmailRow,
  actionMeetingId: Map<number, number | null | undefined>,
): string {
  if (n.notificationType === "CREATED" && n.actionPointId != null) {
    const meetingId = actionMeetingId.get(n.actionPointId) ?? "none";
    return `CREATED::recipient:${n.recipientId}::meeting:${meetingId}`;
  }
  return `${n.notificationType}::action:${n.actionPointId ?? "none"}`;
}

/** Group rows by batch key (stable insertion order per key). */
export function groupEmailRows(
  rows: PendingEmailRow[],
  actionMeetingId: Map<number, number | null | undefined>,
): Map<string, PendingEmailRow[]> {
  const groups = new Map<string, PendingEmailRow[]>();
  for (const n of rows) {
    const key = emailBatchKey(n, actionMeetingId);
    const list = groups.get(key) ?? [];
    list.push(n);
    groups.set(key, list);
  }
  return groups;
}

/**
 * Who should receive EMAIL for action CREATED / DAILY / OVERDUE:
 * owners only (in-app may still go to all stakeholders).
 */
export function emailRecipientsForOwnerFocusedEvent(params: {
  ownerIds: number[];
  primaryOwnerId: number;
}): number[] {
  const ids = params.ownerIds.length ? params.ownerIds : [params.primaryOwnerId];
  return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
}

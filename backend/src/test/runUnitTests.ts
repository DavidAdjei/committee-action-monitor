/**
 * Lightweight unit tests (no test framework dependency).
 * Run: npm test
 */
import assert from "assert";
import type { User } from "@prisma/client";
import {
  isPlatformAdmin,
  isCentralMember,
  isCentralAdministrator,
  canViewBankWide,
  canGovernCommittees,
  centralRoleOf,
} from "../lib/authorize";
import {
  emailBatchKey,
  groupEmailRows,
  emailRecipientsForOwnerFocusedEvent,
} from "../lib/notificationGrouping";

function user(partial: Partial<User> & { centralRole?: "MEMBER" | "ADMINISTRATOR" | null }): User {
  return {
    id: 1,
    email: "u@example.com",
    fullName: "Test User",
    entraObjectId: null,
    department: null,
    active: true,
    isAdmin: false,
    isCentralCommittee: false,
    centralRole: null,
    createdAt: new Date(),
    ...partial,
  } as User;
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err}`);
  }
}

console.log("Permission rules");
test("platform admin is bank-wide and can govern", () => {
  const u = user({ isAdmin: true });
  assert.strictEqual(isPlatformAdmin(u), true);
  assert.strictEqual(canViewBankWide(u), true);
  assert.strictEqual(canGovernCommittees(u), true);
});

test("ordinary user is not bank-wide", () => {
  const u = user({});
  assert.strictEqual(isPlatformAdmin(u), false);
  assert.strictEqual(isCentralMember(u), false);
  assert.strictEqual(canViewBankWide(u), false);
  assert.strictEqual(canGovernCommittees(u), false);
});

test("central member can view bank-wide but not govern committees", () => {
  const u = user({ isCentralCommittee: true, centralRole: "MEMBER" as const });
  assert.strictEqual(isCentralMember(u), true);
  assert.strictEqual(isCentralAdministrator(u), false);
  assert.strictEqual(canViewBankWide(u), true);
  assert.strictEqual(canGovernCommittees(u), false);
});

test("central administrator can govern committees", () => {
  const u = user({ isCentralCommittee: true, centralRole: "ADMINISTRATOR" as const });
  assert.strictEqual(isCentralAdministrator(u), true);
  assert.strictEqual(canGovernCommittees(u), true);
  assert.strictEqual(canViewBankWide(u), true);
});

test("isAdmin alone does not imply centralRole ADMINISTRATOR", () => {
  const u = user({ isAdmin: true, isCentralCommittee: false, centralRole: null });
  assert.strictEqual(centralRoleOf(u), null);
  assert.strictEqual(canGovernCommittees(u), true);
});

console.log("Notification batching / recipients");
test("CREATED for same owner+meeting share one batch key", () => {
  const meetingMap = new Map<number, number | null>([
    [10, 5],
    [11, 5],
  ]);
  const a = emailBatchKey(
    { id: 1, recipientId: 42, notificationType: "CREATED", actionPointId: 10 },
    meetingMap,
  );
  const b = emailBatchKey(
    { id: 2, recipientId: 42, notificationType: "CREATED", actionPointId: 11 },
    meetingMap,
  );
  assert.strictEqual(a, b);
  assert.strictEqual(a, "CREATED::recipient:42::meeting:5");
});

test("CREATED for different owners do not share a key", () => {
  const meetingMap = new Map<number, number | null>([[10, 5]]);
  const a = emailBatchKey(
    { id: 1, recipientId: 1, notificationType: "CREATED", actionPointId: 10 },
    meetingMap,
  );
  const b = emailBatchKey(
    { id: 2, recipientId: 2, notificationType: "CREATED", actionPointId: 10 },
    meetingMap,
  );
  assert.notStrictEqual(a, b);
});

test("STATUS_CHANGE groups by action not by recipient", () => {
  const meetingMap = new Map<number, number | null>();
  const a = emailBatchKey(
    { id: 1, recipientId: 1, notificationType: "STATUS_CHANGE", actionPointId: 99 },
    meetingMap,
  );
  const b = emailBatchKey(
    { id: 2, recipientId: 2, notificationType: "STATUS_CHANGE", actionPointId: 99 },
    meetingMap,
  );
  assert.strictEqual(a, b);
  assert.strictEqual(a, "STATUS_CHANGE::action:99");
});

test("groupEmailRows digests 10 CREATED for one owner into one group", () => {
  const meetingMap = new Map<number, number | null>();
  const rows = [];
  for (let i = 1; i <= 10; i++) {
    meetingMap.set(i, 7);
    rows.push({
      id: i,
      recipientId: 100,
      notificationType: "CREATED",
      actionPointId: i,
    });
  }
  const groups = groupEmailRows(rows, meetingMap);
  assert.strictEqual(groups.size, 1);
  assert.strictEqual([...groups.values()][0].length, 10);
});

test("owner-focused email recipients are unique owners only", () => {
  const ids = emailRecipientsForOwnerFocusedEvent({
    ownerIds: [3, 3, 5],
    primaryOwnerId: 3,
  });
  assert.deepStrictEqual(ids.sort(), [3, 5]);
});

test("owner-focused falls back to primary owner", () => {
  const ids = emailRecipientsForOwnerFocusedEvent({
    ownerIds: [],
    primaryOwnerId: 9,
  });
  assert.deepStrictEqual(ids, [9]);
});

console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

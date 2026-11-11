import { prisma } from "../lib/prisma";
import { Errors } from "../lib/http";
import { auditRow } from "./auditService";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertEmail(email: string) {
  const e = normalizeEmail(email);
  if (!e || !e.includes("@") || e.length > 190) {
    throw Errors.badRequest("A valid email address is required.");
  }
  return e;
}

export async function listBccRecipients(committeeId: number) {
  return prisma.bccRecipient.findMany({
    where: { committeeId, active: true },
    orderBy: { email: "asc" },
    select: {
      id: true,
      email: true,
      displayName: true,
      active: true,
      createdAt: true,
    },
  });
}

/**
 * Emails to BCC on action-point reminder / overdue mails for a committee.
 * Excludes addresses already in the To/Cc sets (case-insensitive).
 */
export async function loadCommitteeBccRecipients(
  committeeId: number,
  excludeEmails: Set<string>,
): Promise<{ email: string; name?: string }[]> {
  const rows = await prisma.bccRecipient.findMany({
    where: { committeeId, active: true },
    select: { email: true, displayName: true },
  });
  const out: { email: string; name?: string }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const e = r.email.toLowerCase();
    if (excludeEmails.has(e) || seen.has(e)) continue;
    seen.add(e);
    out.push({ email: r.email, name: r.displayName || undefined });
  }
  return out;
}

export async function addBccRecipient(input: {
  committeeId: number;
  email: string;
  displayName?: string | null;
  actorUserId: number;
}) {
  const committee = await prisma.committee.findUnique({ where: { id: input.committeeId } });
  if (!committee) throw Errors.notFound("Committee");

  const email = assertEmail(input.email);
  const displayName = input.displayName?.trim() || null;

  const existing = await prisma.bccRecipient.findFirst({
    where: { committeeId: input.committeeId, email },
  });
  if (existing) {
    if (existing.active) {
      throw Errors.conflict("This email is already a BCC recipient for this committee.");
    }
    const row = await prisma.bccRecipient.update({
      where: { id: existing.id },
      data: {
        active: true,
        displayName,
        createdById: input.actorUserId,
      },
      select: { id: true, email: true, displayName: true, active: true, createdAt: true },
    });
    await prisma.auditEvent.create({
      data: auditRow({
        actorUserId: input.actorUserId,
        action: "bcc_recipient.reactivate",
        resourceType: "bcc_recipient",
        resourceId: row.id,
        committeeId: input.committeeId,
        after: { email, displayName },
        result: "SUCCESS",
      }),
    });
    return row;
  }

  try {
    const row = await prisma.bccRecipient.create({
      data: {
        committeeId: input.committeeId,
        email,
        displayName,
        createdById: input.actorUserId,
      },
      select: { id: true, email: true, displayName: true, active: true, createdAt: true },
    });
    await prisma.auditEvent.create({
      data: auditRow({
        actorUserId: input.actorUserId,
        action: "bcc_recipient.add",
        resourceType: "bcc_recipient",
        resourceId: row.id,
        committeeId: input.committeeId,
        after: { email, displayName },
        result: "SUCCESS",
      }),
    });
    return row;
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : undefined;
    if (code === "P2002") {
      throw Errors.conflict("This email is already a BCC recipient for this committee.");
    }
    throw err;
  }
}

export async function removeBccRecipient(input: {
  committeeId: number;
  recipientId: number;
  actorUserId: number;
}) {
  const row = await prisma.bccRecipient.findFirst({
    where: { id: input.recipientId, committeeId: input.committeeId },
  });
  if (!row) throw Errors.notFound("BCC recipient");

  await prisma.bccRecipient.update({
    where: { id: row.id },
    data: { active: false },
  });
  await prisma.auditEvent.create({
    data: auditRow({
      actorUserId: input.actorUserId,
      action: "bcc_recipient.remove",
      resourceType: "bcc_recipient",
      resourceId: row.id,
      committeeId: input.committeeId,
      before: { email: row.email },
      result: "SUCCESS",
    }),
  });
  return { id: row.id, removed: true };
}

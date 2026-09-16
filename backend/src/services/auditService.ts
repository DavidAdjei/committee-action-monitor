import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export function auditRow(params: {
  actorUserId: number | null;
  action: string;
  resourceType: string;
  resourceId?: number;
  committeeId?: number;
  actionPointId?: number;
  before?: unknown;
  after?: unknown;
  result: "SUCCESS" | "DENIED";
  correlationId?: string;
}): Prisma.AuditEventCreateManyInput {
  return {
    actorUserId: params.actorUserId,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    committeeId: params.committeeId,
    actionPointId: params.actionPointId,
    before: params.before === undefined ? undefined : (params.before as Prisma.InputJsonValue),
    after: params.after === undefined ? undefined : (params.after as Prisma.InputJsonValue),
    result: params.result,
    correlationId: params.correlationId,
  };
}

/** Best-effort DENIED audit write — never throws into the request path. */
export async function recordDenied(params: {
  actorUserId: number | null;
  action: string;
  resourceType: string;
  resourceId?: number;
  committeeId?: number;
  actionPointId?: number;
  reason?: string;
  correlationId?: string;
}): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: auditRow({
        actorUserId: params.actorUserId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        committeeId: params.committeeId,
        actionPointId: params.actionPointId,
        after: params.reason ? { reason: params.reason } : undefined,
        result: "DENIED",
        correlationId: params.correlationId,
      }),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to record DENIED audit event", err);
  }
}

export function serializeAuditEvent(ev: {
  id: number;
  occurredAt: Date;
  actorUserId: number | null;
  action: string;
  resourceType: string;
  resourceId: number | null;
  committeeId: number | null;
  actionPointId: number | null;
  before: unknown;
  after: unknown;
  result: string;
  correlationId: string | null;
  actor?: { id: number; fullName: string } | null;
}) {
  const result = ev.result === "SUCCESS" ? "SUCCEEDED" : ev.result === "DENIED" ? "DENIED" : ev.result;
  const reason =
    ev.after && typeof ev.after === "object" && ev.after !== null && "reason" in (ev.after as object)
      ? String((ev.after as { reason?: unknown }).reason ?? "")
      : null;

  return {
    eventId: String(ev.id),
    occurredAt: ev.occurredAt.toISOString(),
    actorUserId: ev.actorUserId ?? 0,
    actorFullName: ev.actor?.fullName,
    action: ev.action,
    resourceType: ev.resourceType,
    resourceId: ev.resourceId ?? ev.actionPointId ?? 0,
    committeeId: ev.committeeId,
    before: (ev.before as Record<string, unknown> | null) ?? null,
    after: (ev.after as Record<string, unknown> | null) ?? null,
    result,
    reason: reason || null,
    correlationId: ev.correlationId,
  };
}

export async function listActionAudit(actionPointId: number, limit = 100) {
  const events = await prisma.auditEvent.findMany({
    where: { actionPointId },
    orderBy: { occurredAt: "desc" },
    take: Math.min(limit, 500),
    include: { actor: { select: { id: true, fullName: true } } },
  });
  return events.map(serializeAuditEvent);
}

export async function listCommitteeAudit(committeeId: number, limit = 100) {
  const events = await prisma.auditEvent.findMany({
    where: { committeeId },
    orderBy: { occurredAt: "desc" },
    take: Math.min(limit, 500),
    include: { actor: { select: { id: true, fullName: true } } },
  });
  return events.map(serializeAuditEvent);
}

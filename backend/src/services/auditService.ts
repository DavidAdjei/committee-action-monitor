import type { Prisma } from "@prisma/client";

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

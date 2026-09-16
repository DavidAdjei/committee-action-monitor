import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { isCommitteeOfficer, requireCommitteeOfficer } from "../lib/authorize";
import { ok, errorResponse, preflight, Errors, ApiError } from "../lib/http";
import { recordActionUpdate, verifyActionEvidence, reopenAction } from "../services/actionService";
import { recordDenied } from "../services/auditService";

async function createUpdateHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  let actorUserId: number | null = null;
  let actionId: number | undefined;
  let committeeId: number | undefined;
  try {
    const user = await requireUser(req);
    actorUserId = user.id;
    actionId = Number(req.params.id);
    if (!Number.isInteger(actionId)) throw Errors.badRequest("Invalid action id.");

    const action = await prisma.actionPoint.findUnique({ where: { id: actionId } });
    if (!action) throw Errors.notFound("Action point");
    committeeId = action.committeeId;

    // Progress updates: action owner only.
    // Cancel: Chairperson/Secretary only.
    // Officers do not record progress on behalf of the owner.
    const officer = await isCommitteeOfficer(user.id, action.committeeId);
    const isOwner = action.ownerId === user.id;

    const body = (await req.json()) as {
      status?: "IN_PROGRESS" | "OVERDUE" | "COMPLETED" | "CANCELLED";
      progress?: number;
      note?: string;
      revisedDeadline?: string;
      evidenceLink?: string;
      evidenceFiles?: { storageKey: string; filename: string; mediaType: string; sizeBytes: number }[];
      version?: number;
    };

    if (!body.status || body.progress === undefined || !body.note) {
      throw Errors.badRequest("status, progress and note are required.");
    }
    if (body.status === "CANCELLED") {
      if (!officer) {
        throw Errors.forbidden("Only the committee's Chairperson or Secretary may cancel an action.");
      }
    } else if (!isOwner) {
      throw Errors.forbidden("Only the assigned action owner may update progress on this action.");
    }

    const updated = await recordActionUpdate({
      actionPointId: actionId,
      authorId: user.id,
      status: body.status,
      progress: body.progress,
      note: body.note,
      revisedDeadline: body.revisedDeadline ? new Date(body.revisedDeadline) : undefined,
      evidenceLink: body.evidenceLink,
      evidenceFiles: body.evidenceFiles,
      expectedVersion: typeof body.version === "number" ? body.version : undefined,
    });

    return ok(updated, 201);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      await recordDenied({
        actorUserId: actorUserId,
        action: "action_point.update",
        resourceType: "action_point",
        resourceId: actionId,
        committeeId,
        actionPointId: actionId,
        reason: err.message,
      });
    }
    return errorResponse(err);
  }
}

async function verifyHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  let actorUserId: number | null = null;
  let actionId: number | undefined;
  let committeeId: number | undefined;
  try {
    const user = await requireUser(req);
    actorUserId = user.id;
    actionId = Number(req.params.id);
    if (!Number.isInteger(actionId)) throw Errors.badRequest("Invalid action id.");

    const action = await prisma.actionPoint.findUnique({ where: { id: actionId } });
    if (!action) throw Errors.notFound("Action point");
    committeeId = action.committeeId;
    await requireCommitteeOfficer(user, action.committeeId);

    const body = (await req.json()) as { approve?: boolean; note?: string; version?: number };
    if (typeof body.approve !== "boolean") throw Errors.badRequest("approve (boolean) is required.");

    const updated = await verifyActionEvidence({
      actionPointId: actionId,
      verifiedById: user.id,
      approve: body.approve,
      note: body.note,
      expectedVersion: typeof body.version === "number" ? body.version : undefined,
    });

    return ok(updated);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      await recordDenied({
        actorUserId: actorUserId,
        action: "action_point.verify",
        resourceType: "action_point",
        resourceId: actionId,
        committeeId,
        actionPointId: actionId,
        reason: err.message,
      });
    }
    return errorResponse(err);
  }
}


async function reopenHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  let actorUserId: number | null = null;
  let actionId: number | undefined;
  let committeeId: number | undefined;
  try {
    const user = await requireUser(req);
    actorUserId = user.id;
    actionId = Number(req.params.id);
    if (!Number.isInteger(actionId)) throw Errors.badRequest("Invalid action id.");

    const action = await prisma.actionPoint.findUnique({ where: { id: actionId } });
    if (!action) throw Errors.notFound("Action point");
    committeeId = action.committeeId;
    await requireCommitteeOfficer(user, action.committeeId);

    const body = (await req.json()) as { note?: string; version?: number };
    if (!body.note?.trim()) throw Errors.badRequest("note is required to reopen an action.");

    const updated = await reopenAction({
      actionPointId: actionId,
      reopenedById: user.id,
      note: body.note,
      expectedVersion: typeof body.version === "number" ? body.version : undefined,
    });

    return ok(updated);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      await recordDenied({
        actorUserId: actorUserId,
        action: "action_point.reopen",
        resourceType: "action_point",
        resourceId: actionId,
        committeeId,
        actionPointId: actionId,
        reason: err.message,
      });
    }
    return errorResponse(err);
  }
}

app.http("createActionUpdate", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "actions/{id}/updates",
  handler: createUpdateHandler,
});

app.http("verifyAction", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "actions/{id}/verify",
  handler: verifyHandler,
});

app.http("reopenAction", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "actions/{id}/reopen",
  handler: reopenHandler,
});

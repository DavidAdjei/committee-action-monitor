import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { isCommitteeOfficer, requireCommitteeOfficer } from "../lib/authorize";
import { ok, errorResponse, preflight, Errors } from "../lib/http";
import { recordActionUpdate, verifyActionEvidence } from "../services/actionService";

async function createUpdateHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const actionId = Number(req.params.id);
    if (!Number.isInteger(actionId)) throw Errors.badRequest("Invalid action id.");

    const action = await prisma.actionPoint.findUnique({ where: { id: actionId } });
    if (!action) throw Errors.notFound("Action point");

    // Capability matrix: Chairperson/Secretary can update any action in
    // their committee; the Action Owner can update only their own assigned
    // action. Central Committee Members and ordinary members cannot write.
    const officer = await isCommitteeOfficer(user.id, action.committeeId);
    if (!officer && action.ownerId !== user.id) {
      throw Errors.forbidden("Only the action owner or the committee's officers may update this action.");
    }

    const body = (await req.json()) as {
      status?: "IN_PROGRESS" | "OVERDUE" | "COMPLETED" | "CANCELLED";
      progress?: number;
      note?: string;
      revisedDeadline?: string;
      evidenceLink?: string;
      evidenceFiles?: { storageKey: string; filename: string; mediaType: string; sizeBytes: number }[];
    };

    if (!body.status || body.progress === undefined || !body.note) {
      throw Errors.badRequest("status, progress and note are required.");
    }
    if (body.status === "CANCELLED" && !officer) {
      throw Errors.forbidden("Only the committee's officers may cancel an action.");
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
    });

    return ok(updated, 201);
  } catch (err) {
    return errorResponse(err);
  }
}

async function verifyHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const actionId = Number(req.params.id);
    if (!Number.isInteger(actionId)) throw Errors.badRequest("Invalid action id.");

    const action = await prisma.actionPoint.findUnique({ where: { id: actionId } });
    if (!action) throw Errors.notFound("Action point");
    await requireCommitteeOfficer(user, action.committeeId);

    const body = (await req.json()) as { approve?: boolean; note?: string };
    if (typeof body.approve !== "boolean") throw Errors.badRequest("approve (boolean) is required.");

    const updated = await verifyActionEvidence({
      actionPointId: actionId,
      verifiedById: user.id,
      approve: body.approve,
      note: body.note,
    });

    return ok(updated);
  } catch (err) {
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

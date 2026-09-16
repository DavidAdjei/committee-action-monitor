import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { requireViewCommittee, requireCommitteeOfficer } from "../lib/authorize";
import { ok, errorResponse, preflight, Errors, ApiError } from "../lib/http";
import { updateActionMetadata, deleteActionPoint } from "../services/actionService";
import { recordDenied } from "../services/auditService";

async function getActionDetail(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await requireUser(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw Errors.badRequest("Invalid action id.");

    const action = await prisma.actionPoint.findUnique({
      where: { id },
      include: {
        owner: true,
        committee: true,
        meeting: true,
        createdBy: true,
        verifiedBy: true,
        stakeholders: { include: { user: true } },
        updates: {
          orderBy: { createdAt: "desc" },
          include: { author: true, evidenceFiles: true },
        },
      },
    });
    if (!action) throw Errors.notFound("Action point");

    await requireViewCommittee(user, action.committeeId);

    return ok({
      id: action.id,
      referenceNo: action.referenceNo,
      title: action.title,
      description: action.description,
      committee: { id: action.committee.id, name: action.committee.name },
      meeting: { id: action.meeting.id, title: action.meeting.title, reference: action.meeting.reference },
      owner: { id: action.owner.id, fullName: action.owner.fullName },
      createdBy: { id: action.createdBy.id, fullName: action.createdBy.fullName },
      dateRaised: action.dateRaised,
      deadline: action.deadline,
      revisedDeadline: action.revisedDeadline,
      priority: action.priority,
      status: action.status,
      progress: action.progress,
      statusReason: action.statusReason,
      minutesReference: action.minutesReference,
      completedAt: action.completedAt,
      verifiedBy: action.verifiedBy ? { id: action.verifiedBy.id, fullName: action.verifiedBy.fullName } : null,
      verifiedAt: action.verifiedAt,
      version: action.version,
      stakeholders: action.stakeholders.map((s) => ({
        userId: s.userId,
        fullName: s.user.fullName,
        stakeholderType: s.stakeholderType,
      })),
      updates: action.updates.map((u) => ({
        id: u.id,
        author: { id: u.author.id, fullName: u.author.fullName },
        status: u.status,
        progress: u.progress,
        note: u.note,
        revisedDeadline: u.revisedDeadline,
        evidenceLink: u.evidenceLink,
        evidenceFiles: u.evidenceFiles.map((f) => ({
          id: f.id,
          filename: f.filename,
          mediaType: f.mediaType,
          sizeBytes: f.sizeBytes,
          scanResult: f.scanResult,
        })),
        createdAt: u.createdAt,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

async function modifyAction(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
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

    const body = (await req.json()) as {
      title?: string;
      description?: string | null;
      ownerId?: number;
      deadline?: string;
      priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      minutesReference?: string | null;
      version?: number;
    };

    const updated = await updateActionMetadata({
      actionPointId: actionId,
      actorUserId: user.id,
      expectedVersion: typeof body.version === "number" ? body.version : undefined,
      title: body.title,
      description: body.description,
      ownerId: body.ownerId,
      deadline: body.deadline ? new Date(body.deadline) : undefined,
      priority: body.priority,
      minutesReference: body.minutesReference,
    });

    return ok(updated);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      await recordDenied({
        actorUserId: actorUserId,
        action: "action_point.modify",
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

async function deleteAction(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
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

    const body = (await req.json().catch(() => ({}))) as { version?: number; hardDelete?: boolean };
    const result = await deleteActionPoint({
      actionPointId: actionId,
      actorUserId: user.id,
      expectedVersion: typeof body.version === "number" ? body.version : undefined,
      hardDelete: body.hardDelete === true,
    });

    return ok(result);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      await recordDenied({
        actorUserId: actorUserId,
        action: "action_point.delete",
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

/** Single registration for actions/{id} — avoids Azure Functions route conflicts. */
async function handleActionById(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  if (req.method === "GET") return getActionDetail(req, ctx);
  if (req.method === "PATCH") return modifyAction(req, ctx);
  if (req.method === "DELETE") return deleteAction(req, ctx);
  return errorResponse(Errors.badRequest("Method not allowed."));
}

app.http("actionDetail", {
  methods: ["GET", "PATCH", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "actions/{id}",
  handler: handleActionById,
});

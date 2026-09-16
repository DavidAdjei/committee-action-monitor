import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { isCommitteeOfficer, requireViewCommittee, requireCentralCommittee } from "../lib/authorize";
import { ok, errorResponse, preflight, Errors } from "../lib/http";
import { listActionAudit, listCommitteeAudit } from "../services/auditService";

/**
 * Audit trail for a single action point.
 * Visible to: committee officers, central committee, admin.
 * Ordinary members / owners can view the action but not the security audit log
 * (docs §9 — audit is a governance control).
 */
async function actionAuditHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const actionId = Number(req.params.id);
    if (!Number.isInteger(actionId)) throw Errors.badRequest("Invalid action id.");

    const action = await prisma.actionPoint.findUnique({ where: { id: actionId } });
    if (!action) throw Errors.notFound("Action point");

    await requireViewCommittee(user, action.committeeId);

    const officer = await isCommitteeOfficer(user.id, action.committeeId);
    if (!officer && !user.isCentralCommittee && !user.isAdmin) {
      throw Errors.forbidden("Only committee officers or Central Committee may view the audit trail.");
    }

    const events = await listActionAudit(actionId);
    return ok(events);
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Committee-scoped audit trail (admin / central / officers).
 */
async function committeeAuditHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const committeeId = Number(req.params.id);
    if (!Number.isInteger(committeeId)) throw Errors.badRequest("Invalid committee id.");

    await requireViewCommittee(user, committeeId);

    const officer = await isCommitteeOfficer(user.id, committeeId);
    if (!officer && !user.isCentralCommittee && !user.isAdmin) {
      throw Errors.forbidden("Only committee officers or Central Committee may view the audit trail.");
    }

    const limitRaw = req.query.get("limit");
    const limit = limitRaw ? Number(limitRaw) : 100;
    const events = await listCommitteeAudit(committeeId, Number.isFinite(limit) ? limit : 100);
    return ok(events);
  } catch (err) {
    return errorResponse(err);
  }
}

app.http("actionAudit", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "actions/{id}/audit",
  handler: actionAuditHandler,
});

app.http("committeeAudit", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "committees/{id}/audit",
  handler: committeeAuditHandler,
});

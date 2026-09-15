import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { requireViewCommittee, isCommitteeOfficer } from "../lib/authorize";
import { ok, errorResponse, preflight, Errors } from "../lib/http";
import { storeEvidenceFile, readEvidenceFile, EvidenceValidationError } from "../services/storageService";

/**
 * Uploads one evidence file for a specific action point and returns its
 * storage descriptor. The caller then includes this descriptor when
 * submitting the status update (POST /actions/{id}/updates) so the file is
 * linked to the specific update record that asserted completion — matching
 * the documented "evidence is linked to an action update record" rule.
 */
async function uploadEvidence(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const actionId = Number(req.params.id);
    if (!Number.isInteger(actionId)) throw Errors.badRequest("Invalid action id.");

    const action = await prisma.actionPoint.findUnique({ where: { id: actionId } });
    if (!action) throw Errors.notFound("Action point");

    const officer = await isCommitteeOfficer(user.id, action.committeeId);
    if (!officer && action.ownerId !== user.id) {
      throw Errors.forbidden("Only the action owner or the committee's officers may upload evidence.");
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") throw Errors.badRequest("A file field is required.");

    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storeEvidenceFile({
      filename: file.name,
      mediaType: file.type || "application/octet-stream",
      buffer,
    });

    return ok({
      storageKey: stored.storageKey,
      filename: file.name,
      mediaType: file.type || "application/octet-stream",
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
    });
  } catch (err) {
    if (err instanceof EvidenceValidationError) {
      return errorResponse(Errors.badRequest(err.message));
    }
    return errorResponse(err);
  }
}

/**
 * Short-lived, authorization-checked download. Local dev streams the file
 * directly; a Blob Storage deployment should instead issue a short-lived
 * SAS URL here and redirect, per the documented "short-lived download
 * authorization" control.
 */
async function downloadEvidence(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const evidenceId = Number(req.params.evidenceId);
    if (!Number.isInteger(evidenceId)) throw Errors.badRequest("Invalid evidence id.");

    const evidence = await prisma.evidenceFile.findUnique({
      where: { id: evidenceId },
      include: { actionUpdate: { include: { actionPoint: true } } },
    });
    if (!evidence) throw Errors.notFound("Evidence file");

    await requireViewCommittee(user, evidence.actionUpdate.actionPoint.committeeId);

    const buffer = await readEvidenceFile(evidence.storageKey);
    return {
      status: 200,
      body: buffer,
      headers: {
        "Content-Type": evidence.mediaType,
        "Content-Disposition": `attachment; filename="${evidence.filename}"`,
      },
    };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http("uploadEvidence", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "actions/{id}/evidence/upload",
  handler: uploadEvidence,
});

app.http("downloadEvidence", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "evidence/{evidenceId}/download",
  handler: downloadEvidence,
});

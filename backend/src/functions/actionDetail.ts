import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { requireViewCommittee } from "../lib/authorize";
import { ok, errorResponse, preflight, Errors } from "../lib/http";

async function actionDetail(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
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

app.http("actionDetail", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "actions/{id}",
  handler: actionDetail,
});

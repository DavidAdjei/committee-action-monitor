import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { requireViewCommittee, requireCommitteeOfficer } from "../lib/authorize";
import { ok, errorResponse, preflight, Errors, ApiError } from "../lib/http";
import { recordDenied } from "../services/auditService";
import { createActionPoint } from "../services/actionService";

async function listActions(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const committeeId = Number(req.params.id);
    if (!Number.isInteger(committeeId)) throw Errors.badRequest("Invalid committee id.");
    await requireViewCommittee(user, committeeId);

    const status = req.query.get("status");
    const search = req.query.get("q");

    const actions = await prisma.actionPoint.findMany({
      where: {
        committeeId,
        status: status && status !== "All" ? (mapUiStatus(status) as any) : undefined,
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { referenceNo: { contains: search } },
              ],
            }
          : {}),
      },
      include: { owner: true, meeting: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    return ok(actions.map(serializeAction));
  } catch (err) {
    return errorResponse(err);
  }
}

function mapUiStatus(status: string): string {
  // The UI's filter labels (documented in section 5) differ from the
  // canonical schema values; this is the single place that mapping happens.
  const map: Record<string, string> = {
    Open: "OPEN",
    "In Progress": "IN_PROGRESS",
    Completed: "COMPLETED",
    Overdue: "OVERDUE",
    "Pending Verification": "PENDING_VERIFICATION",
    Cancelled: "CANCELLED",
  };
  return map[status] ?? status;
}

function serializeAction(a: any) {
  return {
    id: a.id,
    referenceNo: a.referenceNo,
    title: a.title,
    committeeId: a.committeeId,
    meeting: { id: a.meeting.id, title: a.meeting.title, reference: a.meeting.reference },
    owner: { id: a.owner.id, fullName: a.owner.fullName },
    dateRaised: a.dateRaised,
    createdAt: a.createdAt,
    deadline: a.deadline,
    revisedDeadline: a.revisedDeadline,
    priority: a.priority,
    status: a.status,
    progress: a.progress,
    minutesReference: a.minutesReference,
  };
}

async function createActionHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  let actorUserId: number | null = null;
  let committeeId: number | undefined;
  try {
    const user = await requireUser(req);
    actorUserId = user.id;
    committeeId = Number(req.params.id);
    if (!Number.isInteger(committeeId)) throw Errors.badRequest("Invalid committee id.");

    // Server re-check per section 4.3 step 3 — the committee field is fixed
    // by the workspace on the client, but authorization must be repeated here.
    await requireCommitteeOfficer(user, committeeId);

    const body = (await req.json()) as {
      meetingId?: number;
      title?: string;
      description?: string;
      ownerId?: number;
      ownerIds?: number[];
      dateRaised?: string;
      deadline?: string;
      priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      minutesReference?: string;
      additionalStakeholderIds?: number[];
    };

    const ownerIds = [
      ...new Set(
        [...(body.ownerIds ?? []), ...(body.ownerId != null ? [body.ownerId] : [])].filter(
          (id): id is number => typeof id === "number" && Number.isInteger(id),
        ),
      ),
    ];

    if (!body.meetingId || !body.title || ownerIds.length === 0 || !body.deadline) {
      throw Errors.badRequest(
        "meetingId, title, ownerId/ownerIds and deadline are required.",
      );
    }

    const action = await createActionPoint({
      meetingId: body.meetingId,
      committeeId,
      title: body.title,
      description: body.description,
      ownerId: ownerIds[0],
      ownerIds,
      // Start date is always the creation moment — not client-supplied.
      dateRaised: new Date(),
      deadline: new Date(body.deadline),
      priority: body.priority,
      minutesReference: body.minutesReference,
      additionalStakeholderIds: body.additionalStakeholderIds,
      createdById: user.id,
    });

    return ok(action, 201);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      await recordDenied({
        actorUserId: actorUserId,
        action: "action_point.create",
        resourceType: "action_point",
        committeeId,
        reason: err.message,
      });
    }
    return errorResponse(err);
  }
}

async function handleActions(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  
  if (req.method === "GET") return listActions(req, _ctx);
  if (req.method === "POST") return createActionHandler(req, _ctx);
  
  return errorResponse(new Error("Method not allowed"));
}

app.http("actions", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "committees/{id}/actions",
  handler: handleActions,
});

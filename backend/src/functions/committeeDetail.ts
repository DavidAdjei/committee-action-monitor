import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { requireViewCommittee, requireCentralCommittee } from "../lib/authorize";
import { ok, errorResponse, preflight, Errors } from "../lib/http";
import { committeeSummary } from "../services/reportService";
import { addCommitteeMember, setCommitteeChair } from "../services/committeeService";

async function committeeDetail(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw Errors.badRequest("Invalid committee id.");

    await requireViewCommittee(user, id);

    const committee = await prisma.committee.findUnique({
      where: { id },
      include: {
        chairperson: true,
        secretary: true,
        centralRep: true,
        memberships: { where: { active: true }, include: { user: true } },
        meetings: { orderBy: { startsAt: "desc" }, take: 10 },
      },
    });
    if (!committee) throw Errors.notFound("Committee");

    const myMembership = await prisma.committeeMembership.findFirst({
      where: { userId: user.id, committeeId: id, active: true },
    });
    const myRole = myMembership?.role ?? null;
    const canEdit = myRole === "CHAIRPERSON" || myRole === "SECRETARY";
    const isCentralCommitteeViewOnly = Boolean(user.isCentralCommittee && !canEdit);
    const canManageCommittee = Boolean(user.isCentralCommittee || user.isAdmin);

    const [summary] = await committeeSummary([id]);

    const pendingVerification = await prisma.actionPoint.findMany({
      where: { committeeId: id, status: "PENDING_VERIFICATION" },
      include: { owner: true, updates: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    return ok({
      id: committee.id,
      name: committee.name,
      code: committee.code,
      mandate: committee.mandate,
      meetingFrequency: committee.meetingFrequency,
      chairperson: { id: committee.chairperson.id, fullName: committee.chairperson.fullName },
      secretary: { id: committee.secretary.id, fullName: committee.secretary.fullName },
      centralRep: { id: committee.centralRep.id, fullName: committee.centralRep.fullName },
      myRole,
      canEdit,
      isCentralCommitteeViewOnly,
      canManageCommittee,
      members: committee.memberships.map((m) => ({
        userId: m.userId,
        fullName: m.user.fullName,
        role: m.role,
      })),
      meetings: committee.meetings,
      pendingVerification: pendingVerification.map((a) => ({
        id: a.id,
        referenceNo: a.referenceNo,
        title: a.title,
        owner: { id: a.owner.id, fullName: a.owner.fullName },
        latestNote: a.updates[0]?.note ?? null,
        submittedAt: a.updates[0]?.createdAt ?? null,
      })),
      summary,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

async function addMemberHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const committeeId = Number(req.params.id);
    if (!Number.isInteger(committeeId)) throw Errors.badRequest("Invalid committee id.");

    await requireCentralCommittee(user);

    const body = (await req.json()) as {
      userId?: number;
      role?: "CHAIRPERSON" | "SECRETARY" | "MEMBER";
    };
    if (!body.userId) throw Errors.badRequest("userId is required.");

    const membership = await addCommitteeMember({
      committeeId,
      userId: Number(body.userId),
      role: body.role,
      actorUserId: user.id,
    });

    return ok(membership, 201);
  } catch (err) {
    return errorResponse(err);
  }
}

async function setChairHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const committeeId = Number(req.params.id);
    if (!Number.isInteger(committeeId)) throw Errors.badRequest("Invalid committee id.");

    await requireCentralCommittee(user);

    const body = (await req.json()) as {
      chairpersonId?: number;
    };
    if (!body.chairpersonId) throw Errors.badRequest("chairpersonId is required.");

    const updated = await setCommitteeChair({
      committeeId,
      chairpersonId: Number(body.chairpersonId),
      actorUserId: user.id,
    });

    return ok(updated);
  } catch (err) {
    return errorResponse(err);
  }
}

app.http("committeeDetail", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "committees/{id}",
  handler: committeeDetail,
});

app.http("committeeAddMember", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "committees/{id}/members",
  handler: addMemberHandler,
});

app.http("committeeSetChair", {
  methods: ["PATCH", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "committees/{id}/chair",
  handler: setChairHandler,
});

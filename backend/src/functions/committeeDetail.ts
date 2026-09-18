import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { requireViewCommittee, requireCentralCommittee, requireCommitteeOfficer, isCommitteeOfficer } from "../lib/authorize";
import { ok, errorResponse, preflight, Errors, ApiError } from "../lib/http";
import { committeeSummary } from "../services/reportService";
import { recordDenied } from "../services/auditService";
import { addCommitteeMember, setCommitteeChair, removeCommitteeMember, setCommitteeCentralRep } from "../services/committeeService";

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
    const officer = await isCommitteeOfficer(user.id, id);
    // Leadership changes & bank-wide governance: admin / central
    const canManageCommittee = Boolean(user.isAdmin || user.isCentralCommittee);
    // Add/change members & roles: chair/secretary of this committee, or admin
    const canManageMembers = Boolean(user.isAdmin || officer);

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
      centralRep: committee.centralRep
        ? { id: committee.centralRep.id, fullName: committee.centralRep.fullName }
        : null,
      myRole,
      canEdit,
      isCentralCommitteeViewOnly,
      canManageCommittee,
      canManageMembers,
      members: committee.memberships.map((m) => ({
        userId: m.userId,
        fullName: m.user.fullName,
        email: m.user.email,
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

    // Chairperson/Secretary may add members and assign roles; admins always may.
    if (!user.isAdmin) {
      await requireCommitteeOfficer(user, committeeId);
    }

    const body = (await req.json()) as {
      userId?: number;
      role?: "CHAIRPERSON" | "SECRETARY" | "MEMBER";
    };
    if (!body.userId) throw Errors.badRequest("userId is required.");

    // Assigning Chairperson is reserved for Central Committee (Set Chair flow).
    if (body.role === "CHAIRPERSON" && !user.isAdmin && !user.isCentralCommittee) {
      throw Errors.forbidden("Only Central Committee members may assign the Chairperson role.");
    }

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

    // Leadership reassignment is a Central Committee / Admin control only.
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


async function removeMemberHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  let actorUserId: number | null = null;
  let committeeId: number | undefined;
  try {
    const user = await requireUser(req);
    actorUserId = user.id;
    committeeId = Number(req.params.id);
    const userId = Number(req.params.userId);
    if (!Number.isInteger(committeeId) || !Number.isInteger(userId)) {
      throw Errors.badRequest("Invalid committee or user id.");
    }

    if (!user.isAdmin) {
      await requireCommitteeOfficer(user, committeeId);
    }

    const result = await removeCommitteeMember({
      committeeId,
      userId,
      actorUserId: user.id,
    });
    return ok({ removed: true, membershipId: result.id });
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      await recordDenied({
        actorUserId: actorUserId,
        action: "committee.member_remove",
        resourceType: "committee",
        resourceId: committeeId,
        committeeId,
        reason: err.message,
      });
    }
    return errorResponse(err);
  }
}


async function setCentralRepHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  let actorUserId: number | null = null;
  let committeeId: number | undefined;
  try {
    const user = await requireUser(req);
    actorUserId = user.id;
    committeeId = Number(req.params.id);
    if (!Number.isInteger(committeeId)) throw Errors.badRequest("Invalid committee id.");

    // Only Central Committee / Admin may assign the Central rep seat
    await requireCentralCommittee(user);

    const body = (await req.json()) as { centralRepId?: number | null };
    // null or omit clears; number assigns (must be Central — enforced in service)
    const centralRepId =
      body.centralRepId === undefined || body.centralRepId === null
        ? null
        : Number(body.centralRepId);
    if (centralRepId !== null && !Number.isInteger(centralRepId)) {
      throw Errors.badRequest("Invalid centralRepId.");
    }

    const updated = await setCommitteeCentralRep({
      committeeId,
      centralRepId,
      actorUserId: user.id,
    });

    let centralRep: { id: number; fullName: string } | null = null;
    if (updated.centralRepId != null) {
      const rep = await prisma.user.findUnique({
        where: { id: updated.centralRepId },
        select: { id: true, fullName: true },
      });
      if (rep) centralRep = { id: rep.id, fullName: rep.fullName };
    }

    return ok({
      id: updated.id,
      centralRep,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      await recordDenied({
        actorUserId: actorUserId,
        action: "committee.set_central_rep",
        resourceType: "committee",
        resourceId: committeeId,
        committeeId,
        reason: err.message,
      });
    }
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

app.http("removeCommitteeMember", {
  methods: ["DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "committees/{id}/members/{userId}",
  handler: removeMemberHandler,
});

app.http("setCommitteeCentralRep", {
  methods: ["PATCH", "OPTIONS"],
  authLevel: "anonymous",
  route: "committees/{id}/central-rep",
  handler: setCentralRepHandler,
});

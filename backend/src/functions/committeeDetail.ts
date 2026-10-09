import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import {
  requireViewCommittee,
  requireCentralCommittee,
  requireCommitteeOfficer,
  isCommitteeOfficer,
  isPlatformAdmin,
  isCentralMember,
  canGovernCommittees,
  requireCentralAdministrator,
} from "../lib/authorize";
import { ok, errorResponse, preflight, Errors, ApiError } from "../lib/http";
import { committeeSummary } from "../services/reportService";
import { recordDenied } from "../services/auditService";
import { addCommitteeMember, setCommitteeChair, removeCommitteeMember, setCommitteeCentralRep, updateCommitteeDistributionEmail } from "../services/committeeService";

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
    // Write access to operational content: platform admin or committee officers only
    const canEdit =
      isPlatformAdmin(user) || myRole === "CHAIRPERSON" || myRole === "SECRETARY";
    // Central members (incl. Central Admin) without officer seat: view-only
    const isCentralCommitteeViewOnly = Boolean(
      isCentralMember(user) && !isPlatformAdmin(user) && !canEdit,
    );
    const officer = await isCommitteeOfficer(user.id, id);
    // Set chair / secretary / central rep: platform admin or Central Administrator
    const canManageCommittee = canGovernCommittees(user);
    // Add ordinary members: committee officers or platform admin
    const canManageMembers = Boolean(isPlatformAdmin(user) || officer);

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
      distributionEmail: committee.distributionEmail,
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

    // Chairperson/Secretary may add members; platform admin always may.
    // Assigning Chairperson is Central Administrator (or platform admin) only.
    const body = (await req.json()) as {
      userId?: number;
      role?: "CHAIRPERSON" | "SECRETARY" | "MEMBER";
    };
    if (!body.userId) throw Errors.badRequest("userId is required.");

    if (body.role === "CHAIRPERSON") {
      if (!canGovernCommittees(user)) {
        throw Errors.forbidden(
          "Only a Central Committee Administrator may assign the Chairperson role.",
        );
      }
    } else if (!isPlatformAdmin(user)) {
      await requireCommitteeOfficer(user, committeeId);
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
    await requireCentralAdministrator(user);

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

    if (!isPlatformAdmin(user)) {
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
    await requireCentralAdministrator(user);

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

async function setDistributionEmailHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const committeeId = Number(req.params.id);
    if (!Number.isInteger(committeeId)) throw Errors.badRequest("Invalid committee id.");

    // Chair, secretary, or platform admin
    if (!isPlatformAdmin(user)) {
      await requireCommitteeOfficer(user, committeeId);
    }

    const body = (await req.json()) as { distributionEmail?: string | null };
    const updated = await updateCommitteeDistributionEmail({
      committeeId,
      distributionEmail: body.distributionEmail === undefined ? null : body.distributionEmail,
      actorUserId: user.id,
    });
    return ok(updated);
  } catch (err) {
    return errorResponse(err);
  }
}

app.http("setCommitteeDistributionEmail", {
  methods: ["PATCH", "OPTIONS"],
  authLevel: "anonymous",
  route: "committees/{id}/distribution-email",
  handler: setDistributionEmailHandler,
});


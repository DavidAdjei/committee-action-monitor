import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { loadMemberships, requireAdmin, isCentralMember } from "../lib/authorize";
import { recordDenied } from "../services/auditService";
import { ok, errorResponse, preflight, Errors, ApiError } from "../lib/http";
import { committeeSummary } from "../services/reportService";
import { createCommittee } from "../services/committeeService";

async function listCommittees(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const memberships = await loadMemberships(user.id);
    const permittedIds = isCentralMember(user) ? undefined : memberships.map((m) => m.committeeId);

    if (!isCentralMember(user) && permittedIds!.length === 0) return ok([]);

    const committees = await prisma.committee.findMany({
      where: permittedIds ? { id: { in: permittedIds } } : undefined,
      include: { chairperson: true, secretary: true, centralRep: true },
      orderBy: { name: "asc" },
    });

    const summaries = await committeeSummary(committees.map((c) => c.id));

    const roleRank = (role: string | null | undefined): number => {
      if (role === "CHAIRPERSON") return 0;
      if (role === "SECRETARY") return 1;
      if (role === "MEMBER") return 2;
      return 3; // no membership (e.g. Central overview)
    };

    const body = committees
      .map((c) => {
        const summary = summaries.find((s) => s.committeeId === c.id)!;
        const myRole = memberships.find((m) => m.committeeId === c.id)?.role ?? null;
        return {
          id: c.id,
          name: c.name,
          code: c.code,
          mandate: c.mandate,
          meetingFrequency: c.meetingFrequency,
          chairperson: { id: c.chairperson.id, fullName: c.chairperson.fullName },
          secretary: { id: c.secretary.id, fullName: c.secretary.fullName },
          centralRep: c.centralRep
            ? { id: c.centralRep.id, fullName: c.centralRep.fullName }
            : null,
          myRole,
          canEdit: myRole === "CHAIRPERSON" || myRole === "SECRETARY",
          ...summary,
        };
      })
      // Prioritise by the caller's role in each committee: Chair → Secretary → Member → other
      .sort((a, b) => {
        const byRole = roleRank(a.myRole) - roleRank(b.myRole);
        if (byRole !== 0) return byRole;
        return a.name.localeCompare(b.name);
      });

    return ok(body);
  } catch (err) {
    return errorResponse(err);
  }
}

async function createCommitteeHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  let actorUserId: number | null = null;
  try {
    const user = await requireUser(req);
    actorUserId = user.id;
    // Docs §2 / §3.4: only Central Committee Administrator may create committees
    // (ordinary Central members are read-only).
    await requireAdmin(user);

    const body = (await req.json()) as {
      name?: string;
      code?: string;
      mandate?: string;
      meetingFrequency?: string;
      chairpersonId?: number;
      secretaryId?: number;
      centralRepId?: number;
      memberIds?: number[];
    };

    if (!body.name || !body.code || !body.chairpersonId || !body.secretaryId) {
      throw Errors.badRequest(
        "name, code, chairpersonId and secretaryId are required.",
      );
    }

    // If a central rep is supplied, they must be a Central Committee member
    if (body.centralRepId) {
      const rep = await prisma.user.findUnique({ where: { id: Number(body.centralRepId) } });
      if (!rep?.isCentralCommittee) {
        throw Errors.badRequest(
          "Central Committee representative must be a Central Committee member.",
        );
      }
    }

    const committee = await createCommittee({
      name: body.name,
      code: body.code,
      mandate: body.mandate,
      meetingFrequency: body.meetingFrequency,
      chairpersonId: body.chairpersonId,
      secretaryId: body.secretaryId,
      centralRepId: body.centralRepId ?? null,
      memberIds: body.memberIds ?? [],
      createdById: user.id,
    });

    return ok(committee, 201);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      await recordDenied({
        actorUserId: actorUserId,
        action: "committee.create",
        resourceType: "committee",
        reason: err.message,
      });
    }
    return errorResponse(err);
  }
}

async function handleCommittees(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  
  if (req.method === "GET") return listCommittees(req, _ctx);
  if (req.method === "POST") return createCommitteeHandler(req, _ctx);
  
  return errorResponse(new Error("Method not allowed"));
}

app.http("committees", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "committees",
  handler: handleCommittees,
});

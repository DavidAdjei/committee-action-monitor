import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { loadMemberships, requireAdmin } from "../lib/authorize";
import { recordDenied } from "../services/auditService";
import { ok, errorResponse, preflight, Errors, ApiError } from "../lib/http";
import { committeeSummary } from "../services/reportService";
import { createCommittee } from "../services/committeeService";

async function listCommittees(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const memberships = await loadMemberships(user.id);
    const permittedIds = user.isCentralCommittee ? undefined : memberships.map((m) => m.committeeId);

    if (!user.isCentralCommittee && permittedIds!.length === 0) return ok([]);

    const committees = await prisma.committee.findMany({
      where: permittedIds ? { id: { in: permittedIds } } : undefined,
      include: { chairperson: true, secretary: true, centralRep: true },
      orderBy: { name: "asc" },
    });

    const summaries = await committeeSummary(committees.map((c) => c.id));

    const body = committees.map((c) => {
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
        centralRep: { id: c.centralRep.id, fullName: c.centralRep.fullName },
        myRole,
        canEdit: myRole === "CHAIRPERSON" || myRole === "SECRETARY",
        ...summary,
      };
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

    if (!body.name || !body.code || !body.chairpersonId || !body.secretaryId || !body.centralRepId) {
      throw Errors.badRequest(
        "name, code, chairpersonId, secretaryId and centralRepId are required.",
      );
    }

    const committee = await createCommittee({
      name: body.name,
      code: body.code,
      mandate: body.mandate,
      meetingFrequency: body.meetingFrequency,
      chairpersonId: body.chairpersonId,
      secretaryId: body.secretaryId,
      centralRepId: body.centralRepId,
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

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { loadMemberships } from "../lib/authorize";
import { ok, errorResponse, preflight } from "../lib/http";

async function me(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const memberships = await loadMemberships(user.id);

    const committees = memberships.length
      ? await prisma.committee.findMany({
          where: { id: { in: memberships.map((m) => m.committeeId) } },
          select: { id: true, name: true, code: true },
        })
      : [];

    return ok({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      department: user.department,
      isCentralCommittee: user.isCentralCommittee,
      isAdmin: user.isAdmin,
      /** Central Committee sub-role: MEMBER | ADMINISTRATOR | null */
      centralRole: (user as { centralRole?: "MEMBER" | "ADMINISTRATOR" | null }).centralRole
        ?? (user.isAdmin ? "ADMINISTRATOR" : user.isCentralCommittee ? "MEMBER" : null),
      memberships: memberships.map((m) => ({
        ...m,
        committee: committees.find((c) => c.id === m.committeeId),
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

app.http("me", { methods: ["GET", "OPTIONS"], authLevel: "anonymous", route: "me", handler: me });

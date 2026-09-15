import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { ok, errorResponse, preflight, Errors } from "../lib/http";

/**
 * DEV/DEMO ONLY. Lists active users so a developer can pick "who am I" in
 * place of a real Entra ID sign-in. This must never be reachable when
 * DEV_AUTH_ENABLED is unset — production deployments authenticate through
 * Azure App Service Easy Auth (Entra ID) in front of the Function App, and
 * this route is disabled entirely (401) in that configuration.
 */
async function devUsers(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    if (process.env.DEV_AUTH_ENABLED !== "true") {
      throw Errors.unauthenticated();
    }
    const users = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, fullName: true, email: true, department: true, isCentralCommittee: true, isAdmin: true },
      orderBy: { fullName: "asc" },
    });
    return ok(users);
  } catch (err) {
    return errorResponse(err);
  }
}

app.http("devUsers", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "dev/users",
  handler: devUsers,
});

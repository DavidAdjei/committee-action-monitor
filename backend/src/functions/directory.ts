import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { requireAdmin } from "../lib/authorize";
import { ok, errorResponse, preflight } from "../lib/http";
import { isGraphDirectoryConfigured, syncUsersFromEntra } from "../lib/graphDirectory";

/**
 * Local directory search (projection of Entra users).
 * Keep in sync via POST /directory/sync (Graph application permissions).
 */
async function searchDirectory(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    await requireUser(req);
    const q = req.query.get("q") ?? "";

    const users = await prisma.user.findMany({
      where: {
        active: true,
        ...(q
          ? {
              OR: [
                { fullName: { contains: q } },
                { email: { contains: q } },
                { department: { contains: q } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        department: true,
        isCentralCommittee: true,
        entraObjectId: true,
      },
      take: 50,
      orderBy: { fullName: "asc" },
    });

    return ok(users);
  } catch (err) {
    return errorResponse(err);
  }
}

/** Admin-only: pull users from Microsoft Graph into the local User table. */
async function syncDirectory(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    await requireAdmin(user);

    const result = await syncUsersFromEntra();
    return ok({
      ...result,
      graphConfigured: isGraphDirectoryConfigured(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

async function directoryStatus(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    await requireUser(req);
    const count = await prisma.user.count({ where: { active: true } });
    const linked = await prisma.user.count({
      where: { active: true, entraObjectId: { not: null } },
    });
    return ok({
      activeUsers: count,
      linkedToEntra: linked,
      graphConfigured: isGraphDirectoryConfigured(),
      jwtConfigured: Boolean(process.env.ENTRA_TENANT_ID && process.env.ENTRA_API_AUDIENCE),
      autoProvision: process.env.ENTRA_AUTO_PROVISION === "true",
    });
  } catch (err) {
    return errorResponse(err);
  }
}

app.http("searchDirectory", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "directory",
  handler: searchDirectory,
});

app.http("syncDirectory", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "directory/sync",
  handler: syncDirectory,
});

app.http("directoryStatus", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "directory/status",
  handler: directoryStatus,
});

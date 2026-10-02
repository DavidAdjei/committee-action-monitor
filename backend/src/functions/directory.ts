import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { requirePlatformAdmin } from "../lib/authorize";
import { ok, errorResponse, preflight } from "../lib/http";
import { isGraphDirectoryConfigured, syncUsersFromEntra } from "../lib/graphDirectory";

function rankUser(
  u: { fullName: string; email: string; department: string | null },
  q: string,
): number {
  const n = u.fullName.toLowerCase();
  const e = (u.email || "").toLowerCase();
  const d = (u.department || "").toLowerCase();
  const query = q.toLowerCase().trim();
  if (!query) return 0;
  if (n.startsWith(query)) return 100;
  if (e.startsWith(query)) return 90;
  if (n.split(/\s+/).some((p) => p.startsWith(query))) return 80;
  if (n.includes(query)) return 50;
  if (e.includes(query)) return 40;
  if (d.includes(query)) return 20;
  return 0;
}

async function searchDirectory(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    await requireUser(req);
    const q = (req.query.get("q") ?? "").trim();
    const limitParam = Number(req.query.get("limit") ?? (q ? 5 : 500));
    const limit = Math.min(Math.max(1, Number.isFinite(limitParam) ? limitParam : 5), 1000);

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
      take: q ? Math.min(80, Math.max(limit * 8, 40)) : limit,
      orderBy: { fullName: "asc" },
    });

    let result = users;
    if (q) {
      result = [...users]
        .map((u) => ({ u, score: rankUser(u, q) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || a.u.fullName.localeCompare(b.u.fullName))
        .slice(0, limit)
        .map((x) => x.u);
    }

    return ok(result);
  } catch (err) {
    return errorResponse(err);
  }
}

async function syncDirectory(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    await requirePlatformAdmin(user);
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
    });
  } catch (err) {
    return errorResponse(err);
  }
}

app.http("directory", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "directory",
  handler: searchDirectory,
});

app.http("directorySync", {
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

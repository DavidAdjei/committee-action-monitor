import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { ok, errorResponse, preflight } from "../lib/http";

/**
 * Stand-in for Microsoft Graph directory search (section 7.1). The
 * application treats Entra as authoritative for identity status but keeps
 * a local projection (object id, name, email, department, active) to query
 * without a live Graph round-trip on every keystroke. Swap the query body
 * for a Graph `/users` call (User.ReadBasic.All, delegated) if a live
 * lookup is preferred over the local projection.
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
      select: { id: true, fullName: true, email: true, department: true },
      take: 20,
      orderBy: { fullName: "asc" },
    });

    return ok(users);
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

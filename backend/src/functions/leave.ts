import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { Errors, errorResponse, ok, preflight } from "../lib/http";

function parseDateOnly(raw: string): Date {
  // Accept YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) throw Errors.badRequest("Dates must be YYYY-MM-DD.");
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) throw Errors.badRequest("Invalid date.");
  return d;
}

function requirePlatformAdmin(user: { isAdmin: boolean }) {
  if (!user.isAdmin) {
    throw Errors.forbidden("Only platform administrators can manage leave records.");
  }
}

/** List leave overlapping a range (all authenticated users can view). */
async function listLeave(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    await requireUser(req);
    const fromRaw = req.query.get("from");
    const toRaw = req.query.get("to");
    const from = fromRaw ? parseDateOnly(fromRaw.slice(0, 10)) : undefined;
    const to = toRaw ? parseDateOnly(toRaw.slice(0, 10)) : undefined;

    const rows = await prisma.userLeave.findMany({
      where: {
        ...(from || to
          ? {
              AND: [
                ...(to ? [{ startsOn: { lte: to } }] : []),
                ...(from ? [{ endsOn: { gte: from } }] : []),
              ],
            }
          : {}),
      },
      orderBy: { startsOn: "asc" },
      include: {
        user: { select: { id: true, fullName: true, email: true, department: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    return ok(
      rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        startsOn: r.startsOn.toISOString().slice(0, 10),
        endsOn: r.endsOn.toISOString().slice(0, 10),
        note: r.note,
        user: r.user,
        createdBy: r.createdBy,
        createdAt: r.createdAt,
      })),
    );
  } catch (err) {
    return errorResponse(err);
  }
}

/** Create leave — platform admin only. */
async function createLeave(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    requirePlatformAdmin(user);

    const body = (await req.json()) as {
      userId?: number;
      startsOn?: string;
      endsOn?: string;
      note?: string;
    };
    if (!body.userId || !body.startsOn || !body.endsOn) {
      throw Errors.badRequest("userId, startsOn, and endsOn are required.");
    }
    const startsOn = parseDateOnly(body.startsOn);
    const endsOn = parseDateOnly(body.endsOn);
    if (endsOn < startsOn) throw Errors.badRequest("endsOn must be on or after startsOn.");

    const target = await prisma.user.findUnique({ where: { id: Number(body.userId) } });
    if (!target || !target.active) throw Errors.notFound("User");

    const row = await prisma.userLeave.create({
      data: {
        userId: target.id,
        startsOn,
        endsOn,
        note: body.note?.trim() || null,
        createdById: user.id,
      },
      include: {
        user: { select: { id: true, fullName: true, email: true, department: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    return ok(
      {
        id: row.id,
        userId: row.userId,
        startsOn: row.startsOn.toISOString().slice(0, 10),
        endsOn: row.endsOn.toISOString().slice(0, 10),
        note: row.note,
        user: row.user,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
      },
      201,
    );
  } catch (err) {
    return errorResponse(err);
  }
}

/** Delete leave — platform admin only. */
async function deleteLeave(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    requirePlatformAdmin(user);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw Errors.badRequest("Invalid leave id.");
    const existing = await prisma.userLeave.findUnique({ where: { id } });
    if (!existing) throw Errors.notFound("Leave record");
    await prisma.userLeave.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}

async function leaveCollection(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  if (req.method === "GET") return listLeave(req, ctx);
  if (req.method === "POST") return createLeave(req, ctx);
  return errorResponse(new Error("Method not allowed"));
}

async function leaveItem(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  if (req.method === "DELETE") return deleteLeave(req, ctx);
  return errorResponse(new Error("Method not allowed"));
}

app.http("leave", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "leave",
  handler: leaveCollection,
});

app.http("leaveItem", {
  methods: ["DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "leave/{id}",
  handler: leaveItem,
});

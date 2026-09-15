import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { loadMemberships } from "../lib/authorize";
import { ok, errorResponse, preflight } from "../lib/http";

const UI_STATUS_MAP: Record<string, string> = {
  Open: "OPEN",
  "In Progress": "IN_PROGRESS",
  Completed: "COMPLETED",
  Overdue: "OVERDUE",
  "Pending Verification": "PENDING_VERIFICATION",
  Cancelled: "CANCELLED",
};

/**
 * Read-only consolidated register (section 3.2 / 3.6): shows actions across
 * every committee the caller may view. Central Committee Members see the
 * whole bank; everyone else sees only committees where they hold active
 * membership. This never grants write access — creation still requires the
 * committee-scoped, officer-only endpoint.
 */
async function listAllActions(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const memberships = await loadMemberships(user.id);
    const permittedCommitteeIds = user.isCentralCommittee ? undefined : memberships.map((m) => m.committeeId);

    if (!user.isCentralCommittee && (permittedCommitteeIds as number[]).length === 0) return ok([]);

    const status = req.query.get("status");
    const search = req.query.get("q");
    const page = Number(req.query.get("page") ?? "1");
    const pageSize = Number(req.query.get("pageSize") ?? "25");

    const where = {
      committeeId: permittedCommitteeIds ? { in: permittedCommitteeIds } : undefined,
      status: status && status !== "All" ? (UI_STATUS_MAP[status] as any) : undefined,
      ...(search
        ? { OR: [{ title: { contains: search } }, { referenceNo: { contains: search } }] }
        : {}),
    };

    const [total, actions] = await Promise.all([
      prisma.actionPoint.count({ where }),
      prisma.actionPoint.findMany({
        where,
        include: { owner: true, committee: true, meeting: true },
        orderBy: { deadline: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return ok({
      total,
      page,
      pageSize,
      items: actions.map((a) => ({
        id: a.id,
        referenceNo: a.referenceNo,
        title: a.title,
        committee: { id: a.committee.id, name: a.committee.name },
        owner: { id: a.owner.id, fullName: a.owner.fullName },
        deadline: a.deadline,
        status: a.status,
        progress: a.progress,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

app.http("listAllActions", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "actions",
  handler: listAllActions,
});

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { canViewBankWide } from "../lib/authorize";
import { requireUser } from "../lib/auth";
import { ok, errorResponse, preflight, Errors } from "../lib/http";

const UI_STATUS_MAP: Record<string, string> = {
  Open: "OPEN",
  "In Progress": "IN_PROGRESS",
  Completed: "COMPLETED",
  Overdue: "OVERDUE",
  "Pending Verification": "PENDING_VERIFICATION",
  Cancelled: "CANCELLED",
};

/**
 * Consolidated action register.
 * - Central Committee: bank-wide; optional ?committeeId= filter.
 * - Everyone else: only actions assigned to them as owner (any committee).
 *   Full committee registers remain on the committee workspace endpoints.
 * Ordered newest → oldest by createdAt.
 */
async function listAllActions(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);

    const status = req.query.get("status");
    const search = req.query.get("q");
    const committeeIdRaw = req.query.get("committeeId");
    const scope = (req.query.get("scope") ?? "").toLowerCase(); // mine | all
    const page = Number(req.query.get("page") ?? "1");
    const pageSize = Math.min(Number(req.query.get("pageSize") ?? "25"), 100);

    const committeeId =
      committeeIdRaw && Number.isInteger(Number(committeeIdRaw)) ? Number(committeeIdRaw) : undefined;

    const where: Record<string, unknown> = {
      status: status && status !== "All" ? (UI_STATUS_MAP[status] as string) : undefined,
    };

    const searchClause = search
      ? { OR: [{ title: { contains: search } }, { referenceNo: { contains: search } }] }
      : null;

    const ownerClause = {
      OR: [
        { ownerId: user.id },
        {
          stakeholders: {
            some: { userId: user.id, stakeholderType: "ACTION_OWNER" },
          },
        },
      ],
    };

    if (canViewBankWide(user) && scope !== "mine") {
      // Bank-wide (or filtered by committee)
      if (committeeId) where.committeeId = committeeId;
      if (searchClause) Object.assign(where, searchClause);
    } else {
      // Mine: actions assigned to this user as owner
      if (committeeId) where.committeeId = committeeId;
      if (searchClause) {
        where.AND = [ownerClause, searchClause];
      } else {
        Object.assign(where, ownerClause);
      }
    }

    const [total, actions] = await Promise.all([
      prisma.actionPoint.count({ where: where as any }),
      prisma.actionPoint.findMany({
        where: where as any,
        include: { owner: true, committee: true, meeting: true, _count: { select: { comments: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
        dateRaised: a.dateRaised,
        createdAt: a.createdAt,
        deadline: a.deadline,
        status: a.status,
        progress: a.progress,
        priority: a.priority,
        commentCount: a._count?.comments ?? 0,
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

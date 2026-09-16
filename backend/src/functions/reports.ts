import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { requireUser } from "../lib/auth";
import { loadMemberships } from "../lib/authorize";
import { ok, errorResponse, preflight, Errors, corsHeaders } from "../lib/http";
import { bankWideDashboard, committeeSummary } from "../services/reportService";
import { prisma } from "../lib/prisma";

async function dashboard(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    if (!user.isCentralCommittee) {
      throw Errors.forbidden("The bank-wide dashboard is available to Central Committee Members only.");
    }
    return ok(await bankWideDashboard());
  } catch (err) {
    return errorResponse(err);
  }
}

async function summary(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const memberships = await loadMemberships(user.id);
    const ids = user.isCentralCommittee ? undefined : memberships.map((m) => m.committeeId);
    return ok(await committeeSummary(ids));
  } catch (err) {
    return errorResponse(err);
  }
}

app.http("dashboardReport", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "reports/dashboard",
  handler: dashboard,
});

app.http("committeeSummaryReport", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "reports/committee-summary",
  handler: summary,
});

/** CSV export of the action register for committees the caller may view. */
async function actionsExport(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const memberships = await loadMemberships(user.id);
    const permittedIds = user.isCentralCommittee
      ? undefined
      : memberships.map((m) => m.committeeId);

    if (!user.isCentralCommittee && (!permittedIds || permittedIds.length === 0)) {
      return {
        status: 200,
        body: "referenceNo,title,committee,owner,status,priority,progress,deadline,dateRaised\n",
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="action-register.csv"',
          ...corsHeaders(),
        },
      };
    }

    const actions = await prisma.actionPoint.findMany({
      where: permittedIds ? { committeeId: { in: permittedIds } } : undefined,
      include: { owner: true, committee: true },
      orderBy: [{ deadline: "asc" }, { referenceNo: "asc" }],
      take: 5000,
    });

    const esc = (v: string | number | null | undefined) => {
      const s = v == null ? "" : String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const header =
      "referenceNo,title,committee,committeeCode,owner,status,priority,progress,deadline,dateRaised,revisedDeadline";
    const rows = actions.map((a) =>
      [
        a.referenceNo,
        a.title,
        a.committee.name,
        a.committee.code,
        a.owner.fullName,
        a.status,
        a.priority,
        a.progress,
        a.deadline.toISOString().slice(0, 10),
        a.dateRaised.toISOString().slice(0, 10),
        a.revisedDeadline ? a.revisedDeadline.toISOString().slice(0, 10) : "",
      ]
        .map(esc)
        .join(","),
    );

    const csv = [header, ...rows].join("\n") + "\n";
    return {
      status: 200,
      body: csv,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="action-register.csv"',
        "Access-Control-Expose-Headers": "Content-Disposition",
        ...corsHeaders(),
      },
    };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http("actionsExport", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "reports/actions-export",
  handler: actionsExport,
});

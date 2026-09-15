import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { requireUser } from "../lib/auth";
import { loadMemberships } from "../lib/authorize";
import { ok, errorResponse, preflight, Errors } from "../lib/http";
import { bankWideDashboard, committeeSummary } from "../services/reportService";

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

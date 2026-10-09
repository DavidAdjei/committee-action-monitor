import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { requireUser } from "../lib/auth";
import { loadMemberships, isCentralMember, canViewBankWide, isPlatformAdmin } from "../lib/authorize";
import { ok, errorResponse, preflight, Errors, corsHeaders } from "../lib/http";
import { bankWideDashboard, committeeSummary } from "../services/reportService";
import {
  buildMonthlyActionReport,
  reportToCsv,
  reportToSpreadsheetMl,
  reportToPdf,
} from "../services/monthlyActionReport";
import { prisma } from "../lib/prisma";

async function dashboard(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    if (!canViewBankWide(user)) {
      throw Errors.forbidden(
        "The bank-wide dashboard is available to platform administrators and Central Committee members only.",
      );
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
    const ids = canViewBankWide(user) ? undefined : memberships.map((m) => m.committeeId);
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
    const permittedIds = canViewBankWide(user)
      ? undefined
      : memberships.map((m) => m.committeeId);

    if (!canViewBankWide(user) && (!permittedIds || permittedIds.length === 0)) {
      return {
        status: 200,
        body: "referenceNo,title,committee,committeeCode,owner,status,priority,progress,deadline,dateRaised,revisedDeadline\n",
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


/** Monthly action-points report for Central Committee / platform admins. format=csv|xlsx|pdf */
async function monthlyActionsReport(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    if (!canViewBankWide(user)) {
      throw Errors.forbidden(
        "Monthly action reports are available to platform administrators and Central Committee members only.",
      );
    }

    const now = new Date();
    const year = Number(req.query.get("year") ?? now.getUTCFullYear());
    const month = Number(req.query.get("month") ?? now.getUTCMonth() + 1);
    const format = (req.query.get("format") ?? "xlsx").toLowerCase();

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw Errors.badRequest("Invalid year.");
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw Errors.badRequest("Invalid month (1–12).");
    }
    if (!["csv", "xlsx", "pdf", "json"].includes(format)) {
      throw Errors.badRequest("format must be csv, xlsx, pdf, or json.");
    }

    const report = await buildMonthlyActionReport(year, month);
    const base = `cam-monthly-actions-${year}-${String(month).padStart(2, "0")}`;

    if (format === "json") {
      return ok({
        year: report.year,
        month: report.month,
        monthLabel: report.monthLabel,
        total: report.total,
        completed: report.completed,
        open: report.open,
        inProgress: report.inProgress,
        overdue: report.overdue,
        completionRate: report.completionRate,
        avgProgress: report.avgProgress,
        byCommittee: report.byCommittee,
        byStatus: report.byStatus,
      });
    }

    if (format === "csv") {
      const csv = reportToCsv(report);
      return {
        status: 200,
        body: csv,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${base}.csv"`,
          "Access-Control-Expose-Headers": "Content-Disposition",
          ...corsHeaders(),
        },
      };
    }

    if (format === "xlsx") {
      const xml = reportToSpreadsheetMl(report);
      return {
        status: 200,
        body: xml,
        headers: {
          "Content-Type": "application/vnd.ms-excel; charset=utf-8",
          "Content-Disposition": `attachment; filename="${base}.xls"`,
          "Access-Control-Expose-Headers": "Content-Disposition",
          ...corsHeaders(),
        },
      };
    }

    // pdf
    const pdf = reportToPdf(report);
    return {
      status: 200,
      body: pdf,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${base}.pdf"`,
        "Access-Control-Expose-Headers": "Content-Disposition",
        ...corsHeaders(),
      },
    };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http("monthlyActionsReport", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "reports/monthly-actions",
  handler: monthlyActionsReport,
});

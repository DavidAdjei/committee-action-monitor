import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { requireCommitteeOfficer, requireViewCommittee } from "../lib/authorize";
import { ok, errorResponse, preflight, Errors, corsHeaders } from "../lib/http";
import { getMinutesDetail, listMinutesForMeeting } from "../services/minutesService";
import { importMinutesWithActions } from "../services/minutesImportService";
import {
  uploadMinutesDocument,
  downloadMinutesDocument,
} from "../services/minutesDocumentService.upload";
import { EvidenceValidationError } from "../services/storageService";

async function listMinutesForMeetingHandler(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const meetingId = Number(req.params.id);
    if (!Number.isInteger(meetingId)) throw Errors.badRequest("Invalid meeting id.");

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw Errors.notFound("Meeting");
    await requireViewCommittee(user, meeting.committeeId);

    const minutes = await listMinutesForMeeting(meetingId);
    return ok(minutes);
  } catch (err) {
    return errorResponse(err);
  }
}

async function handleMinutesForMeeting(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  if (req.method === "GET") return listMinutesForMeetingHandler(req, _ctx);
  return errorResponse(
    Errors.badRequest(
      "Creating minutes inline is no longer supported. Use Import minutes or upload a draft/final document.",
    ),
  );
}

async function getMinutesHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const minutesId = Number(req.params.minutesId);
    if (!Number.isInteger(minutesId)) throw Errors.badRequest("Invalid minutes id.");

    const existing = await prisma.meetingMinutes.findUnique({
      where: { id: minutesId },
      include: { meeting: true },
    });
    if (!existing) throw Errors.notFound("Minutes");
    await requireViewCommittee(user, existing.meeting.committeeId);

    const detail = await getMinutesDetail(minutesId);
    return ok(detail);
  } catch (err) {
    return errorResponse(err);
  }
}

async function importMinutesHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const meetingId = Number(req.params.id);
    if (!Number.isInteger(meetingId)) throw Errors.badRequest("Invalid meeting id.");

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw Errors.notFound("Meeting");
    await requireCommitteeOfficer(user, meeting.committeeId);

    const body = (await req.json()) as {
      discussion?: string;
      actionsOnly?: boolean;
      replaceExisting?: boolean;
      actions?: {
        title: string;
        description?: string;
        ownerIds: number[];
        deadline?: string;
        priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
        status?: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE" | "PENDING_VERIFICATION" | "CANCELLED";
        progress?: number;
      }[];
    };

    if (!body.actions || !Array.isArray(body.actions)) {
      throw Errors.badRequest("actions array is required.");
    }

    const result = await importMinutesWithActions({
      meetingId,
      discussion: body.discussion ?? "",
      actions: body.actions,
      createdById: user.id,
      actionsOnly: Boolean(body.actionsOnly),
      replaceExisting: Boolean(body.replaceExisting),
    });

    return ok(
      {
        minutes: result.minutes,
        actions: result.actions,
        summary: {
          created: result.actions.filter((a) => a.created).length,
          linkedExisting: result.actions.filter((a) => !a.created).length,
        },
      },
      201,
    );
  } catch (err) {
    return errorResponse(err);
  }
}

async function uploadMinutesDocumentHandler(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const meetingId = Number(req.params.id);
    if (!Number.isInteger(meetingId)) throw Errors.badRequest("Invalid meeting id.");

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw Errors.notFound("Meeting");
    await requireCommitteeOfficer(user, meeting.committeeId);

    const form = await req.formData();
    const file = form.get("file");
    const statusRaw = String(form.get("status") ?? "DRAFT").toUpperCase();
    const discussion = form.get("discussion");
    const notifyRaw = String(form.get("notifyMinutesIssued") ?? form.get("notify") ?? "false").toLowerCase();
    const notifyMinutesIssued = notifyRaw === "true" || notifyRaw === "1" || notifyRaw === "yes";
    if (!file || typeof file === "string") throw Errors.badRequest("A file field is required.");
    if (statusRaw !== "DRAFT" && statusRaw !== "FINAL") {
      throw Errors.badRequest("status must be DRAFT or FINAL.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const row = await uploadMinutesDocument({
      meetingId,
      actorUserId: user.id,
      status: statusRaw,
      filename: file.name,
      mediaType: file.type || "application/octet-stream",
      buffer,
      discussion: typeof discussion === "string" ? discussion : undefined,
      notifyMinutesIssued,
    });

    return ok(
      {
        id: row.id,
        meetingId: row.meetingId,
        status: row.status,
        filename: row.filename,
        mediaType: row.mediaType,
        sizeBytes: row.sizeBytes,
        hasFile: Boolean(row.storageKey),
        createdAt: row.createdAt,
        createdBy: row.createdBy,
        meeting: row.meeting,
      },
      201,
    );
  } catch (err) {
    if (err instanceof EvidenceValidationError) {
      return errorResponse(Errors.badRequest(err.message));
    }
    return errorResponse(err);
  }
}

async function downloadMinutesDocumentHandler(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const minutesId = Number(req.params.minutesId);
    if (!Number.isInteger(minutesId)) throw Errors.badRequest("Invalid minutes id.");

    const existing = await prisma.meetingMinutes.findUnique({
      where: { id: minutesId },
      include: { meeting: true },
    });
    if (!existing) throw Errors.notFound("Minutes");
    await requireViewCommittee(user, existing.meeting.committeeId);

    const doc = await downloadMinutesDocument(minutesId);
    const inline =
      req.query.get("inline") === "1" ||
      req.query.get("disposition") === "inline" ||
      req.query.get("preview") === "1";
    const safeName = doc.filename.replace(/"/g, "");
    return {
      status: 200,
      headers: {
        "Content-Type": doc.contentType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
        "Cache-Control": "no-store",
        ...corsHeaders(),
      },
      body: doc.buffer,
    };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http("minutesForMeeting", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "meetings/{id}/minutes",
  handler: handleMinutesForMeeting,
});

app.http("uploadMinutesDocument", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "meetings/{id}/minutes/upload",
  handler: uploadMinutesDocumentHandler,
});

app.http("downloadMinutesDocument", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "minutes/{minutesId}/download",
  handler: downloadMinutesDocumentHandler,
});

app.http("getMinutes", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "minutes/{minutesId}",
  handler: getMinutesHandler,
});

app.http("importMinutes", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "meetings/{id}/minutes/import",
  handler: importMinutesHandler,
});

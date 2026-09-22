import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { requireCommitteeOfficer, requireViewCommittee } from "../lib/authorize";
import { ok, errorResponse, preflight, Errors } from "../lib/http";
import {
  createDraftMinutes,
  issueMinutes,
  approveMinutes,
  getMinutesDetail,
  listMinutesForMeeting,
  getMinutesIssuedMailPayload,
} from "../services/minutesService";
import { importMinutesWithActions } from "../services/minutesImportService";
import { buildMinutesDocx } from "../services/minutesDocumentService";

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

async function createMinutesHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const meetingId = Number(req.params.id);
    if (!Number.isInteger(meetingId)) throw Errors.badRequest("Invalid meeting id.");

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw Errors.notFound("Meeting");
    await requireCommitteeOfficer(user, meeting.committeeId);

    const body = (await req.json()) as {
      sourcePopulation?: "LATEST_MEETING" | "PREVIOUS_MEETING" | "ALL_OPEN_ACTIONS";
      discussion?: string;
      includedActionPointIds?: number[];
      documentUrl?: string;
    };
    if (!body.discussion || !body.includedActionPointIds?.length) {
      throw Errors.badRequest("discussion and includedActionPointIds are required.");
    }

    const minutes = await createDraftMinutes({
      meetingId,
      sourcePopulation: body.sourcePopulation ?? "LATEST_MEETING",
      discussion: body.discussion,
      includedActionPointIds: body.includedActionPointIds,
      createdById: user.id,
      documentUrl: body.documentUrl,
    });

    // Return full detail so the UI can show snapshots immediately
    const detail = await getMinutesDetail(minutes.id);
    return ok(detail, 201);
  } catch (err) {
    return errorResponse(err);
  }
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

async function issueMinutesHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const minutesId = Number(req.params.minutesId);
    if (!Number.isInteger(minutesId)) throw Errors.badRequest("Invalid minutes id.");

    const minutes = await prisma.meetingMinutes.findUnique({
      where: { id: minutesId },
      include: { meeting: true },
    });
    if (!minutes) throw Errors.notFound("Minutes");
    await requireCommitteeOfficer(user, minutes.meeting.committeeId);

    const body = (await req.json().catch(() => ({}))) as { documentUrl?: string };
    await issueMinutes(minutesId, user.id, body.documentUrl);
    const detail = await getMinutesDetail(minutesId);
    // Mail payload includes attendance CSV as an attachment for the delivery worker / UI notice
    let mail: { subject: string; attachmentNames: string[] } | null = null;
    try {
      const payload = await getMinutesIssuedMailPayload(minutesId);
      mail = {
        subject: payload.subject,
        attachmentNames: payload.attachments.map((a) => a.filename),
      };
    } catch {
      mail = null;
    }
    return ok({ ...detail, mail });
  } catch (err) {
    return errorResponse(err);
  }
}

async function minutesMailPreviewHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
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

    const payload = await getMinutesIssuedMailPayload(minutesId);
    return ok({
      subject: payload.subject,
      htmlBody: payload.htmlBody,
      textBody: payload.textBody,
      attachments: payload.attachments.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        /** Inline content for download/preview; Graph worker base64-encodes this */
        content: a.content,
        encoding: a.encoding,
      })),
      recipientCount: payload.recipientUserIds.length,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

async function approveMinutesHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const minutesId = Number(req.params.minutesId);
    if (!Number.isInteger(minutesId)) throw Errors.badRequest("Invalid minutes id.");

    const minutes = await prisma.meetingMinutes.findUnique({
      where: { id: minutesId },
      include: { meeting: true },
    });
    if (!minutes) throw Errors.notFound("Minutes");
    await requireCommitteeOfficer(user, minutes.meeting.committeeId);

    await approveMinutes(minutesId, user.id);
    const detail = await getMinutesDetail(minutesId);
    return ok(detail);
  } catch (err) {
    return errorResponse(err);
  }
}

async function handleMinutesForMeeting(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();

  if (req.method === "GET") return listMinutesForMeetingHandler(req, _ctx);
  if (req.method === "POST") return createMinutesHandler(req, _ctx);

  return errorResponse(new Error("Method not allowed"));
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
      documentUrl?: string;
      sourcePopulation?: "LATEST_MEETING" | "PREVIOUS_MEETING" | "ALL_OPEN_ACTIONS";
      actionsOnly?: boolean;
      actions?: {
        title: string;
        description?: string;
        ownerIds: number[];
        deadline?: string;
        priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      }[];
    };

    if (!body.actions || !Array.isArray(body.actions)) {
      throw Errors.badRequest("actions array is required.");
    }

    const result = await importMinutesWithActions({
      meetingId,
      discussion: body.discussion ?? "",
      documentUrl: body.documentUrl,
      sourcePopulation: body.sourcePopulation,
      actions: body.actions,
      createdById: user.id,
      actionsOnly: Boolean(body.actionsOnly),
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


async function exportMinutesHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
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

    const doc = await buildMinutesDocx(minutesId);
    return {
      status: 200,
      headers: {
        "Content-Type": doc.contentType,
        "Content-Disposition": `attachment; filename="${doc.filename}"`,
        "Cache-Control": "no-store",
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

app.http("getMinutes", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "minutes/{minutesId}",
  handler: getMinutesHandler,
});

app.http("issueMinutes", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "minutes/{minutesId}/issue",
  handler: issueMinutesHandler,
});

app.http("approveMinutes", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "minutes/{minutesId}/approve",
  handler: approveMinutesHandler,
});

app.http("importMinutes", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "meetings/{id}/minutes/import",
  handler: importMinutesHandler,
});

app.http("exportMinutes", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "minutes/{minutesId}/export",
  handler: exportMinutesHandler,
});

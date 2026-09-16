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
} from "../services/minutesService";

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
    return ok(detail);
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

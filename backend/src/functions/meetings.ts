import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { requireViewCommittee, requireCommitteeOfficer } from "../lib/authorize";
import { ok, errorResponse, preflight, Errors, ApiError } from "../lib/http";
import { recordDenied } from "../services/auditService";
import { createMeeting } from "../services/meetingService";

async function listMeetings(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const committeeId = Number(req.params.id);
    if (!Number.isInteger(committeeId)) throw Errors.badRequest("Invalid committee id.");
    await requireViewCommittee(user, committeeId);

    const meetings = await prisma.meeting.findMany({
      where: { committeeId },
      orderBy: { startsAt: "desc" },
    });
    return ok(meetings);
  } catch (err) {
    return errorResponse(err);
  }
}

async function createMeetingHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  let actorUserId: number | null = null;
  let committeeId: number | undefined;
  try {
    const user = await requireUser(req);
    actorUserId = user.id;
    committeeId = Number(req.params.id);
    if (!Number.isInteger(committeeId)) throw Errors.badRequest("Invalid committee id.");

    // Server-side re-check: UI visibility is not a security control.
    await requireCommitteeOfficer(user, committeeId);

    const body = (await req.json()) as {
      reference?: string;
      title?: string;
      startsAt?: string;
      endsAt?: string;
      venue?: string;
      agenda?: string;
      teamsRequested?: boolean;
    };
    if (!body.title || !body.startsAt) {
      throw Errors.badRequest("title and startsAt are required.");
    }

    const meeting = await createMeeting({
      committeeId,
      reference: body.reference?.trim() || undefined,
      title: body.title.trim(),
      startsAt: new Date(body.startsAt),
      endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
      venue: body.venue,
      agenda: body.agenda,
      teamsRequested: body.teamsRequested,
      createdById: user.id,
    });

    // NOTE: if teamsRequested, an integration worker should now call
    // Microsoft Graph to create the online meeting and call
    // attachTeamsEvent(meeting.id, eventId, joinUrl) — see meetingService.ts.
    return ok(meeting, 201);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      await recordDenied({
        actorUserId: actorUserId,
        action: "meeting.create",
        resourceType: "meeting",
        committeeId,
        reason: err.message,
      });
    }
    return errorResponse(err);
  }
}

async function handleMeetings(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  
  if (req.method === "GET") return listMeetings(req, _ctx);
  if (req.method === "POST") return createMeetingHandler(req, _ctx);
  
  return errorResponse(new Error("Method not allowed"));
}


async function meetingDetailHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const meetingId = Number(req.params.meetingId);
    if (!Number.isInteger(meetingId)) throw Errors.badRequest("Invalid meeting id.");

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        committee: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, fullName: true } },
        minutes: {
          select: { id: true, status: true, createdAt: true, issuedAt: true },
          orderBy: { createdAt: "desc" },
        },
        actionPoints: {
          select: {
            id: true,
            referenceNo: true,
            title: true,
            status: true,
            progress: true,
            owner: { select: { id: true, fullName: true } },
          },
          orderBy: { deadline: "asc" },
          take: 50,
        },
      },
    });
    if (!meeting) throw Errors.notFound("Meeting");
    await requireViewCommittee(user, meeting.committeeId);

    return ok({
      id: meeting.id,
      committeeId: meeting.committeeId,
      committee: meeting.committee,
      reference: meeting.reference,
      title: meeting.title,
      startsAt: meeting.startsAt,
      endsAt: meeting.endsAt,
      venue: meeting.venue,
      agenda: meeting.agenda,
      teamsRequested: meeting.teamsRequested,
      teamsEventId: meeting.teamsEventId,
      teamsJoinUrl: meeting.teamsJoinUrl,
      createdBy: meeting.createdBy,
      createdAt: meeting.createdAt,
      minutes: meeting.minutes,
      actionPoints: meeting.actionPoints,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

app.http("meetings", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "committees/{id}/meetings",
  handler: handleMeetings,
});

app.http("meetingDetail", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "meetings/{meetingId}",
  handler: meetingDetailHandler,
});

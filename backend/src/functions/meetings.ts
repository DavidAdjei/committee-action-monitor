import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { requireViewCommittee, requireCommitteeOfficer } from "../lib/authorize";
import { ok, errorResponse, preflight, Errors } from "../lib/http";
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
  try {
    const user = await requireUser(req);
    const committeeId = Number(req.params.id);
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
    return errorResponse(err);
  }
}

async function handleMeetings(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  
  if (req.method === "GET") return listMeetings(req, _ctx);
  if (req.method === "POST") return createMeetingHandler(req, _ctx);
  
  return errorResponse(new Error("Method not allowed"));
}

app.http("meetings", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "committees/{id}/meetings",
  handler: handleMeetings,
});

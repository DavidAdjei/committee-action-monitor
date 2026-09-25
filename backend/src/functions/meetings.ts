import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../lib/prisma";
import { requireUser } from "../lib/auth";
import { requireViewCommittee, requireCommitteeOfficer, isCommitteeOfficer } from "../lib/authorize";
import { ok, errorResponse, preflight, Errors, ApiError } from "../lib/http";
import { recordDenied } from "../services/auditService";
import {
  createMeeting,
  markAttendance,
  setAttendanceSheetUrl,
  listAttendance,
} from "../services/meetingService";
import { tryProvisionTeamsForMeeting } from "../services/teamsMeetingService";

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
      include: { _count: { select: { attendance: true } } },
    });
    return ok(
      meetings.map((m) => ({
        ...m,
        attendanceCount: m._count.attendance,
        _count: undefined,
      })),
    );
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

    const startsAt = new Date(body.startsAt);
    const endsAt = body.endsAt ? new Date(body.endsAt) : undefined;
    const title = body.title.trim();
    const teamsRequested = Boolean(body.teamsRequested);

    const meeting = await createMeeting({
      committeeId,
      reference: body.reference?.trim() || undefined,
      title,
      startsAt,
      endsAt,
      venue: body.venue,
      agenda: body.agenda,
      teamsRequested,
      createdById: user.id,
    });

    // Best-effort Teams online meeting under the creator (Secretary/Chair) as organizer.
    // Failure does not roll back the CAM meeting; join URL is simply omitted.
    const teams = await tryProvisionTeamsForMeeting({
      meetingId: meeting.id,
      committeeId,
      title,
      startsAt,
      endsAt,
      createdById: user.id,
      agenda: body.agenda,
      teamsRequested,
    });

    return ok(
      {
        ...meeting,
        teamsEventId: teams?.teamsEventId ?? meeting.teamsEventId,
        teamsJoinUrl: teams?.teamsJoinUrl ?? meeting.teamsJoinUrl,
        teamsProvisioned: Boolean(teams?.teamsJoinUrl),
        teamsOrganizer: teams?.organizerUpn ?? null,
      },
      201,
    );
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
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        attendance: {
          include: { user: { select: { id: true, fullName: true, email: true, department: true } } },
          orderBy: { markedAt: "asc" },
        },
      },
    });
    if (!meeting) throw Errors.notFound("Meeting");
    await requireViewCommittee(user, meeting.committeeId);

    const officer = await isCommitteeOfficer(user.id, meeting.committeeId);

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
      attendanceToken: officer || user.isAdmin ? meeting.attendanceToken : undefined,
      attendanceSheetUrl: meeting.attendanceSheetUrl,
      attendance: meeting.attendance.map((a) => ({
        userId: a.userId,
        fullName: a.user.fullName,
        email: a.user.email,
        department: a.user.department,
        method: a.method,
        markedAt: a.markedAt,
        note: a.note,
      })),
      createdBy: meeting.createdBy,
      createdAt: meeting.createdAt,
      minutes: meeting.minutes,
      actionPoints: meeting.actionPoints,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Check in via QR token or as authenticated officer (manual). */
async function attendanceCheckIn(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const meetingId = Number(req.params.meetingId);
    if (!Number.isInteger(meetingId)) throw Errors.badRequest("Invalid meeting id.");

    const body = (await req.json().catch(() => ({}))) as {
      token?: string;
      method?: "QR" | "MANUAL";
      userId?: number;
      note?: string;
    };

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw Errors.notFound("Meeting");

    const method = body.method === "MANUAL" ? "MANUAL" : "QR";
    if (method === "MANUAL") {
      await requireCommitteeOfficer(user, meeting.committeeId);
      const targetId = body.userId ?? user.id;
      const row = await markAttendance({
        meetingId,
        userId: targetId,
        method: "MANUAL",
        note: body.note,
      });
      return ok(row, 201);
    }

    const row = await markAttendance({
      meetingId,
      userId: user.id,
      method: "QR",
      token: body.token,
    });
    return ok(row, 201);
  } catch (err) {
    return errorResponse(err);
  }
}

async function attendanceSheetHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const meetingId = Number(req.params.meetingId);
    if (!Number.isInteger(meetingId)) throw Errors.badRequest("Invalid meeting id.");

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw Errors.notFound("Meeting");
    await requireCommitteeOfficer(user, meeting.committeeId);

    const body = (await req.json()) as { url?: string };
    if (!body.url?.trim()) throw Errors.badRequest("url is required.");

    const updated = await setAttendanceSheetUrl({
      meetingId,
      url: body.url.trim(),
      actorUserId: user.id,
    });
    return ok(updated);
  } catch (err) {
    return errorResponse(err);
  }
}

async function listAttendanceHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const meetingId = Number(req.params.meetingId);
    if (!Number.isInteger(meetingId)) throw Errors.badRequest("Invalid meeting id.");

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw Errors.notFound("Meeting");
    await requireViewCommittee(user, meeting.committeeId);

    return ok(await listAttendance(meetingId));
  } catch (err) {
    return errorResponse(err);
  }
}


/** Calendar feed: meetings for committees the caller belongs to (optional date range). */
async function listMyMeetings(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);

    const fromRaw = req.query.get("from");
    const toRaw = req.query.get("to");
    const from = fromRaw ? new Date(fromRaw) : undefined;
    const to = toRaw ? new Date(toRaw) : undefined;
    if (from && Number.isNaN(from.getTime())) throw Errors.badRequest("Invalid from date.");
    if (to && Number.isNaN(to.getTime())) throw Errors.badRequest("Invalid to date.");

    const memberships = await prisma.committeeMembership.findMany({
      where: { userId: user.id, active: true },
      select: { committeeId: true },
    });
    const committeeIds = memberships.map((m) => m.committeeId);

    if (committeeIds.length === 0) {
      return ok([]);
    }

    const meetings = await prisma.meeting.findMany({
      where: {
        committeeId: { in: committeeIds },
        ...(from || to
          ? {
              startsAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { startsAt: "asc" },
      include: {
        committee: { select: { id: true, name: true, code: true } },
        _count: { select: { attendance: true } },
      },
    });

    return ok(
      meetings.map((m) => ({
        id: m.id,
        reference: m.reference,
        title: m.title,
        startsAt: m.startsAt,
        endsAt: m.endsAt,
        venue: m.venue,
        agenda: m.agenda,
        teamsJoinUrl: m.teamsJoinUrl,
        attendanceCount: m._count.attendance,
        committee: m.committee,
      })),
    );
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

app.http("meetingAttendanceCheckIn", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "meetings/{meetingId}/attendance/check-in",
  handler: attendanceCheckIn,
});

app.http("meetingAttendanceSheet", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "meetings/{meetingId}/attendance/sheet",
  handler: attendanceSheetHandler,
});

app.http("meetingAttendanceList", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "meetings/{meetingId}/attendance",
  handler: listAttendanceHandler,
});

app.http("myMeetings", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "me/meetings",
  handler: listMyMeetings,
});

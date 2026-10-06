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
  recordMeetingOutcome,
} from "../services/meetingService";
import { tryProvisionTeamsForMeeting } from "../services/teamsMeetingService";
import { addMeetingPaper, listMeetingPapers, emailMeetingPapersToCommittee } from "../services/meetingPaperService";
import { EvidenceValidationError } from "../services/storageService";

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

    // Interactive create: delegated OnlineMeetings.ReadWrite (OBO or X-Graph-Access-Token).
    // Jobs/timers should call provisionTeamsForMeetingAsApplication instead.
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    const apiAccessToken =
      authHeader && authHeader.toLowerCase().startsWith("bearer ")
        ? authHeader.slice(7).trim()
        : null;
    const graphAccessToken =
      req.headers.get("x-graph-access-token") ??
      req.headers.get("X-Graph-Access-Token") ??
      (body as { graphAccessToken?: string }).graphAccessToken ??
      null;

    console.log(
      `[teams] HTTP createMeeting: meetingId=${meeting.id} teamsRequested=${teamsRequested} ` +
        `userId=${user.id} hasGraphHeader=${Boolean(graphAccessToken)} hasBearer=${Boolean(apiAccessToken)}`,
    );

    const teams = await tryProvisionTeamsForMeeting({
      meetingId: meeting.id,
      committeeId,
      title,
      startsAt,
      endsAt,
      createdById: user.id,
      agenda: body.agenda,
      teamsRequested,
      authMode: "delegated",
      apiAccessToken,
      graphAccessToken,
      allowApplicationFallback: true,
    });

    const joinUrl = teams.teamsJoinUrl ?? meeting.teamsJoinUrl ?? null;
    if (teamsRequested) {
      if (joinUrl) {
        console.log(
          `[teams] HTTP createMeeting RESULT success meetingId=${meeting.id} mode=${teams.authMode ?? "?"} joinUrl=yes`,
        );
      } else {
        console.error(
          `[teams] HTTP createMeeting RESULT failed meetingId=${meeting.id} attempted=${teams.attempted} error=${teams.error ?? "unknown"}`,
        );
      }
    } else {
      console.log(`[teams] HTTP createMeeting RESULT skipped (checkbox off) meetingId=${meeting.id}`);
    }

    return ok(
      {
        ...meeting,
        teamsEventId: teams.teamsEventId ?? meeting.teamsEventId,
        teamsJoinUrl: joinUrl,
        teamsProvisioned: Boolean(joinUrl),
        teamsOrganizer: teams.organizerUpn ?? null,
        teamsAuthMode: teams.authMode ?? null,
        teamsAttempted: Boolean(teamsRequested && teams.attempted),
        teamsError: teams.error ?? null,
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
          select: {
            id: true,
            status: true,
            filename: true,
            mediaType: true,
            sizeBytes: true,
            storageKey: true,
            createdAt: true,
                        createdBy: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        outcomeRecordedBy: { select: { id: true, fullName: true } },
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
      outcome: meeting.outcome,
      outcomeReason: meeting.outcomeReason,
      postponedTo: meeting.postponedTo,
      outcomeRecordedAt: meeting.outcomeRecordedAt,
      outcomeRecordedBy: meeting.outcomeRecordedBy,
      minutes: meeting.minutes.map((m) => ({
        id: m.id,
        status: m.status,
        filename: m.filename,
        mediaType: m.mediaType,
        sizeBytes: m.sizeBytes,
        hasFile: Boolean(m.storageKey),
        createdAt: m.createdAt,
        createdBy: m.createdBy,
      })),
      actionPoints: meeting.actionPoints,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

async function meetingOutcomeHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const meetingId = Number(req.params.meetingId);
    if (!Number.isInteger(meetingId)) throw Errors.badRequest("Invalid meeting id.");

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw Errors.notFound("Meeting");
    await requireCommitteeOfficer(user, meeting.committeeId);

    const body = (await req.json()) as {
      outcome?: "HELD" | "DID_NOT_HOLD" | "POSTPONED";
      reason?: string;
      postponedTo?: string;
      postponedEndsAt?: string;
    };
    if (!body.outcome || !["HELD", "DID_NOT_HOLD", "POSTPONED"].includes(body.outcome)) {
      throw Errors.badRequest("outcome must be HELD, DID_NOT_HOLD, or POSTPONED.");
    }

    const updated = await recordMeetingOutcome({
      meetingId,
      actorUserId: user.id,
      outcome: body.outcome,
      reason: body.reason ?? "",
      postponedTo: body.postponedTo ? new Date(body.postponedTo) : undefined,
      postponedEndsAt: body.postponedEndsAt ? new Date(body.postponedEndsAt) : undefined,
    });

    return ok(updated);
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

    // Platform admins see all meetings; others see committees they belong to
    // (plus committees they chair/secretarie as membership may lag).
    let committeeFilter: { committeeId?: { in: number[] } } = {};
    if (!user.isAdmin) {
      const memberships = await prisma.committeeMembership.findMany({
        where: { userId: user.id, active: true },
        select: { committeeId: true },
      });
      const officerCommittees = await prisma.committee.findMany({
        where: {
          OR: [
            { chairpersonId: user.id },
            { secretaryId: user.id },
            { centralRepId: user.id },
          ],
        },
        select: { id: true },
      });
      const committeeIds = [
        ...new Set([
          ...memberships.map((m) => m.committeeId),
          ...officerCommittees.map((c) => c.id),
        ]),
      ];
      if (committeeIds.length === 0) {
        return ok([]);
      }
      committeeFilter = { committeeId: { in: committeeIds } };
    }

    const meetings = await prisma.meeting.findMany({
      where: {
        ...committeeFilter,
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

app.http("meetingOutcome", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "meetings/{meetingId}/outcome",
  handler: meetingOutcomeHandler,
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

async function meetingPapersHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const meetingId = Number(req.params.meetingId);
    if (!Number.isInteger(meetingId)) throw Errors.badRequest("Invalid meeting id.");
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw Errors.notFound("Meeting");

    if (req.method === "GET") {
      await requireViewCommittee(user, meeting.committeeId);
      const papers = await listMeetingPapers(meetingId);
      return ok(papers);
    }

    await requireCommitteeOfficer(user, meeting.committeeId);
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") throw Errors.badRequest("A file field is required.");
    const buffer = Buffer.from(await file.arrayBuffer());
    const row = await addMeetingPaper({
      meetingId,
      actorUserId: user.id,
      filename: file.name,
      mediaType: file.type || "application/octet-stream",
      buffer,
    });
    return ok(row, 201);
  } catch (err) {
    if (err instanceof EvidenceValidationError) {
      return errorResponse(Errors.badRequest(err.message));
    }
    return errorResponse(err);
  }
}

async function meetingPapersNotifyHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return preflight();
  try {
    const user = await requireUser(req);
    const meetingId = Number(req.params.meetingId);
    if (!Number.isInteger(meetingId)) throw Errors.badRequest("Invalid meeting id.");
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw Errors.notFound("Meeting");
    await requireCommitteeOfficer(user, meeting.committeeId);
    const result = await emailMeetingPapersToCommittee(meetingId);
    return ok(result);
  } catch (err) {
    return errorResponse(err);
  }
}


app.http("meetingPapers", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "meetings/{meetingId}/papers",
  handler: meetingPapersHandler,
});

app.http("meetingPapersNotify", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "meetings/{meetingId}/papers/notify",
  handler: meetingPapersNotifyHandler,
});

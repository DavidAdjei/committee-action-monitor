/**
 * Microsoft Teams online meetings via Graph.
 *
 * Modes:
 * - **delegated** (interactive UI): OnlineMeetings.ReadWrite → POST /me/onlineMeetings
 * - **application** (jobs / timers / no user context): OnlineMeetings.ReadWrite.All
 *   → POST /users/{organizer}/onlineMeetings (+ Application Access Policy as required by tenant)
 */

import { prisma } from "../lib/prisma";
import { Errors } from "../lib/http";
import {
  graphEnv,
  graphFetch,
  isGraphAppConfigured,
  resolveDelegatedGraphToken,
} from "../lib/graphClient";

export type TeamsAuthMode = "delegated" | "application";

export type TeamsMeetingResult = {
  id: string;
  joinUrl: string;
  organizerUpn: string;
  authMode: TeamsAuthMode;
};

type GraphOnlineMeeting = {
  id?: string;
  joinWebUrl?: string;
  joinUrl?: string;
};

/** Structured Teams logs — always visible in Azure Functions / local terminal. */
function teamsLog(
  level: "info" | "warn" | "error",
  message: string,
  extra?: Record<string, unknown>,
): void {
  const line = extra
    ? `[teams] ${message} ${JSON.stringify(extra)}`
    : `[teams] ${message}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Resolve Graph user id / UPN for application-mode organizer.
 */
export async function resolveOrganizerIdentity(createdById: number): Promise<{
  graphUserPath: string;
  label: string;
} | null> {
  const creator = await prisma.user.findUnique({
    where: { id: createdById },
    select: { id: true, fullName: true, email: true, entraObjectId: true },
  });
  if (!creator) return null;

  if (creator.entraObjectId) {
    return {
      graphUserPath: `/users/${encodeURIComponent(creator.entraObjectId)}`,
      label: creator.email || creator.fullName,
    };
  }

  if (creator.email?.includes("@")) {
    return {
      graphUserPath: `/users/${encodeURIComponent(creator.email)}`,
      label: creator.email,
    };
  }

  const fallback = graphEnv("ENTRA_GRAPH_TEAMS_ORGANIZER", ["GRAPH_TEAMS_ORGANIZER"]) ?? null;
  if (fallback) {
    return {
      graphUserPath: `/users/${encodeURIComponent(fallback)}`,
      label: fallback,
    };
  }

  return null;
}

async function committeeAttendeeEmails(
  committeeId: number,
  excludeEmail?: string | null,
): Promise<string[]> {
  const committee = await prisma.committee.findUnique({
    where: { id: committeeId },
    select: {
      chairperson: { select: { email: true } },
      secretary: { select: { email: true } },
      centralRep: { select: { email: true } },
      memberships: {
        where: { active: true },
        select: { user: { select: { email: true } } },
      },
    },
  });
  if (!committee) return [];

  const set = new Set<string>();
  const add = (email: string | null | undefined) => {
    if (!email) return;
    const e = email.trim().toLowerCase();
    if (!e.includes("@")) return;
    if (excludeEmail && e === excludeEmail.trim().toLowerCase()) return;
    set.add(e);
  };

  add(committee.chairperson?.email);
  add(committee.secretary?.email);
  add(committee.centralRep?.email);
  for (const m of committee.memberships) add(m.user.email);

  return [...set];
}

/**
 * Graph onlineMeetings create body.
 * Keep this minimal — invalid participants (email as identity.id) often causes
 * opaque Graph error "1037: An error has occurred."
 * @see https://learn.microsoft.com/en-us/graph/api/application-post-onlinemeetings
 */
function toGraphDateTime(d: Date): string {
  // Graph accepts ISO-8601; prefer millisecond precision with Z (UTC)
  return d.toISOString();
}

function meetingPayload(params: {
  title: string;
  startsAt: Date;
  endsAt?: Date | null;
  agenda?: string | null;
  /** Reserved; attendees are not sent on create (avoids Graph 1037). Join URL is shared from CAM. */
  attendeeEmails?: string[];
}): Record<string, unknown> {
  let start = params.startsAt;
  let end =
    params.endsAt && params.endsAt > start
      ? params.endsAt
      : new Date(start.getTime() + 60 * 60 * 1000);

  // Graph rejects end <= start; also avoid sub-minute equal times
  if (end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }

  // Minimal payload only — subject + window window
  const body: Record<string, unknown> = {
    subject: (params.title || "Committee meeting").slice(0, 250),
    startDateTime: toGraphDateTime(start),
    endDateTime: toGraphDateTime(end),
  };

  return body;
}

/**
 * Interactive create: delegated OnlineMeetings.ReadWrite as the signed-in user.
 * Calls POST /me/onlineMeetings — no Application Access Policy required for the user themselves.
 */
export async function createTeamsOnlineMeetingDelegated(params: {
  committeeId: number;
  title: string;
  startsAt: Date;
  endsAt?: Date | null;
  createdById: number;
  agenda?: string | null;
  /** API bearer token (for OBO) and/or a Graph token with OnlineMeetings.ReadWrite */
  apiAccessToken?: string | null;
  graphAccessToken?: string | null;
}): Promise<TeamsMeetingResult> {
  teamsLog("info", "DELEGATED create START", {
    committeeId: params.committeeId,
    createdById: params.createdById,
    title: params.title,
    hasGraphToken: Boolean(params.graphAccessToken),
    hasApiToken: Boolean(params.apiAccessToken),
  });

  let accessToken: string;
  try {
    accessToken = await resolveDelegatedGraphToken({
      apiAccessToken: params.apiAccessToken,
      graphAccessToken: params.graphAccessToken,
    });
    teamsLog("info", "DELEGATED token resolved", {
      tokenSource: params.graphAccessToken ? "X-Graph-Access-Token" : "OBO",
      tokenLen: accessToken.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    teamsLog("error", "DELEGATED token FAILED", { error: msg.slice(0, 400) });
    throw err;
  }

  const creator = await prisma.user.findUnique({
    where: { id: params.createdById },
    select: { email: true, fullName: true },
  });
  const attendeeEmails = await committeeAttendeeEmails(params.committeeId, creator?.email);

  // Resolve Entra object IDs so participants.identity.user.id is a real GUID (email as id → Graph 1037)
  const dbUsers = attendeeEmails.length
    ? await prisma.user.findMany({
        where: {
          active: true,
          OR: attendeeEmails.map((e) => ({ email: { equals: e } })),
        },
        select: { email: true, fullName: true, entraObjectId: true },
      })
    : [];
  const byEmail = new Map(dbUsers.map((u) => [u.email.toLowerCase(), u]));

  const attendees: Array<{
    upn: string;
    role: string;
    identity?: { user: { id: string; displayName?: string } };
  }> = [];
  for (const email of attendeeEmails) {
    const u = byEmail.get(email.toLowerCase());
    if (u?.entraObjectId) {
      attendees.push({
        upn: email,
        role: "attendee",
        identity: {
          user: {
            id: u.entraObjectId,
            displayName: u.fullName || email,
          },
        },
      });
    } else {
      // UPN-only entry — Graph may still accept for known tenant users
      attendees.push({ upn: email, role: "attendee" });
    }
  }

  let start = params.startsAt;
  let end =
    params.endsAt && params.endsAt > start
      ? params.endsAt
      : new Date(start.getTime() + 60 * 60 * 1000);
  if (end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }

  const body: Record<string, unknown> = {
    subject: (params.title || "Committee meeting").slice(0, 250),
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
  };
  if (attendees.length > 0) {
    body.participants = { attendees };
  }

  teamsLog("info", "DELEGATED calling Graph POST /me/onlineMeetings", {
    subject: body.subject,
    startDateTime: body.startDateTime,
    endDateTime: body.endDateTime,
    attendeeCount: attendees.length,
    attendeesWithOid: attendees.filter((a) => a.identity?.user?.id).length,
  });

  const res = await graphFetch(`/me/onlineMeetings`, {
    method: "POST",
    body: JSON.stringify(body),
    accessToken,
  });

  if (!res.ok) {
    const errText = await res.text();
    teamsLog("error", "DELEGATED Graph response FAILED", {
      status: res.status,
      body: errText.slice(0, 500),
    });
    // Retry once without participants if Graph rejects the attendee shape
    if (attendees.length > 0 && (res.status === 400 || res.status === 403)) {
      teamsLog("warn", "DELEGATED retry without participants after attendee rejection");
      const minimal = {
        subject: body.subject,
        startDateTime: body.startDateTime,
        endDateTime: body.endDateTime,
      };
      const retry = await graphFetch(`/me/onlineMeetings`, {
        method: "POST",
        body: JSON.stringify(minimal),
        accessToken,
      });
      if (!retry.ok) {
        const retryText = await retry.text();
        teamsLog("error", "DELEGATED retry FAILED", {
          status: retry.status,
          body: retryText.slice(0, 500),
        });
        throw Errors.badRequest(
          `Teams online meeting (delegated) failed: ${retry.status} ${retryText.slice(0, 400)}. ` +
            `Ensure the user has a Teams license and OnlineMeetings.ReadWrite is consented.`,
        );
      }
      const retryJson = (await retry.json()) as GraphOnlineMeeting;
      const joinUrl = retryJson.joinWebUrl || retryJson.joinUrl;
      if (!retryJson.id || !joinUrl) {
        throw Errors.badRequest("Graph returned an online meeting without id or join URL.");
      }
      teamsLog("info", "DELEGATED create SUCCESS (no participants on meeting object)", {
        onlineMeetingId: retryJson.id,
        organizer: creator?.email || creator?.fullName || "me",
        joinUrlPrefix: joinUrl.slice(0, 60),
      });
      return {
        id: retryJson.id,
        joinUrl,
        organizerUpn: creator?.email || creator?.fullName || "me",
        authMode: "delegated",
      };
    }
    throw Errors.badRequest(
      `Teams online meeting (delegated) failed: ${res.status} ${errText.slice(0, 400)}. ` +
        `Ensure the user has a Teams license and OnlineMeetings.ReadWrite is consented.`,
    );
  }

  const json = (await res.json()) as GraphOnlineMeeting;
  const joinUrl = json.joinWebUrl || json.joinUrl;
  if (!json.id || !joinUrl) {
    teamsLog("error", "DELEGATED Graph response missing id/joinUrl", { jsonKeys: Object.keys(json) });
    throw Errors.badRequest("Graph returned an online meeting without id or join URL.");
  }

  teamsLog("info", "DELEGATED create SUCCESS", {
    onlineMeetingId: json.id,
    organizer: creator?.email || creator?.fullName || "me",
    attendeeCount: attendees.length,
    joinUrlPrefix: joinUrl.slice(0, 60),
  });

  return {
    id: json.id,
    joinUrl,
    organizerUpn: creator?.email || creator?.fullName || "me",
    authMode: "delegated",
  };
}

/**
 * Background / job create: application OnlineMeetings.ReadWrite.All.
 * Calls POST /users/{organizer}/onlineMeetings — may require Application Access Policy.
 */
export async function createTeamsOnlineMeetingApplication(params: {
  committeeId: number;
  title: string;
  startsAt: Date;
  endsAt?: Date | null;
  createdById: number;
  agenda?: string | null;
}): Promise<TeamsMeetingResult> {
  teamsLog("info", "APPLICATION create START", {
    committeeId: params.committeeId,
    createdById: params.createdById,
    title: params.title,
    graphConfigured: isGraphAppConfigured(),
  });

  if (!isGraphAppConfigured()) {
    teamsLog("error", "APPLICATION create FAILED — Graph app credentials missing");
    throw Errors.badRequest(
      "Teams integration is not configured (Graph app credentials missing).",
    );
  }

  const organizer = await resolveOrganizerIdentity(params.createdById);
  if (!organizer) {
    teamsLog("error", "APPLICATION create FAILED — no organizer identity", {
      createdById: params.createdById,
    });
    throw Errors.badRequest(
      "Cannot create a Teams meeting (application): the organizer has no Entra identity linked, " +
        "and ENTRA_GRAPH_TEAMS_ORGANIZER is not set.",
    );
  }

  const creator = await prisma.user.findUnique({
    where: { id: params.createdById },
    select: { email: true },
  });
  const attendeeEmails = await committeeAttendeeEmails(params.committeeId, creator?.email);
  const body = meetingPayload({
    title: params.title,
    startsAt: params.startsAt,
    endsAt: params.endsAt,
    agenda: params.agenda,
    attendeeEmails,
  });

  teamsLog("info", "APPLICATION calling Graph POST onlineMeetings", {
    path: `${organizer.graphUserPath}/onlineMeetings`,
    organizer: organizer.label,
  });

  const res = await graphFetch(`${organizer.graphUserPath}/onlineMeetings`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    teamsLog("error", "APPLICATION Graph response FAILED", {
      status: res.status,
      organizer: organizer.label,
      body: errText.slice(0, 500),
    });
    throw Errors.badRequest(
      `Teams online meeting (application) failed: ${res.status} ${errText.slice(0, 400)}. ` +
        `Organizer: ${organizer.label}. ` +
        `Ensure OnlineMeetings.ReadWrite.All is granted and an Application Access Policy allows this app on the organizer.`,
    );
  }

  const json = (await res.json()) as GraphOnlineMeeting;
  const joinUrl = json.joinWebUrl || json.joinUrl;
  if (!json.id || !joinUrl) {
    teamsLog("error", "APPLICATION Graph response missing id/joinUrl", { jsonKeys: Object.keys(json) });
    throw Errors.badRequest("Graph returned an online meeting without id or join URL.");
  }

  teamsLog("info", "APPLICATION create SUCCESS", {
    onlineMeetingId: json.id,
    organizer: organizer.label,
    joinUrlPrefix: joinUrl.slice(0, 60),
  });

  return {
    id: json.id,
    joinUrl,
    organizerUpn: organizer.label,
    authMode: "application",
  };
}

/** @deprecated Prefer createTeamsOnlineMeetingApplication or Delegated */
export async function createTeamsOnlineMeeting(params: {
  committeeId: number;
  title: string;
  startsAt: Date;
  endsAt?: Date | null;
  createdById: number;
  agenda?: string | null;
}): Promise<TeamsMeetingResult> {
  return createTeamsOnlineMeetingApplication(params);
}

/**
 * Interactive HTTP create: prefer delegated, optional fallback to application.
 */
export async function tryProvisionTeamsForMeeting(params: {
  meetingId: number;
  committeeId: number;
  title: string;
  startsAt: Date;
  endsAt?: Date | null;
  createdById: number;
  agenda?: string | null;
  teamsRequested: boolean;
  /** Prefer delegated when the user is creating the meeting in the UI */
  authMode?: TeamsAuthMode;
  apiAccessToken?: string | null;
  graphAccessToken?: string | null;
  /** If delegated fails, try application (default true for resilience) */
  allowApplicationFallback?: boolean;
}): Promise<{
  teamsEventId: string;
  teamsJoinUrl: string;
  organizerUpn: string;
  authMode: TeamsAuthMode;
  attempted: true;
  error?: undefined;
} | {
  attempted: boolean;
  error: string | null;
  teamsEventId?: undefined;
  teamsJoinUrl?: undefined;
  organizerUpn?: undefined;
  authMode?: undefined;
}> {
  if (!params.teamsRequested) {
    teamsLog("info", "PROVISION SKIPPED — teamsRequested=false", { meetingId: params.meetingId });
    return { attempted: false, error: null };
  }

  teamsLog("info", "PROVISION START", {
    meetingId: params.meetingId,
    mode: params.authMode ?? "delegated",
    teamsRequested: params.teamsRequested,
    hasGraphToken: Boolean(params.graphAccessToken),
    hasApiToken: Boolean(params.apiAccessToken),
    graphAppConfigured: isGraphAppConfigured(),
    title: params.title,
  });

  const mode: TeamsAuthMode = params.authMode ?? "delegated";
  const allowFallback = params.allowApplicationFallback !== false;
  let lastError = "";

  try {
    let result: TeamsMeetingResult;

    if (mode === "delegated") {
      try {
        result = await createTeamsOnlineMeetingDelegated({
          committeeId: params.committeeId,
          title: params.title,
          startsAt: params.startsAt,
          endsAt: params.endsAt,
          createdById: params.createdById,
          agenda: params.agenda,
          apiAccessToken: params.apiAccessToken,
          graphAccessToken: params.graphAccessToken,
        });
      } catch (delegatedErr) {
        lastError = delegatedErr instanceof Error ? delegatedErr.message : String(delegatedErr);
        teamsLog("warn", "PROVISION delegated step FAILED", {
          meetingId: params.meetingId,
          error: lastError.slice(0, 400),
        });
        if (!allowFallback || !isGraphAppConfigured()) {
          return { attempted: true, error: lastError.slice(0, 500) };
        }
        teamsLog("info", "PROVISION trying APPLICATION fallback", { meetingId: params.meetingId });
        try {
          result = await createTeamsOnlineMeetingApplication({
            committeeId: params.committeeId,
            title: params.title,
            startsAt: params.startsAt,
            endsAt: params.endsAt,
            createdById: params.createdById,
            agenda: params.agenda,
          });
        } catch (appErr) {
          const appMsg = appErr instanceof Error ? appErr.message : String(appErr);
          lastError = `Delegated: ${lastError} | Application: ${appMsg}`;
          teamsLog("error", "PROVISION application fallback FAILED", {
            meetingId: params.meetingId,
            error: appMsg.slice(0, 400),
          });
          return { attempted: true, error: lastError.slice(0, 500) };
        }
      }
    } else {
      if (!isGraphAppConfigured()) {
        lastError =
          "Teams application mode requires ENTRA_GRAPH_TENANT_ID, CLIENT_ID, and CLIENT_SECRET on the API.";
        teamsLog("error", "PROVISION aborted", { meetingId: params.meetingId, error: lastError });
        return { attempted: true, error: lastError };
      }
      result = await createTeamsOnlineMeetingApplication({
        committeeId: params.committeeId,
        title: params.title,
        startsAt: params.startsAt,
        endsAt: params.endsAt,
        createdById: params.createdById,
        agenda: params.agenda,
      });
    }

    await prisma.meeting.update({
      where: { id: params.meetingId },
      data: {
        teamsEventId: result.id,
        teamsJoinUrl: result.joinUrl,
      },
    });

    teamsLog("info", "PROVISION SUCCESS", {
      meetingId: params.meetingId,
      authMode: result.authMode,
      organizer: result.organizerUpn,
      onlineMeetingId: result.id,
      joinUrlPrefix: result.joinUrl.slice(0, 60),
    });

    return {
      teamsEventId: result.id,
      teamsJoinUrl: result.joinUrl,
      organizerUpn: result.organizerUpn,
      authMode: result.authMode,
      attempted: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    teamsLog("error", "PROVISION FAILED", { meetingId: params.meetingId, error: msg.slice(0, 400) });
    return { attempted: true, error: msg.slice(0, 500) };
  }
}

/**
 * Job/timer path: always application permissions.
 */
export async function provisionTeamsForMeetingAsApplication(params: {
  meetingId: number;
  committeeId: number;
  title: string;
  startsAt: Date;
  endsAt?: Date | null;
  createdById: number;
  agenda?: string | null;
}): Promise<{
  teamsEventId: string;
  teamsJoinUrl: string;
  organizerUpn: string;
  authMode: "application";
} | null> {
  const result = await tryProvisionTeamsForMeeting({
    ...params,
    teamsRequested: true,
    authMode: "application",
    allowApplicationFallback: false,
  });
  if (!result.teamsJoinUrl || !result.teamsEventId) return null;
  return {
    teamsEventId: result.teamsEventId,
    teamsJoinUrl: result.teamsJoinUrl,
    organizerUpn: result.organizerUpn!,
    authMode: "application",
  };
}

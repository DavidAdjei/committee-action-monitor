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

function meetingPayload(params: {
  title: string;
  startsAt: Date;
  endsAt?: Date | null;
  agenda?: string | null;
  attendeeEmails?: string[];
}): Record<string, unknown> {
  const end =
    params.endsAt && params.endsAt > params.startsAt
      ? params.endsAt
      : new Date(params.startsAt.getTime() + 60 * 60 * 1000);

  const body: Record<string, unknown> = {
    subject: params.title,
    startDateTime: params.startsAt.toISOString(),
    endDateTime: end.toISOString(),
  };

  if (params.attendeeEmails && params.attendeeEmails.length > 0) {
    body.participants = {
      attendees: params.attendeeEmails.map((upn) => ({
        upn,
        role: "attendee",
        identity: { user: { id: upn } },
      })),
    };
  }

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
  const accessToken = await resolveDelegatedGraphToken({
    apiAccessToken: params.apiAccessToken,
    graphAccessToken: params.graphAccessToken,
  });

  const creator = await prisma.user.findUnique({
    where: { id: params.createdById },
    select: { email: true, fullName: true },
  });
  const attendeeEmails = await committeeAttendeeEmails(params.committeeId, creator?.email);
  const body = meetingPayload({
    title: params.title,
    startsAt: params.startsAt,
    endsAt: params.endsAt,
    agenda: params.agenda,
    attendeeEmails,
  });

  const res = await graphFetch(`/me/onlineMeetings`, {
    method: "POST",
    body: JSON.stringify(body),
    accessToken,
  });

  if (!res.ok) {
    const t = await res.text();
    throw Errors.badRequest(
      `Teams online meeting (delegated) failed: ${res.status} ${t.slice(0, 400)}. ` +
        `Ensure the user has a Teams license and OnlineMeetings.ReadWrite is consented.`,
    );
  }

  const json = (await res.json()) as GraphOnlineMeeting;
  const joinUrl = json.joinWebUrl || json.joinUrl;
  if (!json.id || !joinUrl) {
    throw Errors.badRequest("Graph returned an online meeting without id or join URL.");
  }

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
  if (!isGraphAppConfigured()) {
    throw Errors.badRequest(
      "Teams integration is not configured (Graph app credentials missing).",
    );
  }

  const organizer = await resolveOrganizerIdentity(params.createdById);
  if (!organizer) {
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

  const res = await graphFetch(`${organizer.graphUserPath}/onlineMeetings`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw Errors.badRequest(
      `Teams online meeting (application) failed: ${res.status} ${t.slice(0, 400)}. ` +
        `Organizer: ${organizer.label}. ` +
        `Ensure OnlineMeetings.ReadWrite.All is granted and an Application Access Policy allows this app on the organizer.`,
    );
  }

  const json = (await res.json()) as GraphOnlineMeeting;
  const joinUrl = json.joinWebUrl || json.joinUrl;
  if (!json.id || !joinUrl) {
    throw Errors.badRequest("Graph returned an online meeting without id or join URL.");
  }

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
} | null> {
  if (!params.teamsRequested) return null;

  const mode: TeamsAuthMode = params.authMode ?? "delegated";
  const allowFallback = params.allowApplicationFallback !== false;

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
        if (!allowFallback || !isGraphAppConfigured()) throw delegatedErr;
        console.warn(
          `[teams] Meeting ${params.meetingId}: delegated provision failed, trying application — ` +
            (delegatedErr instanceof Error ? delegatedErr.message : String(delegatedErr)),
        );
        result = await createTeamsOnlineMeetingApplication({
          committeeId: params.committeeId,
          title: params.title,
          startsAt: params.startsAt,
          endsAt: params.endsAt,
          createdById: params.createdById,
          agenda: params.agenda,
        });
      }
    } else {
      if (!isGraphAppConfigured()) {
        console.warn(
          `[teams] Meeting ${params.meetingId}: application mode but Graph is not configured.`,
        );
        return null;
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

    return {
      teamsEventId: result.id,
      teamsJoinUrl: result.joinUrl,
      organizerUpn: result.organizerUpn,
      authMode: result.authMode,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[teams] Meeting ${params.meetingId}: provision failed — ${msg}`);
    return null;
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
  return tryProvisionTeamsForMeeting({
    ...params,
    teamsRequested: true,
    authMode: "application",
    allowApplicationFallback: false,
  }) as Promise<{
    teamsEventId: string;
    teamsJoinUrl: string;
    organizerUpn: string;
    authMode: "application";
  } | null>;
}

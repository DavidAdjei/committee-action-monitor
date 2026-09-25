/**
 * Create Microsoft Teams online meetings via Graph (application permissions).
 *
 * Required: OnlineMeetings.ReadWrite.All (Application) + admin consent.
 * Organizer is the meeting creator when they have an Entra identity;
 * optional fallback: ENTRA_GRAPH_TEAMS_ORGANIZER (UPN or email of a licensed mailbox).
 */

import { prisma } from "../lib/prisma";
import { Errors } from "../lib/http";
import { graphEnv, graphFetch, isGraphAppConfigured } from "../lib/graphClient";

export type TeamsMeetingResult = {
  id: string;
  joinUrl: string;
  organizerUpn: string;
};

type GraphOnlineMeeting = {
  id?: string;
  joinWebUrl?: string;
  joinUrl?: string;
};

/**
 * Resolve Graph user id / UPN for the organizer.
 * Prefer creator's entraObjectId, then email; else shared fallback mailbox.
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

  const fallback =
    graphEnv("ENTRA_GRAPH_TEAMS_ORGANIZER", ["GRAPH_TEAMS_ORGANIZER"]) ?? null;
  if (fallback) {
    return {
      graphUserPath: `/users/${encodeURIComponent(fallback)}`,
      label: fallback,
    };
  }

  return null;
}

/**
 * Collect attendee emails for the committee (members + officers).
 */
async function committeeAttendeeEmails(committeeId: number, excludeEmail?: string | null): Promise<string[]> {
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
 * Create a Teams online meeting under the organizer's identity.
 * Does not throw for non-config cases when optional — caller decides.
 */
export async function createTeamsOnlineMeeting(params: {
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
      "Cannot create a Teams meeting: the creator has no Entra identity linked, " +
        "and ENTRA_GRAPH_TEAMS_ORGANIZER is not set.",
    );
  }

  const end =
    params.endsAt && params.endsAt > params.startsAt
      ? params.endsAt
      : new Date(params.startsAt.getTime() + 60 * 60 * 1000);

  const creator = await prisma.user.findUnique({
    where: { id: params.createdById },
    select: { email: true },
  });
  const attendeeEmails = await committeeAttendeeEmails(params.committeeId, creator?.email);

  const body = {
    subject: params.title,
    startDateTime: params.startsAt.toISOString(),
    endDateTime: end.toISOString(),
    participants: {
      attendees: attendeeEmails.map((upn) => ({
        identity: {
          user: {
            // Graph accepts id or UPN in various shapes; upn is reliable for bank tenants
            id: upn,
          },
        },
        upn,
        role: "attendee",
      })),
    },
    // Optional description from agenda
    ...(params.agenda
      ? {
          // onlineMeeting supports lobbyBypassSettings etc.; body is not always applied —
          // subject + times are the critical fields for join URL.
        }
      : {}),
  };

  // Prefer simpler payload — Graph onlineMeetings attendees shape varies by API version.
  // Minimal reliable payload:
  const minimalBody: Record<string, unknown> = {
    subject: params.title,
    startDateTime: params.startsAt.toISOString(),
    endDateTime: end.toISOString(),
  };

  // Include attendees when we have emails (best-effort; Graph may ignore unknown users)
  if (attendeeEmails.length > 0) {
    minimalBody.participants = {
      attendees: attendeeEmails.map((email) => ({
        upn: email,
        role: "attendee",
      })),
    };
  }

  void body; // reserved if we expand later

  const res = await graphFetch(`${organizer.graphUserPath}/onlineMeetings`, {
    method: "POST",
    body: JSON.stringify(minimalBody),
  });

  if (!res.ok) {
    const t = await res.text();
    throw Errors.badRequest(
      `Teams online meeting creation failed: ${res.status} ${t.slice(0, 400)}. ` +
        `Organizer: ${organizer.label}. ` +
        `Ensure OnlineMeetings.ReadWrite.All is granted and the organizer has a Teams license.`,
    );
  }

  const json = (await res.json()) as GraphOnlineMeeting;
  const joinUrl = json.joinWebUrl || json.joinUrl;
  if (!json.id || !joinUrl) {
    throw Errors.badRequest("Graph online meeting response missing id or joinWebUrl.");
  }

  return {
    id: json.id,
    joinUrl,
    organizerUpn: organizer.label,
  };
}

/**
 * Best-effort Teams provision: never fails the parent meeting create.
 * Returns null if Teams was not requested, not configured, or Graph failed.
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
}): Promise<{ teamsEventId: string; teamsJoinUrl: string; organizerUpn: string } | null> {
  if (!params.teamsRequested) return null;
  if (!isGraphAppConfigured()) {
    console.warn(
      `[teams] Meeting ${params.meetingId}: teamsRequested but Graph is not configured; join URL not created.`,
    );
    return null;
  }

  try {
    const result = await createTeamsOnlineMeeting({
      committeeId: params.committeeId,
      title: params.title,
      startsAt: params.startsAt,
      endsAt: params.endsAt,
      createdById: params.createdById,
      agenda: params.agenda,
    });

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
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[teams] Meeting ${params.meetingId}: provision failed — ${msg}`);
    return null;
  }
}

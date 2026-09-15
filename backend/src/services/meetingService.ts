import { prisma } from "../lib/prisma";
import { Errors } from "../lib/http";
import { auditRow } from "./auditService";

export interface CreateMeetingInput {
  committeeId: number;
  reference?: string;
  title: string;
  startsAt: Date;
  endsAt?: Date;
  venue?: string;
  agenda?: string;
  teamsRequested?: boolean;
  createdById: number;
}

/**
 * Generates an institutional meeting reference on the backend, e.g. MIN/ISC/09/26.
 * If multiple meetings happen in the same month/year for that committee, sequentially
 * appends a suffix, e.g. MIN/ISC/09/26-02.
 */
export async function generateMeetingReference(
  committeeId: number,
  startsAt: Date,
  dbClient: typeof prisma | any = prisma,
): Promise<string> {
  const committee = await dbClient.committee.findUnique({
    where: { id: committeeId },
    select: { code: true },
  });
  const code = committee?.code ? committee.code.trim().toUpperCase() : "MTG";
  const month = String(startsAt.getMonth() + 1).padStart(2, "0");
  const year = String(startsAt.getFullYear()).slice(-2);
  const baseRef = `MIN/${code}/${month}/${year}`;

  const existingCount = await dbClient.meeting.count({
    where: {
      committeeId,
      reference: { startsWith: baseRef },
    },
  });

  let ref = existingCount === 0 ? baseRef : `${baseRef}-${String(existingCount + 1).padStart(2, "0")}`;
  let attempts = 0;
  while (await dbClient.meeting.findFirst({ where: { committeeId, reference: ref } })) {
    attempts++;
    ref = `${baseRef}-${String(existingCount + 1 + attempts).padStart(2, "0")}`;
  }

  return ref;
}

/**
 * Mirrors "Create a meeting": the caller's officer status for this committee
 * must already have been checked by requireCommitteeOfficer() before this
 * runs. If reference is not provided, it is automatically generated on the backend.
 * If Teams is requested, the Graph call to create the online meeting
 * is a separate integration step (see services/graphService.ts).
 */
export async function createMeeting(input: CreateMeetingInput) {
  return prisma.$transaction(async (tx) => {
    const reference =
      input.reference && input.reference.trim().length > 0 && input.reference.trim().toLowerCase() !== "auto"
        ? input.reference.trim()
        : await generateMeetingReference(input.committeeId, input.startsAt, tx);

    const existing = await tx.meeting.findFirst({
      where: { committeeId: input.committeeId, reference },
    });
    if (existing) {
      throw Errors.conflict("A meeting with this reference already exists for this committee.");
    }

    const meeting = await tx.meeting.create({
      data: {
        committeeId: input.committeeId,
        reference,
        title: input.title,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        venue: input.venue,
        agenda: input.agenda,
        teamsRequested: input.teamsRequested ?? false,
        createdById: input.createdById,
      },
    });

    await tx.auditEvent.create({
      data: auditRow({
        actorUserId: input.createdById,
        action: "meeting.create",
        resourceType: "meeting",
        resourceId: meeting.id,
        committeeId: input.committeeId,
        after: { reference, title: input.title },
        result: "SUCCESS",
      }),
    });

    return meeting;
  });
}

/** Attach the Microsoft Graph online-meeting result once the integration worker completes it. */
export async function attachTeamsEvent(meetingId: number, teamsEventId: string, teamsJoinUrl: string) {
  return prisma.meeting.update({
    where: { id: meetingId },
    data: { teamsEventId, teamsJoinUrl },
  });
}

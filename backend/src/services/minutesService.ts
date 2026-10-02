/**
 * Minutes read helpers (import + document upload own the write path).
 */
import { prisma } from "../lib/prisma";
import { Errors } from "../lib/http";

export async function getMinutesDetail(minutesId: number) {
  const minutes = await prisma.meetingMinutes.findUnique({
    where: { id: minutesId },
    include: {
      meeting: true,
      createdBy: true,
      snapshots: {
        include: {
          actionPoint: {
            include: { owner: true },
          },
        },
      },
    },
  });
  if (!minutes) throw Errors.notFound("Minutes");
  return serializeMinutesDetail(minutes);
}

export function serializeMinutesDetail(minutes: {
  id: number;
  meetingId: number;
  status: string;
  discussion: string | null;
  storageKey?: string | null;
  filename?: string | null;
  mediaType?: string | null;
  sizeBytes?: number | null;
  createdById: number;
  createdAt: Date;
  meeting: { id: number; title: string; reference: string; startsAt: Date; committeeId: number };
  createdBy: { id: number; fullName: string };
  snapshots: {
    minutesId: number;
    actionPointId: number;
    sourceMeetingId: number | null;
    actionStatus: string;
    progressPercent: number;
    ownerRemarks: string | null;
    capturedAt: Date;
    actionPoint: {
      id: number;
      referenceNo: string;
      title: string;
      owner: { id: number; fullName: string };
    };
  }[];
}) {
  return {
    id: minutes.id,
    meetingId: minutes.meetingId,
    status: minutes.status,
    discussion: minutes.discussion,
    filename: minutes.filename ?? null,
    mediaType: minutes.mediaType ?? null,
    sizeBytes: minutes.sizeBytes ?? null,
    hasFile: Boolean(minutes.storageKey),
    createdBy: { id: minutes.createdBy.id, fullName: minutes.createdBy.fullName },
    createdAt: minutes.createdAt,
    meeting: {
      id: minutes.meeting.id,
      title: minutes.meeting.title,
      reference: minutes.meeting.reference,
      startsAt: minutes.meeting.startsAt,
      committeeId: minutes.meeting.committeeId,
    },
    snapshots: minutes.snapshots.map((s) => ({
      actionPointId: s.actionPointId,
      referenceNo: s.actionPoint.referenceNo,
      title: s.actionPoint.title,
      owner: { id: s.actionPoint.owner.id, fullName: s.actionPoint.owner.fullName },
      actionStatus: s.actionStatus,
      progressPercent: s.progressPercent,
      ownerRemarks: s.ownerRemarks,
      capturedAt: s.capturedAt,
      sourceMeetingId: s.sourceMeetingId,
    })),
  };
}

export async function listMinutesForMeeting(meetingId: number) {
  const rows = await prisma.meetingMinutes.findMany({
    where: { meetingId },
    include: {
      createdBy: true,
      meeting: true,
      snapshots: {
        include: {
          actionPoint: { include: { owner: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeMinutesDetail);
}

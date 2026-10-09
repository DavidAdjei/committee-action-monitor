/**
 * Upload-centric minutes documents: one DRAFT and one FINAL per meeting.
 * Draft accepts Word or PDF; final accepts PDF only.
 */
import path from "path";
import { prisma } from "../lib/prisma";
import { Errors } from "../lib/http";
import { storeEvidenceFile, readEvidenceFile } from "./storageService";
import { auditRow } from "./auditService";
import { triggerEmailDispatchAsync } from "./notificationService";

const DRAFT_EXTS = [".pdf", ".doc", ".docx"];
const FINAL_EXTS = [".pdf"];

function extOf(filename: string) {
  return path.extname(filename).toLowerCase();
}

export async function uploadMinutesDocument(params: {
  meetingId: number;
  actorUserId: number;
  status: "DRAFT" | "FINAL";
  filename: string;
  mediaType: string;
  buffer: Buffer;
  discussion?: string;
  /** When true, queue MINUTES_ISSUED to committee members (email + in-app) */
  notifyMinutesIssued?: boolean;
}) {
  const meeting = await prisma.meeting.findUnique({ where: { id: params.meetingId } });
  if (!meeting) throw Errors.notFound("Meeting");

  const ext = extOf(params.filename);
  if (params.status === "FINAL" && !FINAL_EXTS.includes(ext)) {
    throw Errors.badRequest("Final minutes must be a PDF file.");
  }
  if (params.status === "DRAFT" && !DRAFT_EXTS.includes(ext)) {
    throw Errors.badRequest("Draft minutes must be a Word (.doc/.docx) or PDF file.");
  }

  const stored = await storeEvidenceFile({
    filename: params.filename,
    mediaType: params.mediaType,
    buffer: params.buffer,
  });

  // Replace existing draft/final of the same status for this meeting
  const existing = await prisma.meetingMinutes.findFirst({
    where: { meetingId: params.meetingId, status: params.status },
  });

  const data = {
    discussion: params.discussion?.trim() || null,
    storageKey: stored.storageKey,
    filename: params.filename,
    mediaType: params.mediaType || (ext === ".pdf" ? "application/pdf" : "application/octet-stream"),
    sizeBytes: stored.sizeBytes,
    createdById: params.actorUserId,
  };

  let row;
  if (existing) {
    row = await prisma.meetingMinutes.update({
      where: { id: existing.id },
      data,
      include: {
        createdBy: { select: { id: true, fullName: true } },
        meeting: { select: { id: true, title: true, reference: true, startsAt: true, committeeId: true } },
      },
    });
  } else {
    row = await prisma.meetingMinutes.create({
      data: {
        meetingId: params.meetingId,
        status: params.status,
        ...data,
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        meeting: { select: { id: true, title: true, reference: true, startsAt: true, committeeId: true } },
      },
    });
  }

  await prisma.auditEvent.create({
    data: auditRow({
      actorUserId: params.actorUserId,
      action: params.status === "FINAL" ? "minutes.upload_final" : "minutes.upload_draft",
      resourceType: "meeting_minutes",
      resourceId: row.id,
      committeeId: meeting.committeeId,
      after: {
        status: params.status,
        filename: params.filename,
        notifyMinutesIssued: Boolean(params.notifyMinutesIssued),
      },
      result: "SUCCESS",
    }),
  });

  if (params.notifyMinutesIssued) {
    await queueMinutesIssuedNotifications({
      meetingId: params.meetingId,
      committeeId: meeting.committeeId,
      minutesId: row.id,
      status: params.status,
    });
    triggerEmailDispatchAsync();
  }

  return row;
}

async function queueMinutesIssuedNotifications(params: {
  meetingId: number;
  committeeId: number;
  minutesId: number;
  status: "DRAFT" | "FINAL";
}) {
  const committee = await prisma.committee.findUnique({
    where: { id: params.committeeId },
    include: {
      memberships: { where: { active: true }, select: { userId: true } },
    },
  });
  if (!committee) return;

  const recipientIds = new Set<number>();
  recipientIds.add(committee.chairpersonId);
  recipientIds.add(committee.secretaryId);
  if (committee.centralRepId) recipientIds.add(committee.centralRepId);
  for (const m of committee.memberships) recipientIds.add(m.userId);

  const day = new Date().toISOString().slice(0, 10);
  const kind = params.status.toLowerCase();
  const rows = [];
  for (const recipientId of recipientIds) {
    for (const channel of ["EMAIL", "IN_APP"] as const) {
      rows.push({
        actionPointId: null as number | null,
        recipientId,
        channel,
        notificationType: "MINUTES_ISSUED" as const,
        idempotencyKey: `minutes:${params.minutesId}:${params.status}:${channel}:${recipientId}:${day}`,
        scheduledFor: new Date(),
      });
    }
  }
  if (rows.length === 0) return;
  await prisma.notification.createMany({ data: rows, skipDuplicates: true });
}

export async function downloadMinutesDocument(minutesId: number) {
  const row = await prisma.meetingMinutes.findUnique({ where: { id: minutesId } });
  if (!row) throw Errors.notFound("Minutes");
  if (!row.storageKey) {
    throw Errors.badRequest("This minutes record has no uploaded file to download.");
  }
  const buffer = await readEvidenceFile(row.storageKey);
  return {
    buffer,
    filename: row.filename || `minutes-${minutesId}.pdf`,
    contentType: row.mediaType || "application/octet-stream",
  };
}

export async function listMinutesDocumentsForMeeting(meetingId: number) {
  return prisma.meetingMinutes.findMany({
    where: { meetingId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      createdBy: { select: { id: true, fullName: true } },
    },
  });
}

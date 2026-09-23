import { prisma } from "../lib/prisma";
import { Errors } from "../lib/http";
import { auditRow } from "./auditService";
import { buildActionNotifications } from "./notificationService";
import { isCentralMember } from "../lib/authorize";
import type { User } from "@prisma/client";

/**
 * Central Committee may post oversight comments on any action.
 * Recipients: committee secretary + all ACTION_OWNER stakeholders (incl. primary owner).
 */
export async function addActionComment(params: {
  actionPointId: number;
  author: User;
  body: string;
}) {
  const body = params.body?.trim();
  if (!body || body.length < 2) {
    throw Errors.badRequest("Comment body is required.");
  }
  if (body.length > 4000) {
    throw Errors.badRequest("Comment is too long (max 4000 characters).");
  }
  if (!isCentralMember(params.author)) {
    throw Errors.forbidden("Only Central Committee members may comment on action points.");
  }

  const action = await prisma.actionPoint.findUnique({
    where: { id: params.actionPointId },
    include: {
      committee: { select: { id: true, secretaryId: true, name: true, code: true } },
      stakeholders: {
        where: { stakeholderType: "ACTION_OWNER" },
        select: { userId: true },
      },
      owner: { select: { id: true } },
    },
  });
  if (!action) throw Errors.notFound("Action point");

  const recipientIds = new Set<number>();
  recipientIds.add(action.committee.secretaryId);
  recipientIds.add(action.ownerId);
  for (const s of action.stakeholders) recipientIds.add(s.userId);
  // Don't notify the author
  recipientIds.delete(params.author.id);

  const comment = await prisma.$transaction(async (tx) => {
    const row = await tx.actionComment.create({
      data: {
        actionPointId: params.actionPointId,
        authorId: params.author.id,
        body,
      },
      include: {
        author: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (recipientIds.size > 0) {
      await tx.notification.createMany({
        data: buildActionNotifications({
          actionPointId: params.actionPointId,
          recipientIds: [...recipientIds],
          notificationType: "ACTION_COMMENT",
          // Unique per comment so multiple comments notify again
          idempotencyPrefix: `action-comment:${row.id}`,
        }),
        skipDuplicates: true,
      });
    }

    await tx.auditEvent.create({
      data: auditRow({
        actorUserId: params.author.id,
        action: "action_point.comment",
        resourceType: "action_point",
        resourceId: params.actionPointId,
        committeeId: action.committeeId,
        actionPointId: params.actionPointId,
        after: { commentId: row.id, recipientCount: recipientIds.size },
        result: "SUCCESS",
      }),
    });

    return row;
  });

  return comment;
}

export async function listActionComments(actionPointId: number) {
  return prisma.actionComment.findMany({
    where: { actionPointId },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, fullName: true, email: true } },
    },
  });
}

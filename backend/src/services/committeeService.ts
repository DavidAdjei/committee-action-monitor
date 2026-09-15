import { prisma } from "../lib/prisma";
import { Errors } from "../lib/http";
import { buildActionNotifications } from "./notificationService";
import { auditRow } from "./auditService";

export interface CreateCommitteeInput {
  name: string;
  code: string;
  mandate?: string;
  meetingFrequency?: string;
  chairpersonId: number;
  secretaryId: number;
  centralRepId: number;
  memberIds: number[]; // ordinary members, in addition to chair/secretary
  createdById: number;
}

/**
 * Mirrors "Create a committee": one transaction creates the committee and
 * every membership row, then notifies the selected members. The Bank's
 * policy on conflicting roles (e.g. the same person chairing two
 * committees, if disallowed) should be enforced here once that policy is
 * confirmed — see the documented "prevent conflicting roles" requirement.
 */
export async function createCommittee(input: CreateCommitteeInput) {
  const existing = await prisma.committee.findFirst({
    where: { OR: [{ name: input.name }, { code: input.code }] },
  });
  if (existing) throw Errors.conflict("A committee with this name or code already exists.");

  const allMemberIds = new Set<number>([
    input.chairpersonId,
    input.secretaryId,
    ...input.memberIds,
  ]);

  return prisma.$transaction(async (tx) => {
    const committee = await tx.committee.create({
      data: {
        name: input.name,
        code: input.code,
        mandate: input.mandate,
        meetingFrequency: input.meetingFrequency,
        chairpersonId: input.chairpersonId,
        secretaryId: input.secretaryId,
        centralRepId: input.centralRepId,
      },
    });

    const membershipRows = Array.from(allMemberIds).map((userId) => ({
      committeeId: committee.id,
      userId,
      role:
        userId === input.chairpersonId
          ? ("CHAIRPERSON" as const)
          : userId === input.secretaryId
            ? ("SECRETARY" as const)
            : ("MEMBER" as const),
    }));

    await tx.committeeMembership.createMany({ data: membershipRows });

    await tx.auditEvent.create({
      data: auditRow({
        actorUserId: input.createdById,
        action: "committee.create",
        resourceType: "committee",
        resourceId: committee.id,
        committeeId: committee.id,
        after: { name: input.name, code: input.code },
        result: "SUCCESS",
      }),
    });

    // Committee-creation notifications are not tied to a single action
    // point, so they are recorded with actionPointId left null — the
    // in-app notification list still resolves them via recipientId.
    await tx.notification.createMany({
      data: Array.from(allMemberIds).map((recipientId) => ({
        recipientId,
        channel: "EMAIL" as const,
        notificationType: "CREATED" as const,
        idempotencyKey: `committee:${committee.id}:member:${recipientId}`,
        scheduledFor: new Date(),
      })),
      skipDuplicates: true,
    });

    return committee;
  });
}

export interface AddMemberInput {
  committeeId: number;
  userId: number;
  role?: "CHAIRPERSON" | "SECRETARY" | "MEMBER";
  actorUserId: number;
}

/**
 * Adds or updates a member's role on a committee.
 * If the role assigned is CHAIRPERSON, also updates committee.chairpersonId.
 * If the role assigned is SECRETARY, also updates committee.secretaryId.
 */
export async function addCommitteeMember(input: AddMemberInput) {
  const committee = await prisma.committee.findUnique({
    where: { id: input.committeeId },
  });
  if (!committee) throw Errors.notFound("Committee");

  const targetUser = await prisma.user.findUnique({
    where: { id: input.userId },
  });
  if (!targetUser) throw Errors.notFound("User");

  const role = input.role ?? "MEMBER";

  return prisma.$transaction(async (tx) => {
    // If role is CHAIRPERSON, demote previous chairperson to MEMBER if different
    if (role === "CHAIRPERSON" && committee.chairpersonId !== input.userId) {
      const prevChair = await tx.committeeMembership.findUnique({
        where: {
          uq_committee_user: {
            committeeId: input.committeeId,
            userId: committee.chairpersonId,
          },
        },
      });
      if (prevChair && prevChair.role === "CHAIRPERSON") {
        await tx.committeeMembership.update({
          where: { id: prevChair.id },
          data: { role: "MEMBER" },
        });
      }
      await tx.committee.update({
        where: { id: input.committeeId },
        data: { chairpersonId: input.userId },
      });
    }

    // If role is SECRETARY, demote previous secretary to MEMBER if different
    if (role === "SECRETARY" && committee.secretaryId !== input.userId) {
      const prevSec = await tx.committeeMembership.findUnique({
        where: {
          uq_committee_user: {
            committeeId: input.committeeId,
            userId: committee.secretaryId,
          },
        },
      });
      if (prevSec && prevSec.role === "SECRETARY") {
        await tx.committeeMembership.update({
          where: { id: prevSec.id },
          data: { role: "MEMBER" },
        });
      }
      await tx.committee.update({
        where: { id: input.committeeId },
        data: { secretaryId: input.userId },
      });
    }

    const membership = await tx.committeeMembership.upsert({
      where: {
        uq_committee_user: {
          committeeId: input.committeeId,
          userId: input.userId,
        },
      },
      update: { role, active: true },
      create: {
        committeeId: input.committeeId,
        userId: input.userId,
        role,
      },
      include: { user: true },
    });

    await tx.auditEvent.create({
      data: auditRow({
        actorUserId: input.actorUserId,
        action: "committee.addMember",
        resourceType: "committee_membership",
        resourceId: membership.id,
        committeeId: input.committeeId,
        after: { userId: input.userId, role },
        result: "SUCCESS",
      }),
    });

    return membership;
  });
}

export interface SetChairInput {
  committeeId: number;
  chairpersonId: number;
  actorUserId: number;
}

/**
 * Sets or reassigns the committee chairperson.
 * Automatically demotes the prior chairperson to MEMBER (if still in the committee)
 * and assigns the new chairperson to the committee with role CHAIRPERSON.
 */
export async function setCommitteeChair(input: SetChairInput) {
  const committee = await prisma.committee.findUnique({
    where: { id: input.committeeId },
  });
  if (!committee) throw Errors.notFound("Committee");

  const targetUser = await prisma.user.findUnique({
    where: { id: input.chairpersonId },
  });
  if (!targetUser) throw Errors.notFound("User to assign as Chairperson");

  return prisma.$transaction(async (tx) => {
    const previousChairId = committee.chairpersonId;

    const updatedCommittee = await tx.committee.update({
      where: { id: input.committeeId },
      data: { chairpersonId: input.chairpersonId },
      include: {
        chairperson: true,
        secretary: true,
        centralRep: true,
      },
    });

    if (previousChairId !== input.chairpersonId) {
      const prevMembership = await tx.committeeMembership.findUnique({
        where: {
          uq_committee_user: {
            committeeId: input.committeeId,
            userId: previousChairId,
          },
        },
      });
      if (prevMembership && prevMembership.role === "CHAIRPERSON") {
        await tx.committeeMembership.update({
          where: { id: prevMembership.id },
          data: { role: "MEMBER" },
        });
      }
    }

    await tx.committeeMembership.upsert({
      where: {
        uq_committee_user: {
          committeeId: input.committeeId,
          userId: input.chairpersonId,
        },
      },
      update: { role: "CHAIRPERSON", active: true },
      create: {
        committeeId: input.committeeId,
        userId: input.chairpersonId,
        role: "CHAIRPERSON",
      },
    });

    await tx.auditEvent.create({
      data: auditRow({
        actorUserId: input.actorUserId,
        action: "committee.setChair",
        resourceType: "committee",
        resourceId: input.committeeId,
        committeeId: input.committeeId,
        before: { chairpersonId: previousChairId },
        after: { chairpersonId: input.chairpersonId },
        result: "SUCCESS",
      }),
    });

    return updatedCommittee;
  });
}

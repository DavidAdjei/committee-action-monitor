/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Committee Action Monitor sample data...");

  const users = await Promise.all(
    [
      { fullName: "Justus Awua", email: "justus.awua@umbbank.com", department: "Central Committee", isCentralCommittee: true, isAdmin: true },
      { fullName: "Adjoa Kusi", email: "adjoa.kusi@umbbank.com", department: "Central Committee", isCentralCommittee: true },
      { fullName: "Nana Yeboah", email: "nana.yeboah@umbbank.com", department: "Information Security" },
      { fullName: "Ama Boateng", email: "ama.boateng@umbbank.com", department: "Information Security" },
      { fullName: "Kwame Mensah", email: "kwame.mensah@umbbank.com", department: "Information Security" },
      { fullName: "Kofi Antwi", email: "kofi.antwi@umbbank.com", department: "Risk Management" },
      { fullName: "Esi Nyarko", email: "esi.nyarko@umbbank.com", department: "Risk Management" },
      { fullName: "Esi Boadu", email: "esi.boadu@umbbank.com", department: "Risk Management" },
      { fullName: "Akua Frimpong", email: "akua.frimpong@umbbank.com", department: "Operations" },
      { fullName: "Yaw Danso", email: "yaw.danso@umbbank.com", department: "Operations" },
      { fullName: "Abena Asante", email: "abena.asante@umbbank.com", department: "Operations" },
      { fullName: "George Tackie", email: "george.tackie@umbbank.com", department: "Procurement" },
      { fullName: "Naa Lartey", email: "naa.lartey@umbbank.com", department: "Procurement" },
      { fullName: "Daniel Ofori", email: "daniel.ofori@umbbank.com", department: "Procurement" },
      { fullName: "Adwoa Asare", email: "adwoa.asare@umbbank.com", department: "Human Resources" },
      { fullName: "Eric Owusu", email: "eric.owusu@umbbank.com", department: "Human Resources" },
      { fullName: "Samuel Addo", email: "samuel.addo@umbbank.com", department: "Human Resources" },
    ].map((u) => prisma.user.upsert({ where: { email: u.email }, update: {}, create: u })),
  );

  const byName = (name: string) => users.find((u) => u.fullName === name)!;

  const committeeSeeds = [
    { name: "Information Security", code: "ISC", chair: "Nana Yeboah", sec: "Ama Boateng", members: ["Kwame Mensah"], centralRep: "Justus Awua", freq: "Monthly" },
    { name: "Risk Management", code: "RMC", chair: "Kofi Antwi", sec: "Esi Nyarko", members: ["Esi Boadu"], centralRep: "Justus Awua", freq: "Monthly" },
    { name: "Operations", code: "OPS", chair: "Akua Frimpong", sec: "Yaw Danso", members: ["Abena Asante"], centralRep: "Adjoa Kusi", freq: "Bi-weekly" },
    { name: "Procurement", code: "PRC", chair: "George Tackie", sec: "Naa Lartey", members: ["Daniel Ofori"], centralRep: "Adjoa Kusi", freq: "Quarterly" },
    { name: "Human Resources", code: "HRC", chair: "Adwoa Asare", sec: "Eric Owusu", members: ["Samuel Addo"], centralRep: "Justus Awua", freq: "Monthly" },
  ];

  const committees: Record<string, Awaited<ReturnType<typeof prisma.committee.upsert>>> = {};
  for (const c of committeeSeeds) {
    const committee = await prisma.committee.upsert({
      where: { code: c.code },
      update: {},
      create: {
        name: c.name,
        code: c.code,
        mandate: `Oversees ${c.name.toLowerCase()} governance and reports commitments to the Central Committee.`,
        meetingFrequency: c.freq,
        chairpersonId: byName(c.chair).id,
        secretaryId: byName(c.sec).id,
        centralRepId: byName(c.centralRep).id,
      },
    });
    committees[c.code] = committee;

    const memberRows = [
      { userId: byName(c.chair).id, role: "CHAIRPERSON" as const },
      { userId: byName(c.sec).id, role: "SECRETARY" as const },
      ...c.members.map((m) => ({ userId: byName(m).id, role: "MEMBER" as const })),
    ];
    for (const m of memberRows) {
      await prisma.committeeMembership.upsert({
        where: { uq_committee_user: { committeeId: committee.id, userId: m.userId } },
        update: {},
        create: { committeeId: committee.id, userId: m.userId, role: m.role },
      });
    }
  }

  const meetingSeeds = [
    { code: "ISC", reference: "MIN/ISC/09/26", title: "September Committee Meeting", startsAt: "2026-09-24T10:00:00Z", venue: "Board Room, Head Office" },
    { code: "ISC", reference: "MIN/ISC/08/26", title: "August Committee Meeting", startsAt: "2026-08-22T10:00:00Z", venue: "Board Room, Head Office" },
    { code: "RMC", reference: "MIN/RMC/09/26", title: "September Risk Meeting", startsAt: "2026-09-18T10:00:00Z", venue: "Risk Committee Room" },
    { code: "OPS", reference: "MIN/OPS/09/26", title: "September Operations Meeting", startsAt: "2026-09-21T10:00:00Z", venue: "Operations Floor Room" },
    { code: "PRC", reference: "MIN/PRC/09/26", title: "Procurement Review Meeting", startsAt: "2026-09-16T10:00:00Z", venue: "Procurement Office" },
    { code: "HRC", reference: "MIN/HRC/09/26", title: "September HR Meeting", startsAt: "2026-09-25T10:00:00Z", venue: "HR Conference Room" },
  ];

  const meetings: Record<string, Awaited<ReturnType<typeof prisma.meeting.upsert>>> = {};
  for (const m of meetingSeeds) {
    const committee = committees[m.code];
    const meeting = await prisma.meeting.upsert({
      where: { uq_committee_meeting_reference: { committeeId: committee.id, reference: m.reference } },
      update: {},
      create: {
        committeeId: committee.id,
        reference: m.reference,
        title: m.title,
        startsAt: new Date(m.startsAt),
        venue: m.venue,
        agenda: "Review outstanding action points, deadlines and evidence submitted since the last meeting.",
        createdById: committee.secretaryId,
      },
    });
    meetings[m.reference] = meeting;
  }

  interface ActionSeed {
    referenceNo: string;
    code: string;
    meetingRef: string;
    title: string;
    owner: string;
    dateRaised: string;
    deadline: string;
    status: "OPEN" | "IN_PROGRESS" | "OVERDUE" | "PENDING_VERIFICATION" | "COMPLETED";
    progress: number;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  }

  const actionSeeds: ActionSeed[] = [
    { referenceNo: "AP-2026-084", code: "ISC", meetingRef: "MIN/ISC/08/26", title: "Complete remediation of critical audit findings", owner: "Kwame Mensah", dateRaised: "2026-08-22", deadline: "2026-09-12", status: "IN_PROGRESS", progress: 72, priority: "CRITICAL" },
    { referenceNo: "AP-2026-079", code: "RMC", meetingRef: "MIN/RMC/09/26", title: "Submit revised credit risk appetite thresholds", owner: "Esi Boadu", dateRaised: "2026-09-01", deadline: "2026-09-15", status: "OPEN", progress: 20, priority: "HIGH" },
    { referenceNo: "AP-2026-071", code: "PRC", meetingRef: "MIN/PRC/09/26", title: "Conclude vendor due diligence for core banking support", owner: "Daniel Ofori", dateRaised: "2026-08-10", deadline: "2026-09-07", status: "OVERDUE", progress: 45, priority: "HIGH" },
    { referenceNo: "AP-2026-068", code: "OPS", meetingRef: "MIN/OPS/09/26", title: "Validate branch cash evacuation procedures", owner: "Abena Asante", dateRaised: "2026-08-28", deadline: "2026-09-18", status: "IN_PROGRESS", progress: 60, priority: "MEDIUM" },
    { referenceNo: "AP-2026-061", code: "HRC", meetingRef: "MIN/HRC/09/26", title: "Approve Q3 staff training calendar", owner: "Samuel Addo", dateRaised: "2026-08-01", deadline: "2026-09-06", status: "COMPLETED", progress: 100, priority: "LOW" },
    { referenceNo: "AP-2026-058", code: "OPS", meetingRef: "MIN/OPS/09/26", title: "Submit quarterly control attestation", owner: "Abena Asante", dateRaised: "2026-08-15", deadline: "2026-09-10", status: "PENDING_VERIFICATION", progress: 100, priority: "MEDIUM" },
  ];

  for (const a of actionSeeds) {
    const existing = await prisma.actionPoint.findUnique({ where: { referenceNo: a.referenceNo } });
    if (existing) continue;

    const committee = committees[a.code];
    const meeting = meetings[a.meetingRef];
    const owner = byName(a.owner);

    const action = await prisma.actionPoint.create({
      data: {
        referenceNo: a.referenceNo,
        meetingId: meeting.id,
        committeeId: committee.id,
        title: a.title,
        ownerId: owner.id,
        dateRaised: new Date(a.dateRaised),
        deadline: new Date(a.deadline),
        priority: a.priority ?? "MEDIUM",
        status: a.status,
        progress: a.progress,
        createdById: committee.secretaryId,
        completedAt: a.status === "COMPLETED" ? new Date(a.deadline) : undefined,
      },
    });

    await prisma.actionStakeholder.createMany({
      data: [
        { actionPointId: action.id, userId: committee.chairpersonId, stakeholderType: "CHAIRPERSON" },
        { actionPointId: action.id, userId: committee.secretaryId, stakeholderType: "SECRETARY" },
        { actionPointId: action.id, userId: owner.id, stakeholderType: "ACTION_OWNER" },
        { actionPointId: action.id, userId: committee.centralRepId, stakeholderType: "CENTRAL_COMMITTEE" },
      ],
      skipDuplicates: true,
    });

    await prisma.actionUpdate.create({
      data: {
        actionPointId: action.id,
        authorId: owner.id,
        status: a.status,
        progress: a.progress,
        note: `Progress updated to ${a.progress}%.`,
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

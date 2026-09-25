/* eslint-disable no-console */
/**
 * Seed derived from Committees.xlsx packs + UMB directory mails.
 * - Users: Azure `mail` as email, displayName as fullName
 * - Committees / memberships from the sheets (chair & secretary roles)
 * - Users and committees / memberships only (no sample meetings or actions)
 *
 * MANCO sheet only marked Chairman (no Secretary). Benjamin Lartey is used
 * as Secretary so the required FK is satisfied; change via the app if needed.
 * centralRepId left null (optional at DB).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Role = "CHAIRPERSON" | "SECRETARY" | "MEMBER";

interface MemberSeed {
  fullName: string;
  email: string;
  role: Role;
}

interface CommitteeSeed {
  name: string;
  code: string;
  meetingFrequency: string;
  mandate: string;
  members: MemberSeed[];
}

const COMMITTEES: CommitteeSeed[] = [
  {
    name: "Asset & Liability Committee",
    code: "ALCO",
    meetingFrequency: "Weekly",
    mandate: "Oversees the Bank's asset and liability position, liquidity and interest-rate risk.",
    members: [
      { fullName: "DAVID ASARE", email: "David.Asare@myumbbank.com", role: "MEMBER" },
      { fullName: "EMMANUEL SACKEY", email: "Emmanuel.Sackey@myumbbank.com", role: "SECRETARY" },
      { fullName: "FATAWU ISSAH", email: "Fatawu.Issah@myumbbank.com", role: "MEMBER" },
      { fullName: "IRENE BIAMA BAMFO BARFI", email: "Irene.Barfi@myumbbank.com", role: "MEMBER" },
      { fullName: "IVY BUAGBE", email: "Ivy.Buagbe@myumbbank.com", role: "MEMBER" },
      { fullName: "JUSTICE APPIAH BEMPONG", email: "Justice.Bempong@myumbbank.com", role: "MEMBER" },
      { fullName: "Nana Kwame Yankson", email: "Nana.Yankson@myumbbank.com", role: "MEMBER" },
      { fullName: "NOBLE EDUAMAH", email: "Noble.Eduamah@myumbbank.com", role: "MEMBER" },
      { fullName: "PAUL ASAMOAH", email: "Paul.Asamoah@myumbbank.com", role: "MEMBER" },
      { fullName: "PHILIP OTI-MENSAH", email: "Philip.Oti-Mensah@myumbbank.com", role: "CHAIRPERSON" },
      { fullName: "RAYMOND AMEKA", email: "Raymond.Ameka@myumbbank.com", role: "MEMBER" },
      { fullName: "VICTOR BRIJUU", email: "Victor.Brijuu@myumbbank.com", role: "MEMBER" },
      { fullName: "Victor K. Dikro", email: "Victor.Dikro@myumbbank.com", role: "MEMBER" },
      { fullName: "VICTORIA ATTIPOE", email: "VICTORIA.ATTIPOE@myumbbank.com", role: "MEMBER" },
    ],
  },
  {
    name: "Cyber & Info Security Committee",
    code: "CISC",
    meetingFrequency: "Monthly",
    mandate: "Governs cyber security, information security policy and control remediation.",
    members: [
      { fullName: "Justina Stella Laing", email: "Justina.Laing@myumbbank.com", role: "CHAIRPERSON" },
      { fullName: "IVY BUAGBE", email: "Ivy.Buagbe@myumbbank.com", role: "MEMBER" },
      { fullName: "Mariwan Fuseini", email: "Mariwan.Fuseini@myumbbank.com", role: "MEMBER" },
      { fullName: "FATAWU ISSAH", email: "Fatawu.Issah@myumbbank.com", role: "MEMBER" },
      { fullName: "EVANS AMARTEY", email: "Evans.Amartey@myumbbank.com", role: "MEMBER" },
      { fullName: "JUSTUS AWUA", email: "Justus.Awua@myumbbank.com", role: "SECRETARY" },
      { fullName: "PAUL ASAMOAH", email: "Paul.Asamoah@myumbbank.com", role: "MEMBER" },
      { fullName: "TUBUOR OFEI-AGYEMANG", email: "Tubuor.Ofei-Agyemang@myumbbank.com", role: "MEMBER" },
      { fullName: "FRED GUDU", email: "Fred.Gudu@myumbbank.com", role: "MEMBER" },
      { fullName: "SAMUEL HYMORE BOAHENE", email: "Samuel.Boahene@myumbbank.com", role: "MEMBER" },
    ],
  },
  {
    name: "Executive Committee",
    code: "EXCO",
    meetingFrequency: "Weekly",
    mandate: "Executive management forum for strategic and operational decisions.",
    members: [
      { fullName: "BENJAMIN LARTEY", email: "Benjamin.Lartey@myumbbank.com", role: "SECRETARY" },
      { fullName: "BERNICE ASABEA KISSI BOATENG", email: "Bernice.Kissiboateng@myumbbank.com", role: "MEMBER" },
      { fullName: "DAPHNE A. OPPONG", email: "Daphne.A.Oppong@myumbbank.com", role: "MEMBER" },
      { fullName: "Ekua Yankah", email: "Ekua.Yankah@myumbbank.com", role: "MEMBER" },
      { fullName: "EMMANUEL SACKEY", email: "Emmanuel.Sackey@myumbbank.com", role: "MEMBER" },
      { fullName: "EVANS AMARTEY", email: "Evans.Amartey@myumbbank.com", role: "MEMBER" },
      { fullName: "IVY BUAGBE", email: "Ivy.Buagbe@myumbbank.com", role: "MEMBER" },
      { fullName: "Justina Stella Laing", email: "Justina.Laing@myumbbank.com", role: "MEMBER" },
      { fullName: "Mariwan Fuseini", email: "Mariwan.Fuseini@myumbbank.com", role: "MEMBER" },
      { fullName: "NOBLE EDUAMAH", email: "Noble.Eduamah@myumbbank.com", role: "MEMBER" },
      { fullName: "PHILIP OTI-MENSAH", email: "Philip.Oti-Mensah@myumbbank.com", role: "CHAIRPERSON" },
      { fullName: "SAMUEL HYMORE BOAHENE", email: "Samuel.Boahene@myumbbank.com", role: "MEMBER" },
      { fullName: "VICTOR BRIJUU", email: "Victor.Brijuu@myumbbank.com", role: "MEMBER" },
      { fullName: "Victor K. Dikro", email: "Victor.Dikro@myumbbank.com", role: "MEMBER" },
      { fullName: "VICTORIA ATTIPOE", email: "VICTORIA.ATTIPOE@myumbbank.com", role: "MEMBER" },
    ],
  },
  {
    name: "ICT Steering Committee",
    code: "ICT",
    meetingFrequency: "Monthly",
    mandate: "Steers ICT strategy, major projects and technology risk.",
    members: [
      { fullName: "PHILIP OTI-MENSAH", email: "Philip.Oti-Mensah@myumbbank.com", role: "CHAIRPERSON" },
      { fullName: "Justina Stella Laing", email: "Justina.Laing@myumbbank.com", role: "MEMBER" },
      { fullName: "Mariwan Fuseini", email: "Mariwan.Fuseini@myumbbank.com", role: "SECRETARY" },
      { fullName: "IVY BUAGBE", email: "Ivy.Buagbe@myumbbank.com", role: "MEMBER" },
      { fullName: "FATAWU ISSAH", email: "Fatawu.Issah@myumbbank.com", role: "MEMBER" },
      { fullName: "EVANS AMARTEY", email: "Evans.Amartey@myumbbank.com", role: "MEMBER" },
      { fullName: "JUSTUS AWUA", email: "Justus.Awua@myumbbank.com", role: "MEMBER" },
      { fullName: "PAUL ASAMOAH", email: "Paul.Asamoah@myumbbank.com", role: "MEMBER" },
      { fullName: "TUBUOR OFEI-AGYEMANG", email: "Tubuor.Ofei-Agyemang@myumbbank.com", role: "MEMBER" },
      { fullName: "SAMUEL HYMORE BOAHENE", email: "Samuel.Boahene@myumbbank.com", role: "MEMBER" },
      { fullName: "FRED GUDU", email: "Fred.Gudu@myumbbank.com", role: "MEMBER" },
      { fullName: "Victor K. Dikro", email: "Victor.Dikro@myumbbank.com", role: "MEMBER" },
      { fullName: "EDEM KNIGHT-TAY", email: "Edem.Knight-Tay@myumbbank.com", role: "MEMBER" },
      { fullName: "MYLES C. HAGAN", email: "Myles.Hagan@myumbbank.com", role: "MEMBER" },
    ],
  },
  {
    name: "Management Committee",
    code: "MANCO",
    meetingFrequency: "Weekly",
    mandate: "Management forum for cross-functional operational coordination.",
    members: [
      { fullName: "Abigail Alloye", email: "Abigail.Alloye@myumbbank.com", role: "MEMBER" },
      { fullName: "BENJAMIN LARTEY", email: "Benjamin.Lartey@myumbbank.com", role: "SECRETARY" },
      { fullName: "BERNICE ASABEA KISSI BOATENG", email: "Bernice.Kissiboateng@myumbbank.com", role: "MEMBER" },
      { fullName: "CHARLES OSAM", email: "Charles.Osam@myumbbank.com", role: "MEMBER" },
      { fullName: "Cyril Kojo-Ganson", email: "Cyril.Kojo-Ganson@myumbbank.com", role: "MEMBER" },
      { fullName: "DAPHNE A. OPPONG", email: "Daphne.A.Oppong@myumbbank.com", role: "MEMBER" },
      { fullName: "DAVID ASARE", email: "David.Asare@myumbbank.com", role: "MEMBER" },
      { fullName: "EDEM KNIGHT-TAY", email: "Edem.Knight-Tay@myumbbank.com", role: "MEMBER" },
      { fullName: "EMMANUEL SACKEY", email: "Emmanuel.Sackey@myumbbank.com", role: "MEMBER" },
      { fullName: "EVANS AMARTEY", email: "Evans.Amartey@myumbbank.com", role: "MEMBER" },
      { fullName: "FATAWU ISSAH", email: "Fatawu.Issah@myumbbank.com", role: "MEMBER" },
      { fullName: "FRED GUDU", email: "Fred.Gudu@myumbbank.com", role: "MEMBER" },
      { fullName: "IVY BUAGBE", email: "Ivy.Buagbe@myumbbank.com", role: "MEMBER" },
      { fullName: "JUANITA TAGOE", email: "Juanita.Tagoe@myumbbank.com", role: "MEMBER" },
      { fullName: "Justina Stella Laing", email: "Justina.Laing@myumbbank.com", role: "MEMBER" },
      { fullName: "JUSTUS AWUA", email: "Justus.Awua@myumbbank.com", role: "MEMBER" },
      { fullName: "LAWRENCE ESSEL BAIDEN", email: "Lawrence.Baiden@myumbbank.com", role: "MEMBER" },
      { fullName: "Mariwan Fuseini", email: "Mariwan.Fuseini@myumbbank.com", role: "MEMBER" },
      { fullName: "MAXWELL OKYERE ADU", email: "Adu.Okyere@myumbbank.com", role: "MEMBER" },
      { fullName: "MYLES C. HAGAN", email: "Myles.Hagan@myumbbank.com", role: "MEMBER" },
      { fullName: "Niine Inkumsah Sarpong", email: "Niine.InkumsahSarpong@myumbbank.com", role: "MEMBER" },
      { fullName: "NOBLE EDUAMAH", email: "Noble.Eduamah@myumbbank.com", role: "MEMBER" },
      { fullName: "PAUL ASAMOAH", email: "Paul.Asamoah@myumbbank.com", role: "MEMBER" },
      { fullName: "Paul Yankey", email: "Paul.Yankey@myumbbank.com", role: "MEMBER" },
      { fullName: "PHILIP OTI-MENSAH", email: "Philip.Oti-Mensah@myumbbank.com", role: "CHAIRPERSON" },
      { fullName: "RAYMOND AMEKA", email: "Raymond.Ameka@myumbbank.com", role: "MEMBER" },
      { fullName: "RICHMOND OVADIO", email: "Richmond.Ovadio@myumbbank.com", role: "MEMBER" },
      { fullName: "SAMUEL HYMORE BOAHENE", email: "Samuel.Boahene@myumbbank.com", role: "MEMBER" },
      { fullName: "Sharon K. Anim", email: "Sharon.Anim@myumbbank.com", role: "MEMBER" },
      { fullName: "STEPHEN ADJEI AMPADU", email: "Stephen.Ampadu@myumbbank.com", role: "MEMBER" },
      { fullName: "TARICK SAM-ABAKAH", email: "Tarick.Sam-Abakah@myumbbank.com", role: "MEMBER" },
      { fullName: "TUBUOR OFEI-AGYEMANG", email: "Tubuor.Ofei-Agyemang@myumbbank.com", role: "MEMBER" },
      { fullName: "VICTOR AMPOMAH", email: "Victor.Ampomah@myumbbank.com", role: "MEMBER" },
      { fullName: "VICTOR BRIJUU", email: "Victor.Brijuu@myumbbank.com", role: "MEMBER" },
      { fullName: "Victor K. Dikro", email: "Victor.Dikro@myumbbank.com", role: "MEMBER" },
      { fullName: "VICTORIA ATTIPOE", email: "VICTORIA.ATTIPOE@myumbbank.com", role: "MEMBER" },
      { fullName: "Yaw Asante Offeh", email: "Yaw.Asante@myumbbank.com", role: "MEMBER" },
    ],
  },
  {
    name: "Management Credit Committee",
    code: "MCC",
    meetingFrequency: "Quarterly",
    mandate: "Reviews credit proposals, portfolio quality and credit risk appetite.",
    members: [
      { fullName: "PHILIP OTI-MENSAH", email: "Philip.Oti-Mensah@myumbbank.com", role: "CHAIRPERSON" },
      { fullName: "Justina Stella Laing", email: "Justina.Laing@myumbbank.com", role: "MEMBER" },
      { fullName: "BEDFORD DUAH", email: "Bedford.Duah@myumbbank.com", role: "MEMBER" },
      { fullName: "BENJAMIN LARTEY", email: "Benjamin.Lartey@myumbbank.com", role: "MEMBER" },
      { fullName: "BERNICE ASABEA KISSI BOATENG", email: "Bernice.Kissiboateng@myumbbank.com", role: "MEMBER" },
      { fullName: "DAVID ASARE", email: "David.Asare@myumbbank.com", role: "MEMBER" },
      { fullName: "EMMANUEL SACKEY", email: "Emmanuel.Sackey@myumbbank.com", role: "MEMBER" },
      { fullName: "EVANS AMARTEY", email: "Evans.Amartey@myumbbank.com", role: "MEMBER" },
      { fullName: "IVY BUAGBE", email: "Ivy.Buagbe@myumbbank.com", role: "MEMBER" },
      { fullName: "MAXWELL OKYERE ADU", email: "Adu.Okyere@myumbbank.com", role: "SECRETARY" },
      { fullName: "NOBLE EDUAMAH", email: "Noble.Eduamah@myumbbank.com", role: "MEMBER" },
      { fullName: "SAMUEL SEDEGAH", email: "Samuel.Sedegah@myumbbank.com", role: "MEMBER" },
      { fullName: "VICTOR BRIJUU", email: "Victor.Brijuu@myumbbank.com", role: "MEMBER" },
      { fullName: "Victor K. Dikro", email: "Victor.Dikro@myumbbank.com", role: "MEMBER" },
      { fullName: "VICTORIA ATTIPOE", email: "VICTORIA.ATTIPOE@myumbbank.com", role: "MEMBER" },
    ],
  },
  {
    name: "Management Risk Committee",
    code: "MRC",
    meetingFrequency: "Monthly",
    mandate: "Oversees enterprise risk management and risk appetite reporting.",
    members: [
      { fullName: "PHILIP OTI-MENSAH", email: "Philip.Oti-Mensah@myumbbank.com", role: "CHAIRPERSON" },
      { fullName: "Justina Stella Laing", email: "Justina.Laing@myumbbank.com", role: "MEMBER" },
      { fullName: "IVY BUAGBE", email: "Ivy.Buagbe@myumbbank.com", role: "SECRETARY" },
      { fullName: "BEDFORD DUAH", email: "Bedford.Duah@myumbbank.com", role: "MEMBER" },
      { fullName: "BENJAMIN LARTEY", email: "Benjamin.Lartey@myumbbank.com", role: "MEMBER" },
      { fullName: "BERNICE ASABEA KISSI BOATENG", email: "Bernice.Kissiboateng@myumbbank.com", role: "MEMBER" },
      { fullName: "DAVID ASARE", email: "David.Asare@myumbbank.com", role: "MEMBER" },
      { fullName: "EMMANUEL SACKEY", email: "Emmanuel.Sackey@myumbbank.com", role: "MEMBER" },
      { fullName: "EVANS AMARTEY", email: "Evans.Amartey@myumbbank.com", role: "MEMBER" },
      { fullName: "MAXWELL OKYERE ADU", email: "Adu.Okyere@myumbbank.com", role: "MEMBER" },
      { fullName: "NOBLE EDUAMAH", email: "Noble.Eduamah@myumbbank.com", role: "MEMBER" },
      { fullName: "VICTOR BRIJUU", email: "Victor.Brijuu@myumbbank.com", role: "MEMBER" },
      { fullName: "Victor K. Dikro", email: "Victor.Dikro@myumbbank.com", role: "MEMBER" },
      { fullName: "VICTORIA ATTIPOE", email: "VICTORIA.ATTIPOE@myumbbank.com", role: "MEMBER" },
    ],
  },
];

const EXTRA_USERS: { fullName: string; email: string }[] = [
  { fullName: "David Adjei", email: "david.adjei@myumbbank.com" },
  { fullName: "HENRIETTA DUHO", email: "Henrietta.Duho@myumbbank.com" },
  { fullName: "RITA ODJIDJA", email: "Rita.Odjidja@myumbbank.com" },
  { fullName: "Selasi Afi Manyo", email: "Selasi.Manyo@myumbbank.com" },
  { fullName: "NANABANYIN GRAVES BREW-APPIAH", email: "Nanabanyin.Brew-Appiah@myumbbank.com" },
  { fullName: "BERNARD KOJO ANUMEL", email: "Bernard.Anumel@myumbbank.com" },
  // Central Committee secretariat (not necessarily on a sub-committee sheet)
  { fullName: "Maame Akua Ayisibea Ayeh", email: "Ayisibea.Ayeh@myumbbank.com" },
];

/** Committee Effectiveness Secretariat — bank-wide Central Committee members */
const CENTRAL_COMMITTEE_EMAILS = new Set(
  [
    "Stephen.Ampadu@myumbbank.com",
    "Fred.Gudu@myumbbank.com",
    "Ekua.Yankah@myumbbank.com",
    "Paul.Asamoah@myumbbank.com",
    "Ayisibea.Ayeh@myumbbank.com",
    "Niine.InkumsahSarpong@myumbbank.com",
    "Abigail.Alloye@myumbbank.com",
  ].map((e) => e.toLowerCase()),
);

type UserSeed = {
  fullName: string;
  email: string;
  isCentralCommittee: boolean;
  isAdmin: boolean;
  centralRole: "MEMBER" | "ADMINISTRATOR" | null;
};

/** Central Committee Administrator sub-role (Stephen). */
const CENTRAL_ADMIN_EMAIL = "stephen.ampadu@myumbbank.com";

/** Platform admins who are not Central Committee members (e.g. David Adjei). */
const PLATFORM_ADMIN_EMAILS = new Set(["david.adjei@myumbbank.com"].map((e) => e.toLowerCase()));

function collectUsers(): Map<string, UserSeed> {
  const map = new Map<string, UserSeed>();
  const put = (fullName: string, email: string) => {
    const key = email.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        fullName,
        email,
        isCentralCommittee: false,
        isAdmin: false,
        centralRole: null,
      });
    } else {
      map.get(key)!.fullName = fullName;
    }
  };
  for (const c of COMMITTEES) {
    for (const m of c.members) put(m.fullName, m.email);
  }
  for (const u of EXTRA_USERS) put(u.fullName, u.email);

  // Central Committee: secretariat MEMBERs; one ADMINISTRATOR for CC leadership tools.
  for (const [key, u] of map) {
    if (CENTRAL_COMMITTEE_EMAILS.has(key)) {
      u.isCentralCommittee = true;
      if (key === CENTRAL_ADMIN_EMAIL) {
        u.centralRole = "ADMINISTRATOR";
        u.isAdmin = true;
      } else {
        u.centralRole = "MEMBER";
        u.isAdmin = false;
      }
    }
  }

  // Platform admin without Central Committee membership
  for (const [key, u] of map) {
    if (PLATFORM_ADMIN_EMAILS.has(key)) {
      u.isAdmin = true;
      u.isCentralCommittee = false;
      u.centralRole = null;
    }
  }

  return map;
}

async function main() {
  console.log("Seeding users and committees only...");

  const userDefs = collectUsers();
  const usersByEmail = new Map<string, { id: number; fullName: string; email: string }>();

  for (const u of userDefs.values()) {
    const row = await prisma.user.upsert({
      where: { email: u.email },
      create: {
        fullName: u.fullName,
        email: u.email,
        isCentralCommittee: u.isCentralCommittee,
        isAdmin: u.isAdmin,
        centralRole: u.centralRole,
        active: true,
      },
      update: {
        fullName: u.fullName,
        isCentralCommittee: u.isCentralCommittee,
        isAdmin: u.isAdmin,
        centralRole: u.centralRole,
        active: true,
      },
    });
    usersByEmail.set(u.email.toLowerCase(), row);
  }
  console.log(`Users: ${usersByEmail.size}`);

  const byEmail = (email: string) => {
    const u = usersByEmail.get(email.toLowerCase());
    if (!u) throw new Error(`User not found for email ${email}`);
    return u;
  };

  for (const c of COMMITTEES) {
    const chair = c.members.find((m) => m.role === "CHAIRPERSON");
    const sec = c.members.find((m) => m.role === "SECRETARY");
    if (!chair || !sec) {
      throw new Error(`Committee ${c.code} is missing chair or secretary in seed data`);
    }

    const committee = await prisma.committee.upsert({
      where: { code: c.code },
      update: {
        name: c.name,
        mandate: c.mandate,
        meetingFrequency: c.meetingFrequency,
        chairpersonId: byEmail(chair.email).id,
        secretaryId: byEmail(sec.email).id,
        centralRepId: null,
        active: true,
      },
      create: {
        name: c.name,
        code: c.code,
        mandate: c.mandate,
        meetingFrequency: c.meetingFrequency,
        chairpersonId: byEmail(chair.email).id,
        secretaryId: byEmail(sec.email).id,
        centralRepId: null,
        active: true,
      },
    });

    for (const m of c.members) {
      const user = byEmail(m.email);
      await prisma.committeeMembership.upsert({
        where: {
          uq_committee_user: { committeeId: committee.id, userId: user.id },
        },
        update: { role: m.role, active: true },
        create: {
          committeeId: committee.id,
          userId: user.id,
          role: m.role,
          active: true,
        },
      });
    }
    console.log(
      `Committee ${c.code}: ${c.members.length} members (chair ${chair.fullName}, sec ${sec.fullName})`,
    );
  }

  console.log("Seed complete (users + committees only).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

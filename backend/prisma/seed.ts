/* eslint-disable no-console */
/**
 * Seed derived from Committees.xlsx packs + UMB directory mails.
 * - Users: Azure `mail` as email, displayName as fullName
 * - Committees / memberships from the sheets (chair & secretary roles)
 * - Sample past meetings + action points for local demos
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

/** One Central Administrator; remaining secretariat are equal Central Members. */
const CENTRAL_ADMIN_EMAIL = "stephen.ampadu@myumbbank.com";

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

  // Central Committee: all secretariat members are equal MEMBERs;
  // one ADMINISTRATOR sub-role for committee creation / leadership tools.
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

  return map;
}

async function main() {
  console.log("Seeding users, committees, meetings and sample action points...");

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
    console.log(`Committee ${c.code}: ${c.members.length} members (chair ${chair.fullName}, sec ${sec.fullName})`);
  }

  const meetingSpecs: {
    code: string;
    reference: string;
    title: string;
    startsAt: string;
    endsAt?: string;
    venue: string;
  }[] = [
    { code: "ALCO", reference: "MIN/ALCO/08/26", title: "August ALCO Meeting", startsAt: "2026-08-12T10:00:00Z", endsAt: "2026-08-12T12:00:00Z", venue: "Treasury Conference Room" },
    { code: "ALCO", reference: "MIN/ALCO/09/26", title: "September ALCO Meeting", startsAt: "2026-09-09T10:00:00Z", endsAt: "2026-09-09T12:00:00Z", venue: "Treasury Conference Room" },
    { code: "CISC", reference: "MIN/CISC/08/26", title: "August Cyber & InfoSec Meeting", startsAt: "2026-08-20T14:00:00Z", endsAt: "2026-08-20T16:00:00Z", venue: "IS War Room" },
    { code: "CISC", reference: "MIN/CISC/09/26", title: "September Cyber & InfoSec Meeting", startsAt: "2026-09-17T14:00:00Z", endsAt: "2026-09-17T16:00:00Z", venue: "IS War Room" },
    { code: "EXCO", reference: "MIN/EXCO/08/26", title: "August EXCO Meeting", startsAt: "2026-08-05T09:00:00Z", endsAt: "2026-08-05T11:00:00Z", venue: "Board Room" },
    { code: "EXCO", reference: "MIN/EXCO/09/26", title: "September EXCO Meeting", startsAt: "2026-09-02T09:00:00Z", endsAt: "2026-09-02T11:00:00Z", venue: "Board Room" },
    { code: "ICT", reference: "MIN/ICT/08/26", title: "August ICT Steering Meeting", startsAt: "2026-08-18T11:00:00Z", endsAt: "2026-08-18T13:00:00Z", venue: "ICT Project Room" },
    { code: "ICT", reference: "MIN/ICT/09/26", title: "September ICT Steering Meeting", startsAt: "2026-09-15T11:00:00Z", endsAt: "2026-09-15T13:00:00Z", venue: "ICT Project Room" },
    { code: "MANCO", reference: "MIN/MANCO/08/26", title: "August MANCO Meeting", startsAt: "2026-08-07T09:30:00Z", endsAt: "2026-08-07T11:30:00Z", venue: "Management Conference Room" },
    { code: "MANCO", reference: "MIN/MANCO/09/26", title: "September MANCO Meeting", startsAt: "2026-09-04T09:30:00Z", endsAt: "2026-09-04T11:30:00Z", venue: "Management Conference Room" },
    { code: "MCC", reference: "MIN/MCC/Q2/26", title: "Q2 Management Credit Committee", startsAt: "2026-06-20T10:00:00Z", endsAt: "2026-06-20T13:00:00Z", venue: "Credit Committee Room" },
    { code: "MCC", reference: "MIN/MCC/Q3/26", title: "Q3 Management Credit Committee", startsAt: "2026-09-12T10:00:00Z", endsAt: "2026-09-12T13:00:00Z", venue: "Credit Committee Room" },
    { code: "MRC", reference: "MIN/MRC/08/26", title: "August Risk Committee Meeting", startsAt: "2026-08-14T10:00:00Z", endsAt: "2026-08-14T12:00:00Z", venue: "Risk Committee Room" },
    { code: "MRC", reference: "MIN/MRC/09/26", title: "September Risk Committee Meeting", startsAt: "2026-09-11T10:00:00Z", endsAt: "2026-09-11T12:00:00Z", venue: "Risk Committee Room" },
  ];

  const meetingsByRef = new Map<string, { id: number; committeeId: number; secretaryId: number; chairpersonId: number }>();

  for (const m of meetingSpecs) {
    const committee = await prisma.committee.findUniqueOrThrow({ where: { code: m.code } });
    const meeting = await prisma.meeting.upsert({
      where: {
        uq_committee_meeting_reference: { committeeId: committee.id, reference: m.reference },
      },
      update: {
        title: m.title,
        startsAt: new Date(m.startsAt),
        endsAt: m.endsAt ? new Date(m.endsAt) : null,
        venue: m.venue,
      },
      create: {
        committeeId: committee.id,
        reference: m.reference,
        title: m.title,
        startsAt: new Date(m.startsAt),
        endsAt: m.endsAt ? new Date(m.endsAt) : null,
        venue: m.venue,
        agenda: "Review outstanding action points, risk items and decisions from the previous meeting.",
        createdById: committee.secretaryId,
      },
    });
    meetingsByRef.set(m.reference, {
      id: meeting.id,
      committeeId: committee.id,
      secretaryId: committee.secretaryId,
      chairpersonId: committee.chairpersonId,
    });
  }
  console.log(`Meetings: ${meetingsByRef.size}`);

  type ActionSeed = {
    referenceNo: string;
    meetingRef: string;
    title: string;
    ownerEmail: string;
    dateRaised: string;
    deadline: string;
    status: "OPEN" | "IN_PROGRESS" | "OVERDUE" | "PENDING_VERIFICATION" | "COMPLETED";
    progress: number;
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  };

  const actionSeeds: ActionSeed[] = [
    { referenceNo: "AP-2026-ALCO-01", meetingRef: "MIN/ALCO/08/26", title: "Update liquidity contingency funding plan", ownerEmail: "David.Asare@myumbbank.com", dateRaised: "2026-08-12", deadline: "2026-09-05", status: "COMPLETED", progress: 100, priority: "HIGH" },
    { referenceNo: "AP-2026-ALCO-02", meetingRef: "MIN/ALCO/09/26", title: "Submit September gap analysis report", ownerEmail: "Victor.Brijuu@myumbbank.com", dateRaised: "2026-09-09", deadline: "2026-09-25", status: "IN_PROGRESS", progress: 55, priority: "MEDIUM" },
    { referenceNo: "AP-2026-CISC-01", meetingRef: "MIN/CISC/08/26", title: "Close critical vulnerability findings from external scan", ownerEmail: "Evans.Amartey@myumbbank.com", dateRaised: "2026-08-20", deadline: "2026-09-10", status: "OVERDUE", progress: 70, priority: "CRITICAL" },
    { referenceNo: "AP-2026-CISC-02", meetingRef: "MIN/CISC/09/26", title: "Finalise incident response playbook v2", ownerEmail: "Fred.Gudu@myumbbank.com", dateRaised: "2026-09-17", deadline: "2026-10-15", status: "OPEN", progress: 15, priority: "HIGH" },
    { referenceNo: "AP-2026-EXCO-01", meetingRef: "MIN/EXCO/08/26", title: "Circulate Q3 strategy progress pack to Board", ownerEmail: "Benjamin.Lartey@myumbbank.com", dateRaised: "2026-08-05", deadline: "2026-08-22", status: "COMPLETED", progress: 100, priority: "HIGH" },
    { referenceNo: "AP-2026-EXCO-02", meetingRef: "MIN/EXCO/09/26", title: "Confirm branch network optimisation options", ownerEmail: "Emmanuel.Sackey@myumbbank.com", dateRaised: "2026-09-02", deadline: "2026-09-30", status: "IN_PROGRESS", progress: 40, priority: "MEDIUM" },
    { referenceNo: "AP-2026-ICT-01", meetingRef: "MIN/ICT/08/26", title: "Approve core banking upgrade change window", ownerEmail: "Edem.Knight-Tay@myumbbank.com", dateRaised: "2026-08-18", deadline: "2026-09-01", status: "PENDING_VERIFICATION", progress: 100, priority: "CRITICAL" },
    { referenceNo: "AP-2026-ICT-02", meetingRef: "MIN/ICT/09/26", title: "Complete DR test for payment switch", ownerEmail: "Myles.Hagan@myumbbank.com", dateRaised: "2026-09-15", deadline: "2026-10-20", status: "OPEN", progress: 10, priority: "HIGH" },
    { referenceNo: "AP-2026-MANCO-01", meetingRef: "MIN/MANCO/08/26", title: "Publish revised customer complaint SLA dashboard", ownerEmail: "Abigail.Alloye@myumbbank.com", dateRaised: "2026-08-07", deadline: "2026-08-28", status: "COMPLETED", progress: 100, priority: "MEDIUM" },
    { referenceNo: "AP-2026-MANCO-02", meetingRef: "MIN/MANCO/09/26", title: "Align branch opening hours pilot metrics", ownerEmail: "Paul.Yankey@myumbbank.com", dateRaised: "2026-09-04", deadline: "2026-09-28", status: "IN_PROGRESS", progress: 35, priority: "LOW" },
    { referenceNo: "AP-2026-MCC-01", meetingRef: "MIN/MCC/Q2/26", title: "Review top 20 watchlist exposures", ownerEmail: "Samuel.Sedegah@myumbbank.com", dateRaised: "2026-06-20", deadline: "2026-07-15", status: "COMPLETED", progress: 100, priority: "HIGH" },
    { referenceNo: "AP-2026-MCC-02", meetingRef: "MIN/MCC/Q3/26", title: "Update sector concentration limits proposal", ownerEmail: "Adu.Okyere@myumbbank.com", dateRaised: "2026-09-12", deadline: "2026-10-10", status: "OPEN", progress: 20, priority: "HIGH" },
    { referenceNo: "AP-2026-MRC-01", meetingRef: "MIN/MRC/08/26", title: "Submit operational risk KRI dashboard", ownerEmail: "Bedford.Duah@myumbbank.com", dateRaised: "2026-08-14", deadline: "2026-09-01", status: "OVERDUE", progress: 60, priority: "MEDIUM" },
    { referenceNo: "AP-2026-MRC-02", meetingRef: "MIN/MRC/09/26", title: "Complete residual risk assessment for new product", ownerEmail: "Noble.Eduamah@myumbbank.com", dateRaised: "2026-09-11", deadline: "2026-10-05", status: "IN_PROGRESS", progress: 45, priority: "HIGH" },
  ];

  let actionsCreated = 0;
  for (const a of actionSeeds) {
    const meeting = meetingsByRef.get(a.meetingRef);
    if (!meeting) throw new Error(`Meeting ${a.meetingRef} missing`);
    const owner = byEmail(a.ownerEmail);

    const existing = await prisma.actionPoint.findUnique({ where: { referenceNo: a.referenceNo } });
    if (existing) continue;

    const action = await prisma.actionPoint.create({
      data: {
        referenceNo: a.referenceNo,
        meetingId: meeting.id,
        committeeId: meeting.committeeId,
        title: a.title,
        ownerId: owner.id,
        dateRaised: new Date(a.dateRaised),
        deadline: new Date(a.deadline),
        priority: a.priority,
        status: a.status,
        progress: a.progress,
        createdById: meeting.secretaryId,
        completedAt: a.status === "COMPLETED" ? new Date(a.deadline) : undefined,
      },
    });

    await prisma.actionStakeholder.createMany({
      data: [
        { actionPointId: action.id, userId: meeting.chairpersonId, stakeholderType: "CHAIRPERSON" },
        { actionPointId: action.id, userId: meeting.secretaryId, stakeholderType: "SECRETARY" },
        { actionPointId: action.id, userId: owner.id, stakeholderType: "ACTION_OWNER" },
      ],
      skipDuplicates: true,
    });

    await prisma.actionUpdate.create({
      data: {
        actionPointId: action.id,
        authorId: owner.id,
        status: a.status,
        progress: a.progress,
        note: `Seed progress at ${a.progress}%.`,
      },
    });
    actionsCreated += 1;
  }

  console.log(`Action points created: ${actionsCreated}`);
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

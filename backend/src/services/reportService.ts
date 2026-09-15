import { prisma } from "../lib/prisma";

export interface CommitteeSummary {
  committeeId: number;
  committeeName: string;
  totalActions: number;
  completedActions: number;
  activeActions: number;
  overdueActions: number;
  onTimeRate: number | null;
}

/** Equivalent of the mysql/schema.sql `committee_action_summary` view, computed via Prisma. */
export async function committeeSummary(committeeIds?: number[]): Promise<CommitteeSummary[]> {
  const committees = await prisma.committee.findMany({
    where: committeeIds ? { id: { in: committeeIds } } : undefined,
    select: { id: true, name: true },
  });

  const results: CommitteeSummary[] = [];
  for (const c of committees) {
    const actions = await prisma.actionPoint.findMany({
      where: { committeeId: c.id },
      select: { status: true, deadline: true, completedAt: true },
    });
    const total = actions.length;
    const completed = actions.filter((a) => a.status === "COMPLETED");
    const active = actions.filter((a) =>
      ["OPEN", "IN_PROGRESS", "PENDING_VERIFICATION"].includes(a.status),
    ).length;
    const overdue = actions.filter((a) => a.status === "OVERDUE").length;
    const onTime = completed.filter((a) => a.completedAt && a.completedAt <= a.deadline).length;

    results.push({
      committeeId: c.id,
      committeeName: c.name,
      totalActions: total,
      completedActions: completed.length,
      activeActions: active,
      overdueActions: overdue,
      onTimeRate: total > 0 ? Math.round((onTime / total) * 1000) / 10 : null,
    });
  }
  return results;
}

export interface UrgentDashboardAction {
  id: number;
  referenceNo: string;
  title: string;
  priority: string;
  status: string;
  deadline: Date;
  progress: number;
  committee: { id: number; name: string; code: string };
  owner: { id: number; fullName: string; department: string | null };
}

export interface BankWideDashboard {
  totalActions: number;
  completedOnTime: number;
  dueWithin14Days: number;
  overdue: number;
  statusDistribution: Record<string, number>;
  priorityDistribution: Record<string, number>;
  onTimeRate: number | null;
  pendingVerificationCount: number;
  committeeSummaries: CommitteeSummary[];
  urgentActions: UrgentDashboardAction[];
}

export async function bankWideDashboard(): Promise<BankWideDashboard> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const in14 = new Date(today);
  in14.setUTCDate(in14.getUTCDate() + 14);

  const actions = await prisma.actionPoint.findMany({
    select: {
      id: true,
      referenceNo: true,
      title: true,
      priority: true,
      status: true,
      deadline: true,
      completedAt: true,
      progress: true,
      committee: { select: { id: true, name: true, code: true } },
      owner: { select: { id: true, fullName: true, department: true } },
    },
    orderBy: [{ deadline: "asc" }, { id: "desc" }],
  });

  const total = actions.length;
  const completed = actions.filter((a) => a.status === "COMPLETED");
  const completedOnTime = completed.filter((a) => a.completedAt && a.completedAt <= a.deadline).length;
  const dueWithin14Days = actions.filter(
    (a) =>
      ["OPEN", "IN_PROGRESS", "PENDING_VERIFICATION"].includes(a.status) &&
      a.deadline >= today &&
      a.deadline <= in14,
  ).length;
  const overdue = actions.filter((a) => a.status === "OVERDUE").length;
  const pendingVerificationCount = actions.filter((a) => a.status === "PENDING_VERIFICATION").length;

  const statusDistribution: Record<string, number> = {};
  const priorityDistribution: Record<string, number> = {};
  for (const a of actions) {
    statusDistribution[a.status] = (statusDistribution[a.status] ?? 0) + 1;
    priorityDistribution[a.priority] = (priorityDistribution[a.priority] ?? 0) + 1;
  }

  // Filter urgent actions requiring executive or committee attention:
  // Overdue items, Critical priority in progress, or items waiting for verification
  const urgentActions = actions
    .filter(
      (a) =>
        a.status === "OVERDUE" ||
        a.status === "PENDING_VERIFICATION" ||
        (a.priority === "CRITICAL" && ["OPEN", "IN_PROGRESS"].includes(a.status)) ||
        (a.priority === "HIGH" && a.deadline <= in14 && ["OPEN", "IN_PROGRESS"].includes(a.status)),
    )
    .slice(0, 15);

  const committeeSummaries = await committeeSummary();

  return {
    totalActions: total,
    completedOnTime,
    dueWithin14Days,
    overdue,
    statusDistribution,
    priorityDistribution,
    onTimeRate: total > 0 ? Math.round((completedOnTime / total) * 1000) / 10 : null,
    pendingVerificationCount,
    committeeSummaries,
    urgentActions,
  };
}

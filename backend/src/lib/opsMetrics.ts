/**
 * Lightweight in-process counters for ops visibility.
 * Reset on process restart (Azure Functions instance lifetime).
 */

export type OpsSnapshot = {
  startedAt: string;
  uptimeSeconds: number;
  mail: {
    batchesSent: number;
    batchesFailed: number;
    notificationsMarkedSent: number;
    notificationsMarkedFailed: number;
  };
  teams: {
    provisionAttempts: number;
    provisionSuccess: number;
    provisionFailed: number;
  };
};

const startedAt = new Date();

const mail = {
  batchesSent: 0,
  batchesFailed: 0,
  notificationsMarkedSent: 0,
  notificationsMarkedFailed: 0,
};

const teams = {
  provisionAttempts: 0,
  provisionSuccess: 0,
  provisionFailed: 0,
};

export function recordMailBatchSent(notificationCount: number): void {
  mail.batchesSent += 1;
  mail.notificationsMarkedSent += notificationCount;
}

export function recordMailBatchFailed(notificationCount: number): void {
  mail.batchesFailed += 1;
  mail.notificationsMarkedFailed += notificationCount;
}

export function recordTeamsAttempt(): void {
  teams.provisionAttempts += 1;
}

export function recordTeamsSuccess(): void {
  teams.provisionSuccess += 1;
}

export function recordTeamsFailed(): void {
  teams.provisionFailed += 1;
}

export function getOpsSnapshot(): OpsSnapshot {
  return {
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    mail: { ...mail },
    teams: { ...teams },
  };
}

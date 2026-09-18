export type CommitteeRole = "CHAIRPERSON" | "SECRETARY" | "MEMBER";

export type ActionStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "OVERDUE"
  | "PENDING_VERIFICATION"
  | "COMPLETED"
  | "CANCELLED";

export type ActionPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Me {
  id: number;
  fullName: string;
  email: string;
  department: string | null;
  isCentralCommittee: boolean;
  isAdmin: boolean;
  memberships: {
    committeeId: number;
    role: CommitteeRole;
    committee?: { id: number; name: string; code: string };
  }[];
}

export interface DirectoryUser {
  id: number;
  fullName: string;
  email: string;
  isCentralCommittee?: boolean;
  department: string | null;
}

export interface CommitteeSummary {
  id: number;
  name: string;
  code: string;
  mandate: string | null;
  meetingFrequency: string | null;
  chairperson: { id: number; fullName: string };
  secretary: { id: number; fullName: string };
  centralRep?: { id: number; fullName: string } | null;
  myRole: CommitteeRole | null;
  canEdit: boolean;
  committeeId: number;
  committeeName: string;
  totalActions: number;
  completedActions: number;
  activeActions: number;
  overdueActions: number;
  onTimeRate: number | null;
}

export interface Meeting {
  id: number;
  committeeId: number;
  reference: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venue: string | null;
  agenda: string | null;
  teamsRequested: boolean;
  teamsJoinUrl: string | null;
}

export interface CommitteeDetail {
  id: number;
  name: string;
  code: string;
  mandate: string | null;
  meetingFrequency: string | null;
  chairperson: { id: number; fullName: string };
  secretary: { id: number; fullName: string };
  centralRep?: { id: number; fullName: string } | null;
  myRole?: CommitteeRole | null;
  canEdit?: boolean;
  isCentralCommitteeViewOnly?: boolean;
  canManageCommittee?: boolean;
  canManageMembers?: boolean;
  members: { userId: number; fullName: string; email?: string; role: CommitteeRole }[];
  meetings: Meeting[];
  pendingVerification: {
    id: number;
    referenceNo: string;
    title: string;
    owner: { id: number; fullName: string };
    latestNote: string | null;
    submittedAt: string | null;
  }[];
  summary: {
    totalActions: number;
    completedActions: number;
    activeActions: number;
    overdueActions: number;
    onTimeRate: number | null;
  };
}

export interface ActionListItem {
  id: number;
  referenceNo: string;
  title: string;
  committee?: { id: number; name: string };
  committeeId?: number;
  meeting?: { id: number; title: string; reference: string };
  owner: { id: number; fullName: string };
  deadline: string;
  revisedDeadline?: string | null;
  dateRaised?: string;
  createdAt?: string;
  priority?: ActionPriority;
  status: ActionStatus;
  progress: number;
  minutesReference?: string | null;
}

export interface ActionUpdateRecord {
  id: number;
  author: { id: number; fullName: string };
  status: ActionStatus;
  progress: number;
  note: string;
  revisedDeadline: string | null;
  evidenceLink: string | null;
  evidenceFiles: { id: number; filename: string; mediaType: string; sizeBytes: number; scanResult: string }[];
  createdAt: string;
}

export interface ActionDetail {
  id: number;
  referenceNo: string;
  title: string;
  description: string | null;
  committee: { id: number; name: string };
  meeting: { id: number; title: string; reference: string };
  owner: { id: number; fullName: string };
  createdBy: { id: number; fullName: string };
  dateRaised: string;
  deadline: string;
  revisedDeadline: string | null;
  priority: ActionPriority;
  status: ActionStatus;
  progress: number;
  statusReason: string | null;
  minutesReference: string | null;
  completedAt: string | null;
  verifiedBy: { id: number; fullName: string } | null;
  verifiedAt: string | null;
  version: number;
  stakeholders: { userId: number; fullName: string; stakeholderType: string }[];
  updates: ActionUpdateRecord[];
}

export interface NotificationItem {
  id: number;
  notificationType: string;
  deliveryStatus: string;
  channel?: string;
  errorMessage?: string | null;
  scheduledFor: string;
  sentAt?: string | null;
  readAt: string | null;
  action: { id: number; referenceNo: string; title: string; committee: string } | null;
}

export interface UrgentDashboardAction {
  id: number;
  referenceNo: string;
  title: string;
  priority: ActionPriority;
  status: ActionStatus;
  deadline: string;
  progress: number;
  committee: { id: number; name: string; code: string };
  owner: { id: number; fullName: string; department: string | null };
}

export interface DashboardSummary {
  totalActions: number;
  completedOnTime: number;
  dueWithin14Days: number;
  overdue: number;
  statusDistribution: Record<string, number>;
  priorityDistribution?: Record<string, number>;
  onTimeRate: number | null;
  pendingVerificationCount?: number;
  committeeSummaries?: CommitteeSummary[];
  urgentActions?: UrgentDashboardAction[];
}

/** Append-only governance / security audit event (docs §9) */
export interface AuditEvent {
  eventId: string;
  occurredAt: string;
  actorUserId: number;
  actorFullName?: string;
  action: string;
  resourceType: string;
  resourceId: number | string;
  committeeId?: number | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  result: "SUCCEEDED" | "DENIED" | string;
  reason?: string | null;
  correlationId?: string | null;
}

export type MinutesStatus = "DRAFT" | "ISSUED" | "APPROVED";
export type MinutesSource = "LATEST_MEETING" | "PREVIOUS_MEETING" | "ALL_OPEN_ACTIONS";

export interface MinuteActionSnapshot {
  actionPointId: number;
  referenceNo: string;
  title: string;
  owner: { id: number; fullName: string };
  actionStatus: string;
  progressPercent: number;
  ownerRemarks: string | null;
  capturedAt: string;
  sourceMeetingId: number | null;
}

export interface MeetingMinutes {
  id: number;
  meetingId: number;
  status: MinutesStatus;
  sourcePopulation: MinutesSource | string;
  discussion: string | null;
  documentUrl: string | null;
  createdBy: { id: number; fullName: string };
  issuedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  meeting: {
    id: number;
    title: string;
    reference: string;
    startsAt: string;
    committeeId: number;
  };
  snapshots: MinuteActionSnapshot[];
}

import { api } from "./client";
import type {
  Me,
  DirectoryUser,
  CommitteeSummary,
  CommitteeDetail,
  Meeting,
  ActionListItem,
  ActionDetail,
  NotificationItem,
  DashboardSummary,
  AuditEvent,
  MeetingMinutes,
} from "@/types";

export const endpoints = {
  me: () => api.get<Me>("/me"),
  devUsers: () =>
    api.get<
      {
        id: number;
        fullName: string;
        email: string;
        department: string | null;
        isCentralCommittee: boolean;
        isAdmin: boolean;
        memberships?: {
          committeeId: number;
          role: "CHAIRPERSON" | "SECRETARY" | "MEMBER";
          committee?: { id: number; name: string; code: string };
        }[];
      }[]
    >("/dev/users"),

  directory: (q: string) => api.get<DirectoryUser[]>(`/directory?q=${encodeURIComponent(q)}`),

  committees: () => api.get<CommitteeSummary[]>("/committees"),
  committee: (id: number) => api.get<CommitteeDetail>(`/committees/${id}`),
  createCommittee: (data: {
    name: string;
    code: string;
    mandate?: string;
    meetingFrequency?: string;
    chairpersonId: number;
    secretaryId: number;
    centralRepId: number;
    memberIds: number[];
  }) => api.post(`/committees`, data),
  addCommitteeMember: (committeeId: number, data: { userId: number; role?: string }) =>
    api.post(`/committees/${committeeId}/members`, data),
  removeCommitteeMember: (committeeId: number, userId: number) =>
    api.delete(`/committees/${committeeId}/members/${userId}`),
  setCommitteeChair: (committeeId: number, data: { chairpersonId: number }) =>
    api.patch(`/committees/${committeeId}/chair`, data),
  setCommitteeCentralRep: (committeeId: number, data: { centralRepId: number | null }) =>
    api.patch(`/committees/${committeeId}/central-rep`, data),

  meetings: (committeeId: number) => api.get<Meeting[]>(`/committees/${committeeId}/meetings`),
  myMeetings: (params?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<
      {
        id: number;
        reference: string;
        title: string;
        startsAt: string;
        endsAt: string | null;
        venue: string | null;
        agenda?: string | null;
        teamsJoinUrl?: string | null;
        attendanceCount?: number;
        committee: { id: number; name: string; code: string };
      }[]
    >(`/me/meetings${suffix}`);
  },
  meetingDetail: (meetingId: number) => api.get(`/meetings/${meetingId}`),
  attendanceCheckIn: (meetingId: number, data: { token?: string; method?: string; userId?: number; note?: string }) =>
    api.post(`/meetings/${meetingId}/attendance/check-in`, data),
  setAttendanceSheet: (meetingId: number, url: string) =>
    api.post(`/meetings/${meetingId}/attendance/sheet`, { url }),
  listAttendance: (meetingId: number) => api.get(`/meetings/${meetingId}/attendance`),
  createMeeting: (
    committeeId: number,
    data: {
      reference?: string;
      title: string;
      startsAt: string;
      endsAt?: string;
      venue?: string;
      agenda?: string;
      teamsRequested?: boolean;
    },
  ) => api.post<Meeting>(`/committees/${committeeId}/meetings`, data),

  listMeetingMinutes: (meetingId: number) =>
    api.get<MeetingMinutes[]>(`/meetings/${meetingId}/minutes`),
  createMinutes: (
    meetingId: number,
    data: {
      sourcePopulation: string;
      discussion: string;
      includedActionPointIds: number[];
      documentUrl?: string;
    },
  ) => api.post<MeetingMinutes>(`/meetings/${meetingId}/minutes`, data),
  /** Find-or-create actions (multi-owner) and optionally create minutes linked to them */
  importMinutes: (
    meetingId: number,
    data: {
      discussion?: string;
      documentUrl?: string;
      actionsOnly?: boolean;
      sourcePopulation?: string;
      actions: {
        title: string;
        description?: string;
        ownerIds: number[];
        deadline?: string;
        priority?: string;
      }[];
    },
  ) =>
    api.post<{
      minutes: MeetingMinutes | null;
      actions: { actionId: number; created: boolean; title: string }[];
      summary: { created: number; linkedExisting: number };
    }>(`/meetings/${meetingId}/minutes/import`, data),
  getMinutes: (minutesId: number) => api.get<MeetingMinutes>(`/minutes/${minutesId}`),
  issueMinutes: (minutesId: number, data?: { documentUrl?: string }) =>
    api.post<MeetingMinutes>(`/minutes/${minutesId}/issue`, data ?? {}),
  approveMinutes: (minutesId: number) => api.post<MeetingMinutes>(`/minutes/${minutesId}/approve`, {}),
  exportMinutesUrl: (minutesId: number) => `/minutes/${minutesId}/export`,
  exportMinutes: (minutesId: number) => api.download(`/minutes/${minutesId}/export`, `minutes-${minutesId}.docx`),
  minutesMailPreview: (minutesId: number) =>
    api.get<{
      subject: string;
      htmlBody: string;
      textBody: string;
      attachments: { filename: string; contentType: string; content: string; encoding: string }[];
      recipientCount: number;
    }>(`/minutes/${minutesId}/mail-preview`),

  actionsForCommittee: (committeeId: number, params?: { status?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.q) qs.set("q", params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<ActionListItem[]>(`/committees/${committeeId}/actions${suffix}`);
  },
  allActions: (params?: {
    status?: string;
    q?: string;
    page?: number;
    pageSize?: number;
    committeeId?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.q) qs.set("q", params.q);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
    if (params?.committeeId) qs.set("committeeId", String(params.committeeId));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<{ total: number; page: number; pageSize: number; items: ActionListItem[] }>(
      `/actions${suffix}`,
    );
  },
  actionDetail: (id: number) => api.get<ActionDetail>(`/actions/${id}`),
  addActionComment: (actionId: number, body: string) =>
    api.post<{ id: number; body: string; createdAt: string; author: { id: number; fullName: string } }>(
      `/actions/${actionId}/comments`,
      { body },
    ),
  createAction: (
    committeeId: number,
    data: {
      meetingId: number;
      title: string;
      description?: string;
      ownerId: number;
      ownerIds?: number[];
      dateRaised?: string;
      deadline: string;
      priority?: string;
      minutesReference?: string;
      additionalStakeholderIds?: number[];
    },
  ) => api.post(`/committees/${committeeId}/actions`, data),

  /**
   * Append a status update. Pass `version` from ActionDetail for optimistic concurrency.
   * Server should reject with 409 VERSION_CONFLICT if the version does not match.
   */
  recordUpdate: (
    actionId: number,
    data: {
      status: string;
      progress: number;
      note: string;
      revisedDeadline?: string;
      evidenceLink?: string;
      evidenceFiles?: { storageKey: string; filename: string; mediaType: string; sizeBytes: number }[];
      version?: number;
    },
  ) => api.post(`/actions/${actionId}/updates`, data),
  uploadEvidence: (actionId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.postForm<{ storageKey: string; filename: string; mediaType: string; sizeBytes: number; sha256: string }>(
      `/actions/${actionId}/evidence/upload`,
      form,
    );
  },
  downloadEvidence: (evidenceId: number, filename?: string) =>
    api.download(`/evidence/${evidenceId}/download`, filename),
  /**
   * Verify (approve/return) a pending action. Pass `version` for optimistic concurrency.
   */
  verifyAction: (actionId: number, approve: boolean, note?: string, version?: number) =>
    api.post(`/actions/${actionId}/verify`, { approve, note, version }),
  reopenAction: (actionId: number, note: string, version?: number) =>
    api.post(`/actions/${actionId}/reopen`, { note, version }),
  modifyAction: (
    actionId: number,
    data: {
      title?: string;
      description?: string | null;
      ownerId?: number;
      deadline?: string;
      priority?: string;
      minutesReference?: string | null;
      version?: number;
    },
  ) => api.patch(`/actions/${actionId}`, data),
  deleteAction: (actionId: number, data?: { version?: number; hardDelete?: boolean }) =>
    api.delete(`/actions/${actionId}`, data),

  /** Audit trail for a single action (docs §9) */
  actionAudit: (actionId: number) => api.get<AuditEvent[]>(`/actions/${actionId}/audit`),

  /** Optional committee-scoped audit (admin / officers) */
  committeeAudit: (committeeId: number, params?: { limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<AuditEvent[]>(`/committees/${committeeId}/audit${suffix}`);
  },

  notifications: () => api.get<NotificationItem[]>("/notifications"),
  markNotificationRead: (id: number) => api.post(`/notifications/${id}/read`, {}),
  markAllNotificationsRead: () => api.post(`/notifications/read-all`, {}),

  dashboard: () => api.get<DashboardSummary>("/reports/dashboard"),
  /** CSV download of the action register (scoped to permitted committees). */
  actionsExport: () => api.download("/reports/actions-export", "action-register.csv"),
};


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

  directory: (q: string, limit?: number) => api.get<DirectoryUser[]>(`/directory?q=${encodeURIComponent(q)}${limit != null ? `&limit=${limit}` : ""}`),
  syncDirectory: () =>
    api.post<{
      created: number;
      updated: number;
      skipped: number;
      totalFromGraph: number;
      graphConfigured: boolean;
    }>("/directory/sync", {}),
  directoryStatus: () =>
    api.get<{
      activeUsers: number;
      linkedToEntra: number;
      graphConfigured: boolean;
      jwtConfigured: boolean;
      autoProvision: boolean;
    }>("/directory/status"),


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
  recordMeetingOutcome: (
    meetingId: number,
    data: {
      outcome: "HELD" | "DID_NOT_HOLD" | "POSTPONED";
      reason: string;
      postponedTo?: string;
      postponedEndsAt?: string;
    },
  ) => api.post(`/meetings/${meetingId}/outcome`, data),
  attendanceCheckIn: (meetingId: number, data: { token?: string; method?: string; userId?: number; note?: string }) =>
    api.post(`/meetings/${meetingId}/attendance/check-in`, data),
  setAttendanceSheet: (meetingId: number, url: string) =>
    api.post(`/meetings/${meetingId}/attendance/sheet`, { url }),
  listAttendance: (meetingId: number) => api.get(`/meetings/${meetingId}/attendance`),
  createMeeting: async (
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
    options?: { graphAccessToken?: string | null },
  ) => {
    const headers: Record<string, string> = {};
    let graphToken = options?.graphAccessToken ?? null;
    // Interactive Teams: acquire delegated OnlineMeetings.ReadWrite for /me/onlineMeetings
    if (data.teamsRequested && !graphToken) {
      try {
        const { acquireGraphTeamsToken } = await import("@/auth/graphToken");
        graphToken = await acquireGraphTeamsToken();
      } catch {
        // OBO on the API token may still succeed
      }
    }
    if (graphToken) {
      headers["X-Graph-Access-Token"] = graphToken;
    }
    return api.post<
      Meeting & {
        teamsProvisioned?: boolean;
        teamsOrganizer?: string | null;
        teamsEventId?: string | null;
        teamsJoinUrl?: string | null;
        teamsAuthMode?: "delegated" | "application" | null;
      }
    >(`/committees/${committeeId}/meetings`, data, { headers });
  },

  uploadMeetingPaper: (meetingId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.postForm<{ id: number; filename: string }>(`/meetings/${meetingId}/papers`, form);
  },
  listMeetingPapers: (meetingId: number) => api.get(`/meetings/${meetingId}/papers`),
  notifyMeetingPapers: (meetingId: number) => api.post(`/meetings/${meetingId}/papers/notify`, {}),
  listMeetingMinutes: (meetingId: number) =>
    api.get<MeetingMinutes[]>(`/meetings/${meetingId}/minutes`),
  uploadMinutesDocument: (meetingId: number, file: File, status: "DRAFT" | "FINAL", discussion?: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("status", status);
    if (discussion) form.append("discussion", discussion);
    return api.postForm<{
      id: number;
      status: string;
      filename: string | null;
      hasFile: boolean;
      sizeBytes: number | null;
    }>(`/meetings/${meetingId}/minutes/upload`, form);
  },
  downloadMinutesDocument: (minutesId: number, filename?: string) =>
    api.download(`/minutes/${minutesId}/download`, filename ?? `minutes-${minutesId}`),
  /** Fetch minutes file for in-app preview (inline disposition). */
  fetchMinutesDocumentBlob: (minutesId: number) =>
    api.fetchBlob(`/minutes/${minutesId}/download?inline=1`),
  /** Find-or-create actions (multi-owner) and optionally create/replace draft minutes */
  importMinutes: (
    meetingId: number,
    data: {
      discussion?: string;
      actionsOnly?: boolean;
      replaceExisting?: boolean;
      actions: {
        title: string;
        description?: string;
        ownerIds: number[];
        deadline?: string;
        priority?: string;
        status?: string;
        progress?: number;
      }[];
    },
  ) =>
    api.post<{
      minutes: MeetingMinutes | null;
      actions: { actionId: number; created: boolean; title: string }[];
      summary: { created: number; linkedExisting: number };
    }>(`/meetings/${meetingId}/minutes/import`, data),
  getMinutes: (minutesId: number) => api.get<MeetingMinutes>(`/minutes/${minutesId}`),

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


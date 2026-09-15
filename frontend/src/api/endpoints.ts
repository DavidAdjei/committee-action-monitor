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
} from "@/types";

export const endpoints = {
  me: () => api.get<Me>("/me"),
  devUsers: () =>
    api.get<
      { id: number; fullName: string; email: string; department: string | null; isCentralCommittee: boolean; isAdmin: boolean }[]
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
  setCommitteeChair: (committeeId: number, data: { chairpersonId: number }) =>
    api.patch(`/committees/${committeeId}/chair`, data),

  meetings: (committeeId: number) => api.get<Meeting[]>(`/committees/${committeeId}/meetings`),
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

  createMinutes: (
    meetingId: number,
    data: { sourcePopulation: string; discussion: string; includedActionPointIds: number[] },
  ) => api.post(`/meetings/${meetingId}/minutes`, data),
  issueMinutes: (minutesId: number) => api.post(`/minutes/${minutesId}/issue`, {}),

  actionsForCommittee: (committeeId: number, params?: { status?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.q) qs.set("q", params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<ActionListItem[]>(`/committees/${committeeId}/actions${suffix}`);
  },
  allActions: (params?: { status?: string; q?: string; page?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.q) qs.set("q", params.q);
    if (params?.page) qs.set("page", String(params.page));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<{ total: number; page: number; pageSize: number; items: ActionListItem[] }>(
      `/actions${suffix}`,
    );
  },
  actionDetail: (id: number) => api.get<ActionDetail>(`/actions/${id}`),
  createAction: (
    committeeId: number,
    data: {
      meetingId: number;
      title: string;
      description?: string;
      ownerId: number;
      dateRaised: string;
      deadline: string;
      priority?: string;
      minutesReference?: string;
      additionalStakeholderIds?: number[];
    },
  ) => api.post(`/committees/${committeeId}/actions`, data),

  recordUpdate: (
    actionId: number,
    data: {
      status: string;
      progress: number;
      note: string;
      revisedDeadline?: string;
      evidenceLink?: string;
      evidenceFiles?: { storageKey: string; filename: string; mediaType: string; sizeBytes: number }[];
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
  verifyAction: (actionId: number, approve: boolean, note?: string) =>
    api.post(`/actions/${actionId}/verify`, { approve, note }),

  notifications: () => api.get<NotificationItem[]>("/notifications"),
  markNotificationRead: (id: number) => api.post(`/notifications/${id}/read`, {}),
  markAllNotificationsRead: () => api.post(`/notifications/read-all`, {}),

  dashboard: () => api.get<DashboardSummary>("/reports/dashboard"),
};

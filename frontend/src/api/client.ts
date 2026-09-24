import { useLoadingStore } from "@/state/loadingStore";
import { getAccessToken } from "@/auth/token";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const DEV_USER_STORAGE_KEY = "cam.devUserId";

export function getDevUserId(): number | null {
  const raw = localStorage.getItem(DEV_USER_STORAGE_KEY);
  return raw ? Number(raw) : null;
}

export function setDevUserId(id: number | null) {
  if (id === null) localStorage.removeItem(DEV_USER_STORAGE_KEY);
  else localStorage.setItem(DEV_USER_STORAGE_KEY, String(id));
}

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }

  get isForbidden() {
    return this.status === 403 || this.code === "FORBIDDEN" || this.code === "UNAUTHORIZED";
  }

  get isConflict() {
    return this.status === 409 || this.code === "CONFLICT" || this.code === "VERSION_CONFLICT";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const devUserId = getDevUserId();
  const bearer = getAccessToken();
  const headers: Record<string, string> = {
    ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
    ...(devUserId ? { "x-dev-user-id": String(devUserId) } : {}),
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    ...((init?.headers as Record<string, string>) ?? {}),
  };

  useLoadingStore.getState().startRequest();
  try {
    const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

    if (res.status === 204) return undefined as T;

    const isJson = res.headers.get("content-type")?.includes("application/json");
    const body = isJson ? await res.json() : undefined;

    if (!res.ok) {
      const err = body?.error ?? { code: "UNKNOWN", message: res.statusText };
      const code = err.code ?? "UNKNOWN";
      let message = err.message ?? res.statusText;

      // Friendly defaults for authorization / concurrency failures
      if (res.status === 403 && !err.message) {
        message = "You are not authorized to perform this operation.";
      }
      if (res.status === 409 && !err.message) {
        message =
          "This record was changed by someone else. Refresh and try again with the latest version.";
      }

      throw new ApiClientError(res.status, code, message);
    }
    return body as T;
  } finally {
    useLoadingStore.getState().stopRequest();
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined }),
  postForm: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: data !== undefined ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "DELETE", body: data !== undefined ? JSON.stringify(data) : undefined }),
  download: async (path: string, fallbackFilename = "download"): Promise<void> => {
    const devUserId = getDevUserId();
    const bearer = getAccessToken();
    const headers: Record<string, string> = {
      ...(devUserId ? { "x-dev-user-id": String(devUserId) } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    };

    useLoadingStore.getState().startRequest();
    try {
      const res = await fetch(`${BASE_URL}${path}`, { method: "GET", headers });
      if (!res.ok) {
        let errMsg = res.statusText;
        let code = "DOWNLOAD_FAILED";
        try {
          const body = await res.json();
          if (body?.error?.message) errMsg = body.error.message;
          if (body?.error?.code) code = body.error.code;
        } catch {
          // ignore
        }
        if (res.status === 403) errMsg = errMsg || "You are not authorized to download this file.";
        throw new ApiClientError(res.status, code, errMsg);
      }

      const blob = await res.blob();
      let filename = fallbackFilename;
      const disposition = res.headers.get("content-disposition");
      if (disposition) {
        const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]*)["']?/i);
        if (match && match[1]) {
          filename = decodeURIComponent(match[1]);
        }
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } finally {
      useLoadingStore.getState().stopRequest();
    }
  },
};

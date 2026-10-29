import { useLoadingStore } from "@/state/loadingStore";
import { getAccessToken } from "@/auth/token";
import { safeDownloadFilename } from "@/lib/safeUrl";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

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

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const bearer = getAccessToken();
  return {
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    ...extra,
  };
}

async function parseError(res: Response): Promise<ApiClientError> {
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => undefined) : undefined;
  const err = body?.error ?? { code: "UNKNOWN", message: res.statusText };
  let message = err.message ?? res.statusText;
  if (res.status === 403 && !err.message) {
    message = "You are not authorized to perform this operation.";
  }
  if (res.status === 409 && !err.message) {
    message =
      "This record was changed by someone else. Refresh and try again with the latest version.";
  }
  return new ApiClientError(res.status, err.code ?? "UNKNOWN", message);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const headers = authHeaders({
    ...(init?.body && !isForm ? { "Content-Type": "application/json" } : {}),
    ...((init?.headers as Record<string, string>) ?? {}),
  });

  useLoadingStore.getState().startRequest();
  try {
    const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
    if (res.status === 204) return undefined as T;
    const isJson = res.headers.get("content-type")?.includes("application/json");
    const body = isJson ? await res.json() : undefined;
    if (!res.ok) {
      throw await parseError(res);
    }
    return body as T;
  } finally {
    useLoadingStore.getState().stopRequest();
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, init?: { headers?: Record<string, string> }) =>
    request<T>(path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers: init?.headers,
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "DELETE",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  postForm: <T>(path: string, form: FormData) =>
    request<T>(path, { method: "POST", body: form }),
  download: async (path: string, filename: string) => {
    useLoadingStore.getState().startRequest();
    try {
      const res = await fetch(`${BASE_URL}${path}`, { headers: authHeaders() });
      if (!res.ok) throw await parseError(res);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = safeDownloadFilename(filename);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      useLoadingStore.getState().stopRequest();
    }
  },
  /**
   * Fetch a binary file for in-app preview.
   * Returns the blob plus content-type / filename from response headers when present.
   */
  fetchBlob: async (
    path: string,
  ): Promise<{ blob: Blob; contentType: string | null; filename: string | null }> => {
    useLoadingStore.getState().startRequest();
    try {
      const res = await fetch(`${BASE_URL}${path}`, { headers: authHeaders() });
      if (!res.ok) throw await parseError(res);
      const blob = await res.blob();
      const contentType = res.headers.get("content-type");
      const cd = res.headers.get("content-disposition");
      let filename: string | null = null;
      if (cd) {
        const utf = /filename\*=UTF-8''([^;]+)/i.exec(cd);
        const plain = /filename="?([^";]+)"?/i.exec(cd);
        const raw = utf?.[1] ?? plain?.[1];
        if (raw) {
          try {
            filename = decodeURIComponent(raw.trim());
          } catch {
            filename = raw.trim();
          }
        }
      }
      return { blob, contentType, filename };
    } finally {
      useLoadingStore.getState().stopRequest();
    }
  },
};

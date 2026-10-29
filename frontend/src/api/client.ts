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
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
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
      if (/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(blob.type)) {
        throw new ApiClientError(415, "UNSAFE_DOWNLOAD", "Unexpected HTML download response.");
      }
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = safeDownloadFilename(filename);
        document.body.appendChild(a);
        try { a.click(); } finally { a.remove(); }
      } finally {
        URL.revokeObjectURL(url);
      }
    } finally {
      useLoadingStore.getState().stopRequest();
    }
  },
  fetchBlob: async (path: string): Promise<Blob> => {
    useLoadingStore.getState().startRequest();
    try {
      const res = await fetch(`${BASE_URL}${path}`, { headers: authHeaders() });
      if (!res.ok) throw await parseError(res);
      return await res.blob();
    } finally {
      useLoadingStore.getState().stopRequest();
    }
  },
};

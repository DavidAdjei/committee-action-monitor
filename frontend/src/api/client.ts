import { useLoadingStore } from "@/state/loadingStore";

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
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const devUserId = getDevUserId();
  const headers: Record<string, string> = {
    ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
    ...(devUserId ? { "x-dev-user-id": String(devUserId) } : {}),
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
      throw new ApiClientError(res.status, err.code, err.message);
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
};

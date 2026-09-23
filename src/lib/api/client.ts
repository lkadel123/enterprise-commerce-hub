export interface ApiFieldError {
  path?: string;
  message: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: ApiFieldError[];
}

/** Error thrown for any non-2xx response, carrying the backend error contract. */
export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ApiFieldError[];

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = payload.code;
    if (payload.details && payload.details.length > 0) {
      this.details = payload.details;
    }
  }
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    const field = error.details?.[0];
    if (field && field.message) {
      return field.path ? `${field.path}: ${field.message}` : field.message;
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

/** Backend response envelope (see backend/src/utils/ApiResponse.ts). */
export interface ApiEnvelope<T> {
  success?: boolean;
  data: T;
  meta?: { page: number; pageSize: number; total: number; totalPages: number };
  message?: string;
}

const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
let refreshRunner: (() => Promise<string | null>) | null = null;

let onUnauthenticated: (() => void) | null = null;

let refreshPromise: Promise<string | null> | null = null;

/**
 * Wire the session layer: refresh executor + unauthenticated handler
 * (registered by AdminAuthContext once mounted).
 */
export function configureAdminClient(options: {
  refresh: () => Promise<string | null>;
  onUnauthenticated: () => void;
}): void {
  refreshRunner = options.refresh;
  onUnauthenticated = options.onUnauthenticated;
}

function runRefresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise =
      refreshRunner?.()
        .catch(() => null)
        .finally(() => {
          refreshPromise = null;
        }) ?? Promise.resolve(null);
  }
  return refreshPromise;
}

export interface AdminRequestOptions {
  body?: unknown;
  method?: string;
  signal?: AbortSignal;
  includeCredentials?: boolean;
  headers?: Record<string, string>;
}

export async function adminFetch<T>(
  path: string,
  options: AdminRequestOptions = {},
): Promise<ApiEnvelope<T>> {
  const { body, signal, method, includeCredentials = true, headers: extraHeaders } = options;
  const headers = new Headers();
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (extraHeaders) {
    for (const [name, value] of Object.entries(extraHeaders)) {
      headers.set(name, value);
    }
  }

  const currentToken = accessToken;
  if (currentToken) {
    headers.set("Authorization", `Bearer ${currentToken}`);
  }

  const init: RequestInit = {
    method: method ?? "GET",
    headers,
    ...(signal ? { signal } : {}),
    ...(includeCredentials ? { credentials: "include" } : {}),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  const url = `${API_BASE_URL}${path}`;
  let response = await fetch(url, init);

  // Auth endpoints manage their own token lifecycle — a 401 there is a
  // credential problem, not a "please refresh" signal.
  const isAuthEndpoint =
    path.startsWith("/auth/login") ||
    path.startsWith("/auth/refresh") ||
    path.startsWith("/auth/logout");

  if (response.status === 401 && !isAuthEndpoint) {
    const newToken = await runRefresh();
    if (newToken) {
      const retryHeaders = new Headers(headers);
      retryHeaders.set("Authorization", `Bearer ${newToken}`);
      response = await fetch(url, { ...init, headers: retryHeaders });
    } else {
      onUnauthenticated?.();
      throw await parseError(response);
    }
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) {
    return undefined as unknown as ApiEnvelope<T>;
  }

  return (await response.json()) as ApiEnvelope<T>;
}

async function parseError(response: Response): Promise<AdminApiError> {
  let payload: ApiErrorPayload | undefined;
  try {
    const body = (await response.json()) as { error?: ApiErrorPayload };
    payload = body.error;
  } catch {
    payload = undefined;
  }
  return new AdminApiError(
    response.status,
    payload ?? {
      code: "HTTP_ERROR",
      message: `Request failed (${response.status} ${response.statusText}).`,
    },
  );
}

/** Multipart upload (media). Sends the access token, no JSON content-type. */
export async function adminUpload<T>(
  path: string,
  file: File,
  options: { signal?: AbortSignal; alt?: string } = {},
): Promise<ApiEnvelope<T>> {
  const headers = new Headers();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  const form = new FormData();
  form.append("file", file);
  if (options.alt) form.append("alt", options.alt);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    credentials: "include",
    ...(options.signal ? { signal: options.signal } : {}),
    body: form,
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  return (await response.json()) as ApiEnvelope<T>;
}

export function buildQuery(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/** Public backend API base URL. */
export const API_BASE_URL = viteEnv?.["VITE_API_URL"] || "http://localhost:4000/api/v1";

let accessToken: string | null = null;

/** Publish a fresh admin access token (or null on logout/session loss). */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

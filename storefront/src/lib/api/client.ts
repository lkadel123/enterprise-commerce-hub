import { API_BASE_URL } from "@/config/env";
import type { ApiFieldError } from "@/types";

/**
 * Thin HTTP transport for the storefront API client.
 *
 * Reads the backend API base URL from env, wraps `fetch`, unwraps the backend
 * success/error envelopes and throws typed `ApiClientError`s. No UI concerns
 * live here — components consume the domain modules in `lib/api/*`.
 */

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: ApiFieldError[];
}

/** Error thrown for any non-2xx response, carrying the backend error contract. */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ApiFieldError[];

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = payload.code;
    if (payload.details && payload.details.length > 0) {
      this.details = payload.details;
    }
  }
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
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

async function parseError(response: Response): Promise<ApiClientError> {
  let payload: ApiErrorPayload | undefined;
  try {
    const body = (await response.json()) as { error?: ApiErrorPayload };
    payload = body.error;
  } catch {
    payload = undefined;
  }
  return new ApiClientError(
    response.status,
    payload ?? {
      code: "HTTP_ERROR",
      message: `Request failed (${response.status} ${response.statusText}).`,
    },
  );
}

export interface ApiRequestOptions {
  /** Request body to be JSON-serialized. */
  body?: unknown;
  /** HTTP method (defaults to "GET" when omitted). */
  method?: string;
  /** Optional AbortSignal for request cancellation. */
  signal?: AbortSignal;
  includeCredentials?: boolean;
  /** Extra request headers (e.g. Idempotency-Key). Merged over defaults. */
  headers?: Record<string, string>;
}

/**
 * In-memory access token for the customer auth session.
 *
 * The customer access token lives only in memory (a module-level variable)
 * and is never persisted to localStorage/sessionStorage. The httpOnly
 * refresh cookie is sent automatically via `credentials: "include"`.
 *
 * The `CustomerAuthContext` calls `setAccessToken` after login/refresh
 * and `setAccessToken(null)` on logout, 401-failure, and refresh-failure.
 */
let accessToken: string | null = null;

/** Called by the auth context to publish a new access token (or null on logout). */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

function getAccessToken(): string | null {
  return accessToken;
}

let refreshRunner: (() => Promise<string | null>) | null = null;

let onUnauthenticated: (() => void) | null = null;

let refreshPromise: Promise<string | null> | null = null;

export function configureClient(options: {
  refresh: () => Promise<string | null>;
  onUnauthenticated: () => void;
}): void {
  refreshRunner = options.refresh;
  onUnauthenticated = options.onUnauthenticated;
}

/**
 * Run the configured refresh function.
 *
 * Only one refresh request is allowed at a time — concurrent callers share
 * the same promise. The promise is cleared in `.finally()` so that a
 * subsequent 401 can trigger a fresh refresh.
 */
async function runRefresh(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (refreshRunner ? refreshRunner() : Promise.resolve(null))
    .catch(() => null)
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

/**
 * Perform a request against the backend API and return the decoded JSON body
 * (the full envelope, e.g. `{ success, data, meta }`).
 *
 * - Attaches `Authorization: Bearer <accessToken>` when an access token exists.
 * - Sends `credentials: "include"` by default so the httpOnly refresh cookie
 *   is transmitted. Login/register/refresh set `includeCredentials: false`
 *   to avoid sending a stale cookie on auth endpoints.
 * - On 401 (and only for authenticated, non-auth paths) triggers a single-flight
 *   refresh, then retries the original request once.
 * - On refresh failure (or if no refresh is configured yet), clears the
 *   in-memory token and invokes `onUnauthenticated`.
 */
export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
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

  /**
   * If the access token expired, refresh it and retry once.
   *
   * Auth endpoints (login/register/refresh/logout) must NOT trigger a
   * refresh — they handle their own token lifecycle. In particular, a 401
   * from `/auth/customer/refresh` is the expected "no/expired session"
   * signal during boot-time anonymous session detection: it is thrown as a
   * typed ApiClientError and resolved to Guest Mode by `CustomerAuthContext`
   * (never treated as a generic application error, no redirect loop). This
   * does NOT relax 401 handling for authenticated API paths, which still
   * trigger the single-flight refresh-and-retry above.
   */
  const isAuthEndpoint =
    path.startsWith("/auth/customer/login") ||
    path.startsWith("/auth/customer/register") ||
    path.startsWith("/auth/customer/refresh") ||
    path.startsWith("/auth/customer/logout");

  const shouldRefresh = response.status === 401 && !isAuthEndpoint;

  if (shouldRefresh) {
    const newToken = await runRefresh();

    if (newToken) {
      const retryHeaders = new Headers(headers);
      retryHeaders.set("Authorization", `Bearer ${newToken}`);

      const retryInit: RequestInit = {
        ...init,
        headers: retryHeaders,
      };

      response = await fetch(url, retryInit);
    } else {
      onUnauthenticated?.();
      throw await parseError(response);
    }
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  /**
   * No-content response.
   */
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  /**
   * Successful JSON response.
   */
  const json = await response.json();

  return json as T;
}

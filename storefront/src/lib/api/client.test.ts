import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  ApiClientError,
  apiErrorMessage,
  apiFetch,
  configureClient,
  setAccessToken,
} from "@/lib/api/client";
import { API_BASE_URL } from "@/config/env";
import { authState, resetAuthState } from "@/test/handlers/auth";
import { resetCommerceState } from "@/test/handlers/commerce";
import { server } from "@/test/server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

/** Transport layer behaviour: envelopes, error mapping, single-flight refresh. */
describe("api client transport", () => {
  beforeEach(() => {
    resetAuthState();
    resetCommerceState();
  });

  it("returns the decoded success envelope", async () => {
    authState.refreshValid = true;
    const result = await apiFetch<{ success: boolean }>("/auth/customer/refresh", {
      method: "POST",
    });
    expect(result.success).toBe(true);
  });

  it("throws typed ApiClientError carrying backend code/details", async () => {
    let thrown: unknown;
    try {
      await apiFetch("/auth/customer/login", {
        method: "POST",
        body: { email: "wrong@test.com", password: "nope" },
        includeCredentials: false,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ApiClientError);
    const err = thrown as ApiClientError;
    expect(err.status).toBe(401);
    expect(err.code).toBe("INVALID_CREDENTIALS");
  });

  it("maps errors to friendly messages via apiErrorMessage", () => {
    const err = new ApiClientError(401, { code: "X", message: "Invalid email or password." });
    expect(apiErrorMessage(err)).toBe("Invalid email or password.");
    expect(apiErrorMessage(new Error("boom"))).toBe("boom");
    expect(apiErrorMessage("weird")).toBe("Something went wrong. Please try again.");
  });

  it("attaches the Bearer token from memory when set", async () => {
    setAccessToken("tok-123");
    // /me echoes 200 only with an Authorization header present.
    const result = await apiFetch<{ success: boolean }>("/auth/customer/me");
    expect(result.success).toBe(true);
  });

  it("single-flights concurrent refreshes: N parallel 401s trigger exactly one refresh retry", async () => {
    const { http, HttpResponse } = await import("msw");
    let refreshed = false;
    let refreshCalls = 0;
    server.use(
      http.get(`${API_BASE_URL}/flaky`, ({ request }) => {
        if (!refreshed || !request.headers.get("authorization"))
          return HttpResponse.json({}, { status: 401 });
        return HttpResponse.json({ success: true, data: "ok" });
      }),
      http.post(`${API_BASE_URL}/auth/customer/refresh`, () => {
        refreshCalls += 1;
        refreshed = true;
        return HttpResponse.json({
          success: true,
          data: { customer: { id: "c1", name: "A", email: "a@t.com" }, accessToken: "new-token" },
        });
      }),
    );

    configureClient({
      refresh: async () => {
        const res = await fetch(`${API_BASE_URL}/auth/customer/refresh`, {
          method: "POST",
        });
        if (!res.ok) return null;
        setAccessToken("new-token");
        return "new-token";
      },
      onUnauthenticated: () => undefined,
    });
    setAccessToken("stale");

    const results = await Promise.all([apiFetch("/flaky"), apiFetch("/flaky"), apiFetch("/flaky")]);
    expect(results.every((r) => (r as { success: boolean }).success)).toBe(true);
    expect(refreshCalls).toBe(1);
  });

  it("clears the session when refresh fails", async () => {
    const { http, HttpResponse } = await import("msw");
    // Force a 401 on an authenticated endpoint to exercise the retry path.
    server.use(
      http.get(`${API_BASE_URL}/customer/orders`, () =>
        HttpResponse.json(
          { success: false, error: { code: "UNAUTHENTICATED", message: "expired" } },
          { status: 401 },
        ),
      ),
    );
    authState.refreshValid = false;
    let unauthenticated = false;
    configureClient({
      refresh: async () => null,
      onUnauthenticated: () => {
        unauthenticated = true;
      },
    });
    setAccessToken("stale");
    await expect(apiFetch("/customer/orders")).rejects.toBeInstanceOf(ApiClientError);
    expect(unauthenticated).toBe(true);
  });
});

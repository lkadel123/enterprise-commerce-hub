import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";

import { authState, resetAuthState } from "@/test/handlers/auth";
import { resetCommerceState } from "@/test/handlers/commerce";
import { server } from "@/test/server";
import { CustomerAuthProvider } from "@/lib/auth/CustomerAuthContext";
import { setCustomerSessionHintCookie } from "@/lib/auth/sessionHint";
import { API_BASE_URL } from "@/config/env";

const navigateMock = vi.fn().mockResolvedValue(undefined);
let currentPath = "/account/orders";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ pathname: currentPath }),
}));

const { AuthGuard } = await import("./AuthGuard");

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderGuard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CustomerAuthProvider>
        <AuthGuard>
          <div>PROTECTED CONTENT</div>
        </AuthGuard>
      </CustomerAuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  navigateMock.mockClear();
  navigateMock.mockResolvedValue(undefined);
  currentPath = "/account/orders";
  resetAuthState();
  resetCommerceState();
});

describe("AuthGuard", () => {
  it("shows a loader (never protected content) while the session is restoring", async () => {
    renderGuard();
    expect(screen.queryByText("PROTECTED CONTENT")).not.toBeInTheDocument();
  });

  it("redirects unauthenticated visitors to /login with the current path as redirect param", async () => {
    renderGuard(); // refresh cookie invalid by default → unauthenticated
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "/login",
          search: { redirect: "/account/orders" },
        }),
      ),
    );
    expect(screen.queryByText("PROTECTED CONTENT")).not.toBeInTheDocument();
  });

  it("falls back to '/' when the current path is not a safe redirect target", async () => {
    currentPath = "//evil.example";
    renderGuard();
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({ search: { redirect: "/" } }),
      ),
    );
  });

  it("renders protected content once authenticated", async () => {
    // A valid refresh cookie restores the session on mount.
    authState.refreshValid = true;
    renderGuard();
    expect(await screen.findByText("PROTECTED CONTENT")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalledWith(expect.objectContaining({ to: "/login" }));
  });

  it("a guest browser (no hint cookie) resolves unauthenticated WITHOUT calling refresh", async () => {
    // Fresh browser: no session-hint cookie → the boot path must not issue
    // the refresh request at all (no 401 network noise, no redirect loop).
    setCustomerSessionHintCookie(false);
    let refreshCalls = 0;
    server.use(
      http.post(`${API_BASE_URL}/auth/customer/refresh`, () => {
        refreshCalls += 1;
        return HttpResponse.json(
          { success: false, error: { code: "UNAUTHENTICATED", message: "No session." } },
          { status: 401 },
        );
      }),
    );

    renderGuard();
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({ to: "/login", search: { redirect: "/account/orders" } }),
      ),
    );
    expect(refreshCalls).toBe(0);
    expect(screen.queryByText("PROTECTED CONTENT")).not.toBeInTheDocument();
  });

  it("an expired session (hint present, refresh 401) resolves to guest mode and clears the hint", async () => {
    // Hint cookie present (browser was signed in) but the refresh session is
    // expired: the 401 is the expected unauthenticated signal — no error, no
    // redirect loop, and the stale hint is dropped for future boots.
    authState.refreshValid = false;
    renderGuard();
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({ to: "/login", search: { redirect: "/account/orders" } }),
      ),
    );
    expect(screen.queryByText("PROTECTED CONTENT")).not.toBeInTheDocument();
    expect(document.cookie).not.toContain("customer_session_hint=1");
  });
});

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { resetAuthState } from "@/test/handlers/auth";
import { resetCommerceState } from "@/test/handlers/commerce";
import { server } from "@/test/server";
import { CustomerAuthProvider } from "@/lib/auth/CustomerAuthContext";

const navigateMock = vi.fn().mockResolvedValue(undefined);

interface CallbackSearchState {
  error?: string;
  redirect?: string;
  terms?: boolean | number;
}

/**
 * Search params the auth-callback route component receives. The real router
 * runs the route's `validateSearch`, normalising `?terms=1` (parsed as the
 * number 1) into the boolean `true`; these tests pass that post-validation
 * value directly.
 * NOTE: vi.mock factories may only reference `mock*`-prefixed outer variables.
 */
let mockCallbackSearch: CallbackSearchState = {};

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate-target">{to}</div>,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useSearch: () => mockCallbackSearch,
  // The route file chains `createFileRoute(path)({...})`; stub it so the config
  // (including the component) is returned as the exported `Route`.
  createFileRoute: () => (config: unknown) => config,
}));

const { Route } = await import("@/routes/auth.callback");

const CallbackComponent = (Route as unknown as { component: () => ReactNode }).component;

function renderCallback() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CustomerAuthProvider>
        <CallbackComponent />
      </CustomerAuthProvider>
    </QueryClientProvider>,
  );
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  navigateMock.mockClear();
  navigateMock.mockResolvedValue(undefined);
  mockCallbackSearch = {};
  resetAuthState();
  resetCommerceState();
});

async function acceptConsent() {
  const user = userEvent.setup();
  const checkbox = await screen.findByRole("checkbox", {
    name: /terms & conditions/i,
  });
  // Unchecked by default.
  expect(checkbox.getAttribute("aria-checked")).not.toBe("true");
  await user.click(checkbox);
  await user.click(screen.getByRole("button", { name: /create my account/i }));
}

describe("auth callback Terms consent", () => {
  it("shows the consent step on ?terms=1 without creating anything beforehand", async () => {
    mockCallbackSearch = { terms: true, redirect: "/checkout" };
    renderCallback();

    expect(await screen.findByRole("heading", { name: /almost done/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /terms & conditions/i })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(screen.getByRole("link", { name: /privacy policy/i })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("blocks submission until the checkbox is checked (accessible validation)", async () => {
    mockCallbackSearch = { terms: true };
    renderCallback();

    const user = userEvent.setup();
    await screen.findByRole("checkbox", { name: /terms & conditions/i });
    await user.click(screen.getByRole("button", { name: /create my account/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/terms & conditions/i);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("completes registration after acceptance and navigates to the safe target", async () => {
    mockCallbackSearch = { terms: true, redirect: "/checkout" };
    renderCallback();

    await acceptConsent();

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(expect.objectContaining({ to: "/checkout" })),
    );
  });

  it("prefers a backend error code over the consent step", async () => {
    mockCallbackSearch = { terms: true, error: "oauth_failed" };
    renderCallback();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /sign-in unsuccessful/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("checkbox", { name: /terms & conditions/i })).not.toBeInTheDocument();
  });
});

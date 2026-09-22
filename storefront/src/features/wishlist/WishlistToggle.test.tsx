import { beforeEach, afterAll, beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { resetAuthState } from "@/test/handlers/auth";
import { resetCommerceState } from "@/test/handlers/commerce";
import { server } from "@/test/server";
import { CustomerAuthProvider } from "@/lib/auth/CustomerAuthContext";

// The component uses TanStack Router hooks; stub them so tests run without a
// full router tree while still asserting the navigation target.
const navigateMock = vi.fn().mockResolvedValue(undefined);
let currentPath = "/products/aurora-27-monitor";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ pathname: currentPath }),
}));

const { WishlistToggle } = await import("./WishlistToggle");

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderToggle(productId = "prod-1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CustomerAuthProvider>
        <WishlistToggle productId={productId} />
      </CustomerAuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  navigateMock.mockClear();
  navigateMock.mockResolvedValue(undefined);
  resetAuthState();
  resetCommerceState();
});

describe("WishlistToggle", () => {
  it("redirects unauthenticated users to login with a safe redirect param", async () => {
    const user = userEvent.setup();
    renderToggle();
    // Session restore fails (refresh cookie invalid) → unauthenticated.
    const button = await screen.findByRole("button", { name: /add to wishlist/i });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "/login",
          search: { redirect: "/products/aurora-27-monitor" },
        }),
      ),
    );
  });

  it("does not navigate with an unsafe current path", async () => {
    currentPath = "//evil.example";
    try {
      const user = userEvent.setup();
      renderToggle();
      const button = await screen.findByRole("button", { name: /add to wishlist/i });
      await waitFor(() => expect(button).toBeEnabled());
      await user.click(button);
      await waitFor(() => expect(navigateMock).toHaveBeenCalled());
      expect(navigateMock.mock.calls[0]![0]).toMatchObject({ search: { redirect: "/" } });
    } finally {
      currentPath = "/products/aurora-27-monitor";
    }
  });
});

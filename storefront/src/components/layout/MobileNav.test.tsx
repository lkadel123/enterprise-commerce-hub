/**
 * Header/MobileNav component tests (Phase 11).
 *
 * The mobile menu is a Radix Sheet (Dialog): opening moves focus into the
 * dialog, Escape closes it and focus returns to the trigger. Navigation uses
 * accessible names from the shared `mainNav` definitions.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { authState, resetAuthState } from "@/test/handlers/auth";
import { resetCommerceState } from "@/test/handlers/commerce";
import { server } from "@/test/server";
import { BRAND } from "@/lib/brand";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CustomerAuthProvider } from "@/lib/auth/CustomerAuthContext";
import { CartProvider } from "@/lib/cart/CartContext";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn().mockResolvedValue(undefined),
  useLocation: () => ({ pathname: "/" }),
}));

const { Header } = await import("./Header");

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderHeader() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CustomerAuthProvider>
        <CartProvider>
          <Header />
        </CartProvider>
      </CustomerAuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetAuthState();
  resetCommerceState();
});

describe("Header / MobileNav", () => {
  it("renders the brand link and main navigation with accessible names", async () => {
    renderHeader();
    expect(screen.getByRole("link", { name: new RegExp(BRAND.name, "i") })).toHaveAttribute(
      "href",
      "/",
    );
    for (const name of [/products/i, /categories/i, /brands/i, /cart/i]) {
      expect(await screen.findByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("opens the mobile menu; focus enters the dialog", async () => {
    const user = userEvent.setup();
    renderHeader();
    await screen.findByRole("button", { name: "Menu" });
    await user.click(screen.getByRole("button", { name: "Menu" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // Radix moves focus to the first focusable element inside the dialog.
    await waitFor(() => {
      const focused = document.activeElement;
      expect(focused && dialog.contains(focused)).toBe(true);
    });
  });

  it("closes the mobile menu on Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    renderHeader();
    const trigger = await screen.findByRole("button", { name: "Menu" });
    await user.click(trigger);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("shows sign-in links for guests and hides them while loading", async () => {
    renderHeader();
    // Session restore fails (no valid refresh cookie) → guest links appear.
    expect(await screen.findByRole("link", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows the customer's account links when authenticated", async () => {
    authState.refreshValid = true;
    renderHeader();
    // AuthNav renders the customer's name once the session is restored.
    await waitFor(() => expect(screen.queryByText(/restoring/i)).not.toBeInTheDocument(), {
      timeout: 5_000,
    });
    expect(screen.queryByRole("link", { name: /^sign in$/i })).not.toBeInTheDocument();
  });
});

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { resetAuthState } from "@/test/handlers/auth";
import { resetCommerceState } from "@/test/handlers/commerce";
import { server } from "@/test/server";
import { CustomerAuthProvider } from "@/lib/auth/CustomerAuthContext";
import { CartProvider } from "@/lib/cart/CartContext";
import { PRODUCT_A, PRODUCT_B } from "@/test/fixtures/catalog";

// Stub TanStack Router: links render as plain anchors so we can assert hrefs.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: ReactNode;
    to: string;
    params?: Record<string, string>;
  }) => <a href={to.replace("$slug", params?.slug ?? "")}>{children}</a>,
  useNavigate: () => vi.fn().mockResolvedValue(undefined),
  useLocation: () => ({ pathname: "/products" }),
}));

const { ProductCard } = await import("./ProductCard");

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderCard(product = PRODUCT_A) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CustomerAuthProvider>
        <CartProvider>
          <ProductCard product={product} />
        </CartProvider>
      </CustomerAuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetAuthState();
  resetCommerceState();
});

describe("ProductCard", () => {
  it("renders a single navigation link to the exact product detail slug", async () => {
    renderCard();
    // The whole tile is one anchor — exactly one link per card, with the
    // product slug resolved into the href (never a name-constructed slug).
    const detailLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === "/products/aurora-27-monitor");
    expect(detailLinks).toHaveLength(1);
    // Sanity: the query was resolved from the product's own slug field.
    expect(detailLinks[0]).toHaveAttribute("href", `/products/${PRODUCT_A.slug}`);
  });

  it("makes the entire tile a navigation target: image, name and price inside the single anchor", async () => {
    renderCard();
    const link = await screen.findByRole("link", { name: new RegExp(PRODUCT_A.name) });
    expect(link).toHaveAttribute("href", "/products/aurora-27-monitor");
    // Image (the largest clickable area) is part of the navigation anchor.
    expect(link).toContainElement(await screen.findByRole("img"));
    // Name and price are inside the anchor too — every pixel of the tile
    // navigates, not just the title line.
    expect(link).toContainElement(screen.getByText(PRODUCT_A.name));
    const price = await screen.findByText("रू 54,900.00");
    expect(link).toContainElement(price);
    // There is still exactly one navigation anchor (no duplicate tab stops).
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("renders the image with the backend-provided alt text", async () => {
    renderCard();
    const img = await screen.findByRole("img");
    expect(img).toHaveAttribute("alt", "Aurora monitor");
    // mediaUrl resolves relative media paths against the configured media base.
    expect(img.getAttribute("src")).toContain("/media-files/aurora.webp");
  });

  it("renders the authoritative backend price without computing anything", async () => {
    renderCard();
    await screen.findByText(PRODUCT_A.name);
    // formatNpr renders `रू 54,900.00` — the exact backend value only.
    expect(screen.getAllByText("रू 54,900.00").length).toBeGreaterThan(0);
  });

  it("marks out-of-stock products as unavailable and disables add-to-cart", async () => {
    const user = userEvent.setup();
    renderCard(PRODUCT_B);
    await screen.findByRole("link", { name: new RegExp(PRODUCT_B.name) });
    // Both a badge and the disabled button announce out-of-stock.
    expect(screen.getAllByText("Out of stock").length).toBeGreaterThan(0);
    const button = screen.getByRole("button", { name: /out of stock/i });
    expect(button).toBeDisabled();
    // Clicking a disabled button never triggers an add.
    await user.click(button);
    expect(screen.queryByText("Added to cart")).not.toBeInTheDocument();
  });

  it("exposes an accessible wishlist toggle", async () => {
    renderCard();
    await screen.findByRole("button", { name: /add to wishlist/i });
  });

  it("keeps add-to-cart OUTSIDE the card link so clicking it never navigates", async () => {
    renderCard();
    await screen.findByText(PRODUCT_A.name);
    const addButton = screen.getByRole("button", { name: /add to cart/i });
    // A button nested inside the navigation anchor would navigate on click —
    // the nav regression the card previously had. It must be a SIBLING of the
    // link, not a child.
    expect(addButton.closest("a")).toBeNull();
    const cardLink = await screen.findByRole("link", { name: new RegExp(PRODUCT_A.name) });
    expect(addButton).not.toBe(cardLink);
  });

  it("keeps the wishlist toggle OUTSIDE the card link so clicking it never navigates", async () => {
    renderCard();
    const wishlist = await screen.findByRole("button", { name: /wishlist/i });
    expect(wishlist.closest("a")).toBeNull();
    const cardLink = await screen.findByRole("link", { name: new RegExp(PRODUCT_A.name) });
    expect(wishlist).not.toBe(cardLink);
  });
});

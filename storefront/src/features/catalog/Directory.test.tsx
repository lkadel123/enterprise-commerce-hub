import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";

import { BrandCard, CategoryCard, DirectoryGrid } from "./Directory";
import type { PublicBrandDto, PublicCategoryDto } from "@/types";

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
}));

const CATEGORY: PublicCategoryDto = {
  id: "cat-1",
  name: "Electronics",
  slug: "electronics",
  parent: null,
  description: "Devices and gadgets.",
  sort: 1,
  productCount: 12,
};

const EMPTY_CATEGORY: PublicCategoryDto = {
  ...CATEGORY,
  id: "cat-2",
  name: "Empty",
  slug: "empty",
  productCount: 0,
};

const BRAND: PublicBrandDto = {
  id: "brand-1",
  name: "Northlight",
  slug: "northlight",
  description: "Premium monitors.",
  logoUrl: "/media-files/logo.webp",
  productCount: 4,
};

const NO_LOGO_BRAND: PublicBrandDto = {
  ...BRAND,
  id: "brand-2",
  name: "Plain",
  slug: "plain",
  logoUrl: null,
};

describe("CategoryCard", () => {
  it("renders the category name and product count inside the card", () => {
    render(<CategoryCard category={CATEGORY} />);
    expect(screen.getByText("Electronics")).toBeInTheDocument();
    expect(screen.getByText("12 products")).toBeInTheDocument();
  });

  it("makes the entire card a single semantic link to the category listing", () => {
    render(<CategoryCard category={CATEGORY} />);
    const link = screen.getByRole("link", { name: /electronics/i });
    expect(link).toHaveAttribute("href", "/categories/electronics");
    // The whole card content lives inside the one anchor → every pixel navigates.
    expect(link).toContainElement(screen.getByText("Electronics"));
    expect(link).toContainElement(screen.getByText("12 products"));
  });

  it("hides the product count when the category is empty", () => {
    render(<CategoryCard category={EMPTY_CATEGORY} />);
    expect(screen.getByRole("link", { name: /empty/i })).toHaveAttribute(
      "href",
      "/categories/empty",
    );
    expect(screen.queryByText(/product/i)).not.toBeInTheDocument();
  });
});

describe("BrandCard", () => {
  it("renders the brand name, logo and product count", () => {
    const { container } = render(<BrandCard brand={BRAND} />);
    expect(screen.getByText("Northlight")).toBeInTheDocument();
    expect(screen.getByText("4 products")).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("/media-files/logo.webp"),
    );
  });

  it("makes the entire brand card a semantic link to the brand listing", () => {
    render(<BrandCard brand={BRAND} />);
    const link = screen.getByRole("link", { name: /northlight/i });
    expect(link).toHaveAttribute("href", "/brands/northlight");
    expect(link).toContainElement(screen.getByText("Northlight"));
    expect(link).toContainElement(screen.getByText("4 products"));
  });

  it("falls back to the store icon when there is no logo", () => {
    const { container } = render(<BrandCard brand={NO_LOGO_BRAND} />);
    expect(screen.getByRole("link", { name: /plain/i })).toHaveAttribute(
      "href",
      "/brands/plain",
    );
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("DirectoryGrid", () => {
  it("renders each item via renderItem inside the responsive grid", () => {
    render(
      <DirectoryGrid
        isPending={false}
        isError={false}
        error={null}
        items={[CATEGORY]}
        onRetry={() => undefined}
        renderItem={(category) => <CategoryCard category={category} />}
      />,
    );
    expect(screen.getByTestId("catalog-grid")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /electronics/i })).toHaveAttribute(
      "href",
      "/categories/electronics",
    );
  });
});

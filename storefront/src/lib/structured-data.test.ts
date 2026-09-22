import { describe, expect, it } from "vitest";
import {
  brandJsonLd,
  breadcrumbJsonLd,
  collectionPageJsonLd,
  itemListJsonLd,
  organizationJsonLd,
  productJsonLd,
  toJsonLd,
  websiteJsonLd,
} from "@/lib/structured-data";
import { PUBLIC_ORIGIN } from "@/config/env";
import type { PublicProductDto } from "@/types";
import { BRAND_REF } from "@/test/fixtures/catalog";

/** Canonical origin mirrors seo.ts semantics: no trailing slash. */
const ORIGIN = (PUBLIC_ORIGIN ?? "http://localhost:8090").replace(/\/+$/, "");

/** JSON-LD builders + the XSS-critical `<` escaping (Phase 9/10 regression). */
const product = {
  id: "p1",
  name: "Aurora Monitor",
  slug: "aurora-monitor",
  sku: "SKU-001",
  price: 54900,
  stock: 10,
  status: "Active",
  rating: 4.5,
  reviewsCount: 8,
  images: [{ url: "/media-files/aurora.webp", alt: "Aurora" }],
  brand: BRAND_REF,
} as unknown as PublicProductDto;

describe("toJsonLd", () => {
  it("escapes `<` so user content cannot terminate the script element", () => {
    const malicious = { name: "</script><script>alert(1)</script>" };
    const serialized = toJsonLd(malicious);
    // Every `<` becomes the 6-char escape `\u003c`, so no raw `</script>`
    // sequence can appear in the embedded output.
    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script>");
    expect(serialized.startsWith("{")).toBe(true);
    // The escaped output must still parse back to the same logical value.
    expect(JSON.parse(serialized.replace(/\\u003c/g, "<"))).toEqual(malicious);
  });

  it("escapes every `<` occurrence in nested content", () => {
    const out = toJsonLd({ a: { b: ["<", "<img src=x onerror=alert(1)>"] } });
    expect(out).not.toMatch(/<(?!\\)/);
    expect(out).toContain("\\u003cimg");
  });
});

describe("builders", () => {
  it("Organization / WebSite use canonical root", () => {
    expect(organizationJsonLd()["@type"]).toBe("Organization");
    expect(websiteJsonLd()["@type"]).toBe("WebSite");
    expect(String(organizationJsonLd().url)).toBe(`${ORIGIN}/`);
  });

  it("ItemList positions entries from 1 and canonicalizes paths", () => {
    const ld = itemListJsonLd([{ name: "A", path: "/products/a" }]);
    const first = (ld.itemListElement as Array<{ position: number; url: string }>)[0]!;
    expect(first.position).toBe(1);
    expect(first.url).toBe(`${ORIGIN}/products/a`);
  });

  it("CollectionPage omits name when absent", () => {
    expect(collectionPageJsonLd("/categories/electronics")).not.toHaveProperty("name");
    expect(collectionPageJsonLd("/categories/electronics", "Electronics")).toHaveProperty(
      "name",
      "Electronics",
    );
  });

  it("BreadcrumbList orders crumbs", () => {
    const ld = breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Electronics", path: "/categories/electronics" },
    ]);
    const elements = ld.itemListElement as Array<{ position: number; name: string }>;
    expect(elements.map((e) => e.name)).toEqual(["Home", "Electronics"]);
  });

  it("Brand builds a brand page URL", () => {
    const ld = brandJsonLd(BRAND_REF);
    expect(ld.url).toBe(`${ORIGIN}/brands/northlight`);
  });

  it("Product emits Offer and gates AggregateRating on real data", () => {
    const ld = productJsonLd(product);
    expect(ld["@type"]).toBe("Product");
    const offers = ld.offers as Record<string, unknown>;
    expect(offers.priceCurrency).toBe("NPR");
    expect(offers.availability).toBe("https://schema.org/InStock");
    expect(ld.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: 4.5,
      reviewCount: 8,
    });
    const noReviews = productJsonLd({ ...product, rating: 0, reviewsCount: 0 });
    expect(noReviews).not.toHaveProperty("aggregateRating");
  });

  it("Product marks out-of-stock when stock is zero", () => {
    const offers = productJsonLd({ ...product, stock: 0 }).offers as Record<string, unknown>;
    expect(offers.availability).toBe("https://schema.org/OutOfStock");
  });

  it("Product JSON-LD with malicious name stays script-safe end-to-end", () => {
    const serialized = toJsonLd(productJsonLd({ ...product, name: "</script>x" }));
    expect(serialized).not.toContain("</script>");
  });
});

import { describe, expect, it } from "vitest";
import { canonicalUrl, pageHead, titleFromSlug } from "@/lib/seo";
import { mediaUrl } from "@/lib/media";
import { buildSearchParams, cn, formatNpr } from "@/lib/utils";
import { parseCatalogSearch } from "@/lib/catalogSearch";
import { API_BASE_URL, PUBLIC_ORIGIN } from "@/config/env";

/** Env-derived origins (mirrors seo.ts/media.ts semantics) instead of hard-coded URLs. */
const ORIGIN = (PUBLIC_ORIGIN ?? "http://localhost:8090").replace(/\/+$/, "");
const API_ORIGIN = new URL(API_BASE_URL).origin;

/** Pure helper coverage (architecture §24 Unit layer). */
describe("canonicalUrl", () => {
  it("normalizes paths against PUBLIC_ORIGIN", () => {
    expect(canonicalUrl("/products/a")).toBe(`${ORIGIN}/products/a`);
    expect(canonicalUrl("products/a")).toBe(`${ORIGIN}/products/a`);
    expect(canonicalUrl("/")).toBe(`${ORIGIN}/`);
    expect(canonicalUrl()).toBe(`${ORIGIN}/`);
    expect(canonicalUrl("//products//a/")).toBe(`${ORIGIN}/products/a`);
  });
});

describe("pageHead", () => {
  const head = pageHead({ title: "Products", description: "All products", path: "/products" });
  it("emits canonical + OG basics", () => {
    const names = head.links.map((l) => l.rel);
    expect(names).toContain("canonical");
    expect(head.meta).toContainEqual({ property: "og:type", content: "website" });
    expect(head.meta).toContainEqual({ title: "Products" });
  });

  it("omits optional entries when not provided", () => {
    expect(head.meta.some((m) => "robots" in m)).toBe(false);
    expect(head.links.some((l) => l.rel === "prev")).toBe(false);
  });

  it("emits robots and pagination links when provided", () => {
    const h = pageHead({
      title: "T",
      path: "/products",
      robots: "noindex",
      prev: "/products?page=1",
      next: "/products?page=3",
    });
    expect(h.meta).toContainEqual({ name: "robots", content: "noindex" });
    expect(h.links.find((l) => l.rel === "next")?.href).toContain("page=3");
  });

  it("resolves relative og images and keeps absolute ones", () => {
    const abs = pageHead({ title: "T", ogImage: "https://cdn.example/i.png" });
    expect(abs.meta).toContainEqual({ property: "og:image", content: "https://cdn.example/i.png" });
    const rel = pageHead({ title: "T", ogImage: "/media-files/x.webp" });
    expect(rel.meta).toContainEqual({
      property: "og:image",
      content: `${ORIGIN}/media-files/x.webp`,
    });
  });
});

describe("titleFromSlug", () => {
  it("humanizes slugs", () => {
    expect(titleFromSlug("blue-yoga-belt")).toBe("Blue Yoga Belt");
    expect(titleFromSlug("multi_under_scored")).toBe("Multi Under Scored");
  });
});

describe("mediaUrl", () => {
  it("returns undefined for empty input", () => {
    expect(mediaUrl(undefined)).toBeUndefined();
    expect(mediaUrl(null)).toBeUndefined();
    expect(mediaUrl("")).toBeUndefined();
  });

  it("passes absolute URLs through unchanged", () => {
    expect(mediaUrl("https://cdn.example/x.png")).toBe("https://cdn.example/x.png");
  });

  it("resolves backend-relative media paths to the API origin", () => {
    expect(mediaUrl("/media-files/a.webp")).toBe(`${API_ORIGIN}/media-files/a.webp`);
  });
});

describe("formatNpr", () => {
  it("formats NPR with two decimals", () => {
    expect(formatNpr(54900)).toMatch(/54,900\.00/);
    expect(formatNpr(54900).startsWith("रू")).toBe(true);
  });
  it("falls back to 0 for non-finite values", () => {
    expect(formatNpr(Number.NaN)).toMatch(/0\.00/);
  });
});

describe("buildSearchParams", () => {
  it("omits undefined/null and stringifies the rest", () => {
    expect(buildSearchParams({ a: 1, b: undefined, c: null, d: "x", e: true })).toBe(
      "?a=1&d=x&e=true",
    );
    expect(buildSearchParams()).toBe("");
  });
});

describe("cn", () => {
  it("merges and deduplicates tailwind classes", () => {
    const hidden = false;
    expect(cn("p-2", hidden && "hidden", "p-4")).toBe("p-4");
  });
});

describe("parseCatalogSearch", () => {
  it("parses supported params only", () => {
    expect(
      parseCatalogSearch({
        q: " belt ",
        category: "fitness",
        brand: "",
        sort: "-price",
        page: "2",
      }),
    ).toEqual({ q: "belt", category: "fitness", sort: "-price", page: 2 });
  });
  it("ignores unsupported filters (not backed by the API)", () => {
    const out = parseCatalogSearch({ minPrice: "100", color: "red" });
    expect(out).toEqual({});
  });
});

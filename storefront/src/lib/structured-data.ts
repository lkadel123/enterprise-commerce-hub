import { canonicalUrl, SITE_NAME } from "./seo";
import { BRAND } from "./brand";
import type { PublicProductDto, PublicRef } from "@/types";

/**
 * schema.org JSON-LD builders for the storefront (Phase 9, architecture §18).
 *
 * Rules enforced by every builder:
 * - Only REAL DTO data is emitted — no fabricated prices, ratings or items.
 * - Optional properties are omitted when unavailable
 *   (`exactOptionalPropertyTypes`-safe via conditional spread).
 * - URLs are canonicalized against PUBLIC_ORIGIN.
 * - `toJsonLd` serializes with JSON.stringify and escapes "<" so user/API
 *   content cannot break out of the <script> element.
 *
 * Rendered through the `<JsonLd />` component once the page's query data has
 * loaded (the verified client-fetch convention), so there is no hydration
 * mismatch and no duplicate script output.
 */

/** Currency for all offers. The backend is single-currency NPR (§13.2/§18). */
const CURRENCY = "NPR";

export type JsonLdObject = Record<string, unknown>;

/** Safely serialize a JSON-LD object for embedding in a <script> element. */
export function toJsonLd(data: JsonLdObject): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/* ----------------------------- Organization ------------------------------ */

export function organizationJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    alternateName: BRAND.company,
    url: canonicalUrl("/"),
    slogan: "Quality without compromise.",
    description: "NASB — quality without compromise. Made in Nepal.",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Betini",
      addressLocality: "Rasuwa",
      addressRegion: "Bagmati",
      addressCountry: "NP",
    },
    telephone: `+977-${BRAND.phone}`,
  };
}

/* -------------------------------- WebSite -------------------------------- */

export function websiteJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: BRAND.company,
    url: canonicalUrl("/"),
  };
}

/* -------------------------------- ItemList ------------------------------- */

export interface ItemListEntry {
  name: string;
  /** Origin-relative product URL (e.g. "/products/slug"). */
  path: string;
  image?: string | null;
}

export function itemListJsonLd(entries: ItemListEntry[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: entries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      url: canonicalUrl(entry.path),
      ...(entry.image ? { image: canonicalUrl(entry.image) } : {}),
    })),
  };
}

/* ----------------------------- CollectionPage ---------------------------- */

export function collectionPageJsonLd(path: string, name?: string): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    url: canonicalUrl(path),
    ...(name ? { name } : {}),
  };
}

/* ------------------------------ BreadcrumbList --------------------------- */

export interface BreadcrumbEntry {
  name: string;
  /** Origin-relative path. */
  path: string;
}

export function breadcrumbJsonLd(entries: BreadcrumbEntry[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: entries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: canonicalUrl(entry.path),
    })),
  };
}

/* --------------------------------- Brand --------------------------------- */

export function brandJsonLd(brand: PublicRef): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Brand",
    name: brand.name,
    url: canonicalUrl(`/brands/${brand.slug}`),
  };
}

/* -------------------------------- Product -------------------------------- */

function absoluteImage(url: string): string {
  // Backend media paths are origin-relative to the API server; the media
  // helper resolves them — here we only absolutize storefront-relative paths.
  return /^https?:\/\//i.test(url) ? url : canonicalUrl(url);
}

/**
 * Product + Offer + AggregateRating from a real `PublicProductDto`.
 * AggregateRating is emitted ONLY when genuine review data exists
 * (rating > 0 and reviewsCount > 0) — never fabricated.
 */
export function productJsonLd(product: PublicProductDto): JsonLdObject {
  const inStock = product.status === "Active" && product.stock > 0;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(product.description ? { description: product.description } : {}),
    sku: product.sku,
    ...(product.images.length > 0
      ? { image: product.images.map((img) => absoluteImage(img.url)) }
      : {}),
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand.name } } : {}),
    offers: {
      "@type": "Offer",
      url: canonicalUrl(`/products/${product.slug}`),
      priceCurrency: CURRENCY,
      price: product.price,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
    ...(product.rating > 0 && product.reviewsCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            reviewCount: product.reviewsCount,
          },
        }
      : {}),
  };
}

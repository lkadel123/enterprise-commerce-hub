import { PUBLIC_ORIGIN } from "../config/env";

/**
 * SEO helpers for the storefront.
 *
 * All functions are SSR-safe: they only rely on the build-time origin from
 * environment/config and never touch browser-only APIs (window, document,
 * location). Metadata is emitted through TanStack Router per-route `head()`
 * blocks as `{ meta, links }` (the codebase convention — see root head()).
 */

/** PUBLIC_ORIGIN with any trailing slash removed. */
// `?? fallback` guards against ESM circular-import evaluation order in the
// Nitro SSR bundle (this module can evaluate before config/env finishes).
const BASE_ORIGIN = (PUBLIC_ORIGIN ?? "http://localhost:8090").replace(/\/+$/, "");

/**
 * Build an absolute canonical URL for a storefront path.
 *
 * - Path is normalized to begin with "/".
 * - The root path resolves to the origin with a single trailing slash.
 * - Duplicate internal and trailing slashes are collapsed.
 */
export function canonicalUrl(path?: string): string {
  const raw = path && path.trim() !== "" ? path.trim() : "/";
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, "/");
  const normalized = collapsed.length > 1 ? collapsed.replace(/\/+$/, "") : collapsed;
  return `${BASE_ORIGIN}${normalized}`;
}

export interface PageHeadOptions {
  /** <title> and og:title value. */
  title: string;
  /** meta description and og:description value. */
  description?: string;
  /** Canonical path; defaults to the root "/". */
  path?: string;
  /**
   * Absolute or origin-relative OG/Twitter image URL.
   * Origin-relative values are resolved against PUBLIC_ORIGIN.
   * Only emitted when provided.
   */
  ogImage?: string;
  /**
   * Robots directive override (e.g. "noindex, nofollow").
   * Only emitted when provided.
   */
  robots?: string;
  /** Canonical URL of the previous page (pagination). Only emitted when provided. */
  prev?: string;
  /** Canonical URL of the next page (pagination). Only emitted when provided. */
  next?: string;
}

export interface PageLink {
  rel: string;
  href: string;
}

export interface PageHeadResult {
  meta: Array<Record<string, string>>;
  links: Array<PageLink>;
}

/**
 * Build route-level head metadata for a storefront page.
 *
 * Emits title, description, og:title, og:description, og:type (website),
 * og:url (the canonical URL), og:site_name and a canonical <link>.
 * Optional og:image, robots directive and pagination prev/next links are
 * emitted only when their values exist — never undefined/null/empty.
 *
 * The optional fields are only ever included when provided, so no entry
 * carries an `undefined` value (required by `exactOptionalPropertyTypes`).
 */
export function pageHead({
  title,
  description,
  path,
  ogImage,
  robots,
  prev,
  next,
}: PageHeadOptions): PageHeadResult {
  const url = canonicalUrl(path);
  const meta: Array<Record<string, string>> = [{ title }];

  if (description !== undefined && description !== "") {
    meta.push({ name: "description", content: description });
  }
  meta.push({ property: "og:title", content: title });
  if (description !== undefined && description !== "") {
    meta.push({ property: "og:description", content: description });
  }
  meta.push({ property: "og:type", content: "website" });
  meta.push({ property: "og:url", content: url });
  meta.push({ property: "og:site_name", content: SITE_NAME });

  // OG/Twitter image: absolute URLs pass through; relative resolve to origin.
  let imageUrl: string | undefined;
  if (ogImage !== undefined && ogImage !== "") {
    imageUrl = /^https?:\/\//i.test(ogImage) ? ogImage : canonicalUrl(ogImage);
    meta.push({ property: "og:image", content: imageUrl });
    meta.push({ name: "twitter:card", content: "summary_large_image" });
    meta.push({ name: "twitter:image", content: imageUrl });
  }

  if (robots !== undefined && robots !== "") {
    meta.push({ name: "robots", content: robots });
  }

  const links: Array<PageLink> = [{ rel: "canonical", href: url }];
  if (prev !== undefined && prev !== "") {
    links.push({ rel: "prev", href: /^https?:\/\//i.test(prev) ? prev : canonicalUrl(prev) });
  }
  if (next !== undefined && next !== "") {
    links.push({ rel: "next", href: /^https?:\/\//i.test(next) ? next : canonicalUrl(next) });
  }

  return { meta, links };
}

/** The site name used across metadata and structured data (project branding). */
export const SITE_NAME = "NASB";

/**
 * Humanize a URL slug into display text ("blue-yoga-belt" → "Blue Yoga Belt").
 * Used as an honest SSR-available title/canonical companion for detail routes
 * whose full DTO arrives client-side.
 */
export function titleFromSlug(slug: string): string {
  return slug
    .split(/[-_/]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

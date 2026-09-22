import { API_BASE_URL } from "@/config/env";

/**
 * Resolve a backend media URL (e.g. `/media-files/…`) to an absolute URL.
 *
 * Product/banner image URLs served by the backend are relative paths
 * (`/media-files/…`). When rendered on the storefront origin they must be
 * made absolute against the backend host. Already-absolute URLs pass through
 * unchanged.
 */
export function mediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) {
    const base = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
    return `${base}${url}`;
  }
  return url;
}

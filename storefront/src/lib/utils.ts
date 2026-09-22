import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class strings (used by UI primitives, mirroring the admin).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a numeric price in Nepali Rupees (NPR).
 *
 * The storefront never calculates prices; it only formats authoritative values
 * returned by the backend.
 */
export function formatNpr(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return `रू ${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Build a query string from a params object, omitting undefined/null values.
 */
export function buildSearchParams(
  params?: Record<string, string | number | boolean | null | undefined>,
): string {
  const searchParams = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    }
  }
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

/**
 * Shared typed fixtures for MSW-backed storefront tests (Phase 11).
 *
 * Shapes mirror the storefront's own DTO types (`@/types`) which mirror the
 * backend responses 1:1. Values are deterministic so assertions are stable.
 */
import type { PublicProductDto, PublicRef } from "@/types";

export const CATEGORY_REF: PublicRef = {
  id: "cat-1",
  name: "Electronics",
  slug: "electronics",
};

export const BRAND_REF: PublicRef = {
  id: "brand-1",
  name: "Northlight",
  slug: "northlight",
};

export const PRODUCT_A: PublicProductDto = {
  id: "prod-1",
  name: "Aurora 27 Monitor",
  slug: "aurora-27-monitor",
  sku: "SKU-001",
  price: 54900,
  stock: 10,
  status: "Active",
  rating: 4.5,
  reviewsCount: 8,
  images: [{ url: "/media-files/aurora.webp", alt: "Aurora monitor" }],
  category: CATEGORY_REF,
  brand: BRAND_REF,
} as unknown as PublicProductDto;

export const PRODUCT_B: PublicProductDto = {
  ...PRODUCT_A,
  id: "prod-2",
  name: "Vertex Keyboard",
  slug: "vertex-keyboard",
  sku: "SKU-002",
  price: 18900,
  stock: 0,
  rating: 0,
  reviewsCount: 0,
  images: [],
} as unknown as PublicProductDto;

export const CUSTOMER_PROFILE = {
  id: "cust-1",
  name: "Amelia Whitfield",
  email: "amelia@test.com",
};

/** Envelope helper matching the backend success contract. */
export function ok<T>(data: T, extra?: Record<string, unknown>) {
  return { success: true as const, data, ...(extra ?? {}) };
}

/** Backend-style error envelope. */
export function fail(code: string, message: string) {
  return { success: false as const, error: { code, message } };
}

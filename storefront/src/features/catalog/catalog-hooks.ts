import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { publicApi } from "@/lib/api/public";
import type { ProductListParams } from "@/types";

/**
 * TanStack Query hooks for the public catalog.
 *
 * All data is fetched client-side (the verified SSR + hydrate convention).
 * `placeholderData: keepPreviousData` keeps the previous page/filters visible
 * while a new query loads, avoiding layout jumps during pagination/sorting.
 */

/**
 * Shared cache window for PUBLIC catalog data only. Private/mutable data
 * (cart, wishlist, account, notifications, orders) intentionally keeps the
 * default staleTime of 0 so freshness and invalidation behavior are intact.
 */
export const CATALOG_STALE_TIME = 60_000;

export function useProductsQuery(params: ProductListParams) {
  return useQuery({
    queryKey: [
      "public",
      "products",
      params.q ?? "",
      params.category ?? "",
      params.brand ?? "",
      params.featured ?? "",
      params.page ?? 1,
      params.pageSize ?? 24,
      params.sort ?? "",
    ],
    queryFn: () => publicApi.listProducts(params),
  });
}

export function useFeaturedProducts(pageSize = 8) {
  return useQuery({
    queryKey: ["public", "products", "featured", pageSize],
    queryFn: () => publicApi.listProducts({ featured: true, pageSize }),
    placeholderData: keepPreviousData,
    staleTime: CATALOG_STALE_TIME,
  });
}

export function useProduct(slug: string | undefined) {
  return useQuery({
    queryKey: ["public", "product", slug ?? ""],
    queryFn: () => publicApi.getProduct(slug as string),
    enabled: Boolean(slug && slug.trim().length > 0),
    retry: false,
  });
}

export function useProductReviews(productId: string | undefined, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ["public", "reviews", productId ?? "", page, pageSize],
    queryFn: () => publicApi.listReviews(productId as string, page, pageSize),
    enabled: Boolean(productId && productId.trim().length > 0),
    placeholderData: keepPreviousData,
  });
}

export function useCategories(params: import("@/lib/api/public").CatalogListParams = {}) {
  return useQuery({
    queryKey: [
      "public",
      "categories",
      params.q ?? "",
      params.page ?? 1,
      params.pageSize ?? 24,
      params.sort ?? "",
    ],
    queryFn: () => publicApi.listCategories(params),
    placeholderData: keepPreviousData,
    staleTime: CATALOG_STALE_TIME,
  });
}

export function useCategory(slug: string | undefined) {
  return useQuery({
    queryKey: ["public", "category", slug ?? ""],
    queryFn: () => publicApi.getCategory(slug as string),
    enabled: Boolean(slug && slug.trim().length > 0),
    retry: false,
  });
}

export function useBrands(params: import("@/lib/api/public").CatalogListParams = {}) {
  return useQuery({
    queryKey: [
      "public",
      "brands",
      params.q ?? "",
      params.page ?? 1,
      params.pageSize ?? 24,
      params.sort ?? "",
    ],
    queryFn: () => publicApi.listBrands(params),
    placeholderData: keepPreviousData,
    staleTime: CATALOG_STALE_TIME,
  });
}

export function useBrand(slug: string | undefined) {
  return useQuery({
    queryKey: ["public", "brand", slug ?? ""],
    queryFn: () => publicApi.getBrand(slug as string),
    enabled: Boolean(slug && slug.trim().length > 0),
    retry: false,
  });
}

export function useBanners() {
  return useQuery({
    queryKey: ["public", "banners"],
    queryFn: () => publicApi.listBanners(),
  });
}

export function useSearchSuggestions(q: string) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: ["public", "search-suggestions", trimmed],
    queryFn: () => publicApi.searchSuggestions(trimmed),
    enabled: trimmed.length > 0,
    staleTime: 60_000,
  });
}

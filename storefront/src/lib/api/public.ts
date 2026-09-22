import { apiFetch } from "./client";
import { buildSearchParams } from "@/lib/utils";
import type {
  PaginationMeta,
  ProductListParams,
  PublicBannerDto,
  PublicBrandDto,
  PublicCategoryDto,
  PublicProductDto,
  PublicReviewDto,
  PublicSearchSuggestionDto,
} from "@/types";

/**
 * Public catalog API client (mirrors `backend/src/modules/public-catalog`).
 *
 * All calls are unauthenticated. Responses follow the backend envelope:
 * paginated endpoints return `{ success, data: T[], meta }`, single-resource
 * endpoints `{ success, data: T }`.
 */

export interface PaginatedApiResult<T> {
  success: true;
  data: T[];
  meta: PaginationMeta;
}

export interface SingleApiResult<T> {
  success: true;
  data: T;
}

/** Params for directory endpoints (categories/brands). */
export interface CatalogListParams {
  [key: string]: string | number | boolean | null | undefined;
  q?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  sort?: string | undefined;
}

export const publicApi = {
  listProducts(params: ProductListParams = {}): Promise<PaginatedApiResult<PublicProductDto>> {
    return apiFetch(`/public/products${buildSearchParams(params)}`);
  },

  getProduct(slug: string): Promise<SingleApiResult<PublicProductDto>> {
    return apiFetch(`/public/products/${encodeURIComponent(slug)}`);
  },

  listReviews(
    productId: string,
    page = 1,
    pageSize = 20,
  ): Promise<PaginatedApiResult<PublicReviewDto>> {
    return apiFetch(`/public/reviews${buildSearchParams({ productId, page, pageSize })}`);
  },

  listCategories(params: CatalogListParams = {}): Promise<PaginatedApiResult<PublicCategoryDto>> {
    return apiFetch(`/public/categories${buildSearchParams(params)}`);
  },

  getCategory(slug: string): Promise<SingleApiResult<PublicCategoryDto>> {
    return apiFetch(`/public/categories/${encodeURIComponent(slug)}`);
  },

  listBrands(params: CatalogListParams = {}): Promise<PaginatedApiResult<PublicBrandDto>> {
    return apiFetch(`/public/brands${buildSearchParams(params)}`);
  },

  getBrand(slug: string): Promise<SingleApiResult<PublicBrandDto>> {
    return apiFetch(`/public/brands/${encodeURIComponent(slug)}`);
  },

  listBanners(): Promise<SingleApiResult<PublicBannerDto[]>> {
    return apiFetch("/public/banners");
  },

  searchSuggestions(q: string): Promise<SingleApiResult<PublicSearchSuggestionDto>> {
    return apiFetch(`/public/search/suggestions?q=${encodeURIComponent(q)}`);
  },
};

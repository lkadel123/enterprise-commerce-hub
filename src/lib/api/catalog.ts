import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminFetch, buildQuery } from "./client";
import type {
  AdjustStockInput,
  BrandDto,
  BrandListParams,
  CategoryDto,
  CategoryListParams,
  CreateBrandInput,
  CreateCategoryInput,
  CreateProductInput,
  InventoryDto,
  InventoryListParams,
  InventorySummaryDto,
  ProductDto,
  ProductListParams,
  ReviewDto,
  ReviewListParams,
  ReviewStatsDto,
  ReviewStatus,
  UpdateBrandInput,
  UpdateCategoryInput,
  UpdateProductInput,
} from "./types";

/** Products â€” mirrors `backend/src/modules/products` (catalog RBAC). */
export const productsApi = {
  list(params: ProductListParams = {}): Promise<{
    data: ProductDto[];
    meta?: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    return adminFetch<ProductDto[]>(`/products${buildQuery({ ...params })}`);
  },
  getById(id: string): Promise<{ data: ProductDto }> {
    return adminFetch<ProductDto>(`/products/${encodeURIComponent(id)}`);
  },
  create(body: CreateProductInput): Promise<{ data: ProductDto }> {
    return adminFetch<ProductDto>("/products", { method: "POST", body });
  },
  update(id: string, body: UpdateProductInput): Promise<{ data: ProductDto }> {
    return adminFetch<ProductDto>(`/products/${encodeURIComponent(id)}`, {
      method: "PUT",
      body,
    });
  },
  setStatus(id: string, status: ProductDto["status"]): Promise<{ data: ProductDto }> {
    return adminFetch<ProductDto>(`/products/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: { status },
    });
  },
  remove(id: string): Promise<unknown> {
    return adminFetch(`/products/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  useList: (params: ProductListParams = {}, options?: { enabled?: boolean; refetchInterval?: number | false; staleTime?: number; retry?: boolean | number }) =>
    useQuery({
      queryKey: ["admin", "products", params],
      // Full envelope (rows + pagination meta) so consumers can render
      // authoritative page counts.
      queryFn: () => productsApi.list(params),
      ...options,
    }),
  useDetail: (id: string, options?: { enabled?: boolean; refetchInterval?: number | false; staleTime?: number; retry?: boolean | number }) =>
    useQuery({
      queryKey: ["admin", "products", id],
      queryFn: () => productsApi.getById(id).then((r) => r.data),
      ...options,
    }),
  useCreate: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (body: CreateProductInput) => productsApi.create(body).then((r) => r.data),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "reports", "overview"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "reports", "categories"] });
      },
    });
  },
  useUpdate: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, body }: { id: string; body: UpdateProductInput }) =>
        productsApi.update(id, body).then((r) => r.data),
      onSuccess: (data) => {
        void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "products", data.id] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "reports", "overview"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "reports", "categories"] });
      },
    });
  },
  useSetStatus: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, status }: { id: string; status: ProductDto["status"] }) =>
        productsApi.setStatus(id, status).then((r) => r.data),
      onSuccess: (data) => {
        void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "products", data.id] });
      },
    });
  },
  useRemove: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => productsApi.remove(id),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "reports", "overview"] });
      },
    });
  },
};

/** Categories â€” mirrors `backend/src/modules/categories` (catalog RBAC). */
export const categoriesApi = {
  list(params: CategoryListParams = {}): Promise<{ data: CategoryDto[] }> {
    return adminFetch<CategoryDto[]>(`/categories${buildQuery({ ...params })}`);
  },
  getById(id: string): Promise<{ data: CategoryDto }> {
    return adminFetch<CategoryDto>(`/categories/${encodeURIComponent(id)}`);
  },
  create(body: CreateCategoryInput): Promise<{ data: CategoryDto }> {
    return adminFetch<CategoryDto>("/categories", { method: "POST", body });
  },
  update(id: string, body: UpdateCategoryInput): Promise<{ data: CategoryDto }> {
    return adminFetch<CategoryDto>(`/categories/${encodeURIComponent(id)}`, {
      method: "PUT",
      body,
    });
  },
  remove(id: string): Promise<unknown> {
    return adminFetch(`/categories/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  useList: (params: CategoryListParams = {}, options?: { enabled?: boolean; refetchInterval?: number | false; staleTime?: number; retry?: boolean | number }) =>
    useQuery({
      queryKey: ["admin", "categories", params],
      queryFn: () => categoriesApi.list(params).then((r) => r.data),
      ...options,
    }),
  useDetail: (id: string, options?: { enabled?: boolean; refetchInterval?: number | false; staleTime?: number; retry?: boolean | number }) =>
    useQuery({
      queryKey: ["admin", "categories", id],
      queryFn: () => categoriesApi.getById(id).then((r) => r.data),
      ...options,
    }),
  useCreate: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (body: CreateCategoryInput) => categoriesApi.create(body).then((r) => r.data),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "categories"] }),
    });
  },
  useUpdate: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, body }: { id: string; body: UpdateCategoryInput }) =>
        categoriesApi.update(id, body).then((r) => r.data),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "categories"] }),
    });
  },
  useRemove: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => categoriesApi.remove(id),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "categories"] }),
    });
  },
};

/** Brands â€” mirrors `backend/src/modules/brands` (catalog RBAC). */
export const brandsApi = {
  list(params: BrandListParams = {}): Promise<{ data: BrandDto[] }> {
    return adminFetch<BrandDto[]>(`/brands${buildQuery({ ...params })}`);
  },
  getById(id: string): Promise<{ data: BrandDto }> {
    return adminFetch<BrandDto>(`/brands/${encodeURIComponent(id)}`);
  },
  create(body: CreateBrandInput): Promise<{ data: BrandDto }> {
    return adminFetch<BrandDto>("/brands", { method: "POST", body });
  },
  update(id: string, body: UpdateBrandInput): Promise<{ data: BrandDto }> {
    return adminFetch<BrandDto>(`/brands/${encodeURIComponent(id)}`, {
      method: "PUT",
      body,
    });
  },
  remove(id: string): Promise<unknown> {
    return adminFetch(`/brands/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  useList: (params: BrandListParams = {}, options?: { enabled?: boolean; refetchInterval?: number | false; staleTime?: number; retry?: boolean | number }) =>
    useQuery({
      queryKey: ["admin", "brands", params],
      queryFn: () => brandsApi.list(params).then((r) => r.data),
      ...options,
    }),
  useDetail: (id: string, options?: { enabled?: boolean; refetchInterval?: number | false; staleTime?: number; retry?: boolean | number }) =>
    useQuery({
      queryKey: ["admin", "brands", id],
      queryFn: () => brandsApi.getById(id).then((r) => r.data),
      ...options,
    }),
  useCreate: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (body: CreateBrandInput) => brandsApi.create(body).then((r) => r.data),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "brands"] }),
    });
  },
  useUpdate: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, body }: { id: string; body: UpdateBrandInput }) =>
        brandsApi.update(id, body).then((r) => r.data),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "brands"] }),
    });
  },
  useRemove: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => brandsApi.remove(id),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "brands"] }),
    });
  },
};

/** Inventory â€” mirrors `backend/src/modules/inventory` (inventory RBAC). */
export const inventoryApi = {
  list(params: InventoryListParams = {}): Promise<{ data: InventoryDto[] }> {
    return adminFetch<InventoryDto[]>(`/inventory${buildQuery({ ...params })}`);
  },
  summary(): Promise<{ data: InventorySummaryDto }> {
    return adminFetch<InventorySummaryDto>("/inventory/summary");
  },
  adjust(body: AdjustStockInput): Promise<{ data: InventoryDto }> {
    return adminFetch<InventoryDto>("/inventory/adjust", { method: "POST", body });
  },

    // TanStack Query hooks
  useList: (params: InventoryListParams = {}, options?: { enabled?: boolean; refetchInterval?: number | false; staleTime?: number; retry?: boolean | number }) =>
    useQuery({
      queryKey: ["admin", "inventory", "list", params],
      queryFn: () => inventoryApi.list(params).then((r) => r.data),
      ...options,
    }),
  useSummary: (options?: { enabled?: boolean; refetchInterval?: number | false; staleTime?: number; retry?: boolean | number }) =>
    useQuery({
      queryKey: ["admin", "inventory", "summary"],
      queryFn: () => inventoryApi.summary().then((r) => r.data),
      ...options,
    }),
  useAdjust: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (body: AdjustStockInput) => inventoryApi.adjust(body).then((r) => r.data),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["admin", "inventory"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "reports", "overview"] });
      },
    });
  },
};

/** Reviews â€” mirrors `backend/src/modules/reviews` (catalog RBAC). */
export const reviewsApi = {
  list(params: ReviewListParams = {}): Promise<{ data: ReviewDto[] }> {
    return adminFetch<ReviewDto[]>(`/reviews${buildQuery({ ...params })}`);
  },
  stats(): Promise<{ data: ReviewStatsDto }> {
    return adminFetch<ReviewStatsDto>("/reviews/stats");
  },
  setStatus(id: string, status: ReviewStatus): Promise<{ data: ReviewDto }> {
    return adminFetch<ReviewDto>(`/reviews/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: { status },
    });
  },
  remove(id: string): Promise<unknown> {
    return adminFetch(`/reviews/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  useList: (params: ReviewListParams = {}, options?: { enabled?: boolean; refetchInterval?: number | false; staleTime?: number; retry?: boolean | number }) =>
    useQuery({
      queryKey: ["admin", "reviews", params],
      queryFn: () => reviewsApi.list(params).then((r) => r.data),
      ...options,
    }),
  useStats: (options?: { enabled?: boolean; refetchInterval?: number | false; staleTime?: number; retry?: boolean | number }) =>
    useQuery({
      queryKey: ["admin", "reviews", "stats"],
      queryFn: () => reviewsApi.stats().then((r) => r.data),
      ...options,
    }),
  useSetStatus: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, status }: { id: string; status: ReviewStatus }) =>
        reviewsApi.setStatus(id, status).then((r) => r.data),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "reports", "overview"] });
      },
    });
  },
  useRemove: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => reviewsApi.remove(id),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "reports", "overview"] });
      },
    });
  },
};

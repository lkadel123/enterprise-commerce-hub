import { useQuery } from "@tanstack/react-query";
import { adminFetch, buildQuery } from "./client";
import type {
  CategorySalesDto,
  OverviewDto,
  PaymentMethodDto,
  RegionSalesDto,
  ReportQueryParams,
  RevenuePointDto,
  TopProductDto,
} from "./types";

/**
 * Dashboard / reports client. Mirrors `backend/src/modules/reports`:
 * GET /reports/overview | /revenue | /categories | /payment-methods |
 * /top-products | /regions (all `reports:view` RBAC-protected).
 *
 * Revenue semantics are enforced by the backend (Phase 20): revenue figures
 * aggregate only orders whose `payment.status === "Paid"`.
 */
export const reportsApi = {
  // TanStack Query hooks (used by dashboard & reports pages).
  useOverview: () =>
    useQuery({
      queryKey: ["admin", "reports", "overview"],
      queryFn: () => adminFetch<OverviewDto>("/reports/overview").then((r) => r.data as OverviewDto),
    }),

  useRevenue: (params: ReportQueryParams = {}) =>
    useQuery({
      queryKey: ["admin", "reports", "revenue", params],
      queryFn: () =>
        adminFetch<RevenuePointDto[]>(
          `/reports/revenue${buildQuery({ ...params })}`,
        ).then((r) => r.data as RevenuePointDto[]),
    }),

  useCategories: (params: Omit<ReportQueryParams, "granularity" | "limit"> = {}) =>
    useQuery({
      queryKey: ["admin", "reports", "categories", params],
      queryFn: () =>
        adminFetch<CategorySalesDto[]>(
          `/reports/categories${buildQuery({ ...params })}`,
        ).then((r) => r.data as CategorySalesDto[]),
    }),

  usePaymentMethods: (params: Omit<ReportQueryParams, "granularity" | "limit"> = {}) =>
    useQuery({
      queryKey: ["admin", "reports", "payment-methods", params],
      queryFn: () =>
        adminFetch<PaymentMethodDto[]>(
          `/reports/payment-methods${buildQuery({ ...params })}`,
        ).then((r) => r.data as PaymentMethodDto[]),
    }),

  useRegions: (params: Omit<ReportQueryParams, "granularity" | "limit"> = {}) =>
    useQuery({
      queryKey: ["admin", "reports", "regions", params],
      queryFn: () =>
        adminFetch<RegionSalesDto[]>(
          `/reports/regions${buildQuery({ ...params })}`,
        ).then((r) => r.data as RegionSalesDto[]),
    }),

  useTopProducts: (limit = 5) =>
    useQuery({
      queryKey: ["admin", "reports", "top-products", limit],
      queryFn: () =>
        adminFetch<TopProductDto[]>(
          `/reports/top-products${buildQuery({ limit })}`,
        ).then((r) => r.data as TopProductDto[]),
    }),
};

import { reportRepository } from "./report.repository.js";
import type {
  CategorySalesDto,
  OverviewDto,
  PaymentMethodDto,
  RegionSalesDto,
  ReportQueryParams,
  RevenuePointDto,
  TopProductDto,
} from "./report.types.js";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export const reportService = {
  async revenue(params: Omit<ReportQueryParams, "limit">): Promise<RevenuePointDto[]> {
    const { revenue, profit } = await reportRepository.revenueSeries(params);
    const profitMap = new Map(profit.map((row) => [row._id, row.profit]));

    return revenue.map((row) => ({
      key: row._id,
      label: row._id,
      revenue: round2(row.revenue),
      orders: row.orders,
      profit: round2(profitMap.get(row._id) ?? 0),
    }));
  },

  async categories(
    params: Omit<ReportQueryParams, "granularity" | "limit">,
  ): Promise<CategorySalesDto[]> {
    const rows = await reportRepository.categorySales(params);
    return rows.map((row) => ({
      category: row._id ?? "Uncategorized",
      value: round2(row.value),
    }));
  },

  async paymentMethods(
    params: Omit<ReportQueryParams, "granularity" | "limit">,
  ): Promise<PaymentMethodDto[]> {
    const rows = await reportRepository.paymentMethods(params);
    const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;
    return rows.map((row) => ({
      method: row._id,
      value: round2(row.value),
      share: round2((row.value / total) * 100),
    }));
  },

  async regions(
    params: Omit<ReportQueryParams, "granularity" | "limit">,
  ): Promise<RegionSalesDto[]> {
    const rows = await reportRepository.regions(params);
    return rows.map((row) => ({
      region: row._id ?? "Unknown",
      value: round2(row.value),
    }));
  },

  async topProducts(limit: number): Promise<TopProductDto[]> {
    return reportRepository.topProducts(limit);
  },

  async overview(): Promise<OverviewDto> {
    return reportRepository.overview();
  },
};

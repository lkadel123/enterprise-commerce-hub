export type ReportGranularity = "daily" | "weekly" | "monthly" | "yearly";

export interface ReportQueryParams {
  from?: string;
  to?: string;
  granularity?: ReportGranularity;
  limit?: number;
}

export interface RevenuePointDto {
  key: string;
  label: string;
  revenue: number;
  orders: number;
  profit: number;
}

export interface CategorySalesDto {
  category: string;
  value: number;
}

export interface RegionSalesDto {
  region: string;
  value: number;
}

export interface PaymentMethodDto {
  method: string;
  value: number;
  share: number;
}

export interface TopProductDto {
  sku: string;
  name: string;
  unitsSold: number;
  revenue: number;
}

export interface OverviewDto {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  avgOrderValue: number;
  lowStockItems: number;
  pendingReviews: number;
  ordersByStatus: Record<string, number>;
}

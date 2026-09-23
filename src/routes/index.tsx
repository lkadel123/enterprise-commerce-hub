import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo, useState } from "react";
import { Area } from "recharts";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section, StatCard, StatusBadge, EmptyState } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminApiError } from "@/lib/api/client";
import { inventoryApi } from "@/lib/api/catalog";
import { ordersApi } from "@/lib/api/commerce";
import { reportsApi } from "@/lib/api/reports";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";
import { PermissionDenied } from "@/lib/auth/RequireAdminAuth";
import { formatNpr, formatNprCompact } from "@/lib/utils";
import type { PermissionModule } from "@/lib/api/types";
import type { ReactNode } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard - Northpeak Commerce Console" },
      { name: "description", content: "Revenue, orders, customers and inventory health." },
    ],
  }),
  component: Dashboard,
});

const chartColors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
];

type TooltipPayload = {
  payload: {
    label?: string;
    key?: string;
  };
  value?: number | string;
};

const tooltipStyle = {
  backgroundColor: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "var(--color-popover-foreground)",
  boxShadow: "var(--shadow-overlay)",
};

type RangeKey = "7d" | "30d" | "90d";
const RANGE_DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90 };
const RANGE_LABEL: Record<RangeKey, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

function rangeWindow(range: RangeKey): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - RANGE_DAYS[range] * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function ChartSkeleton({ height = 208 }: { height?: number }) {
  return (
    <div
      className="animate-pulse rounded-md bg-surface-muted"
      style={{ height }}
      aria-busy="true"
    />
  );
}

function SectionError({ error }: { error: unknown }) {
  const status = error instanceof AdminApiError ? error.status : undefined;
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
      <p className="text-sm font-medium text-destructive">
        {status === 403 ? "Access denied" : "Couldn't load this data"}
      </p>
      <p className="text-xs text-muted-foreground">
        {status === 403
          ? "Your role does not include permission to view reports."
          : "Check your connection and try again."}
      </p>
    </div>
  );
}

function PermissionWrapper({
  mod,
  children,
  fallback,
}: {
  mod: PermissionModule;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { permissions } = useAdminAuth();
  const allowed = permissions.some((p) => p.module === mod);
  if (!allowed) return <>{fallback ?? <PermissionDenied feature={`view of ${mod} reports`} />}</>;
  return <>{children}</>;
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 w-full animate-pulse rounded bg-surface-muted" />
      ))}
    </div>
  );
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (active && payload?.[0]) {
    return (
      <div style={tooltipStyle}>
        <p className="font-medium">{payload[0].payload.label ?? payload[0].payload.key}</p>
        <p className="text-muted-foreground">{formatNpr(payload[0].value as number)}</p>
      </div>
    );
  }
  return null;
}

function LegendWrapper({ data }: { data: [string, number][] }) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {data.map(([label, val], i) => (
        <span key={label} className="flex items-center gap-1.5 text-xs">
          <span
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor: i % 2 === 0 ? "var(--color-chart-1)" : "var(--color-chart-2)",
            }}
          />
          {label}: {val}%
        </span>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [range, setRange] = useState<RangeKey>("30d");
  const { from, to } = useMemo(() => rangeWindow(range), [range]);
  const reportParams = useMemo(() => ({ from, to }), [from, to]);

  // All metrics come from the backend (/reports/*, /orders, /inventory).
  const overview = reportsApi.useOverview();
  const revenue = reportsApi.useRevenue({ ...reportParams, granularity: "daily" });
  const categorySales = reportsApi.useCategories(reportParams);
  const paymentMethods = reportsApi.usePaymentMethods(reportParams);
  const topProducts = reportsApi.useTopProducts(5);
  const recentOrders = ordersApi.useList({ page: 1, pageSize: 5 });
  const inventory = inventoryApi.useList({ pageSize: 100 });

  const orders = recentOrders.data?.data ?? [];
  const revenuePoints = revenue.data ?? [];
  const rangeRevenue = revenuePoints.reduce(
    (sum, p) => sum + (Number.isFinite(p.revenue) ? p.revenue : 0),
    0,
  );
  const lowStockRows = (inventory.data ?? [])
    .filter((i) => i.status === "Out of Stock" || i.status === "Low Stock")
    .slice(0, 5);
  const maxCategoryValue = Math.max(1, ...(categorySales.data ?? []).map((c) => c.value));

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        description="Revenue, orders, customers and inventory health across the store."
        actions={
          <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <TabsList aria-label="Report date range">
              <TabsTrigger value="7d">7 days</TabsTrigger>
              <TabsTrigger value="30d">30 days</TabsTrigger>
              <TabsTrigger value="90d">90 days</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue (paid)"
          value={formatNpr(overview.data?.totalRevenue ?? 0)}
          note={overview.isLoading ? "Loading..." : "All time - Paid orders only"}
          spark={revenuePoints.slice(-14).map((p) => p.revenue)}
        />
        <StatCard
          label="Orders"
          value={(overview.data?.totalOrders ?? 0).toLocaleString()}
          note={`${overview.data?.ordersByStatus?.["Pending"] ?? 0} pending`}
        />
        <StatCard
          label="Customers"
          value={(overview.data?.totalCustomers ?? 0).toLocaleString()}
          note="Registered customers"
        />
        <StatCard
          label="Avg. order value"
          value={formatNpr(overview.data?.avgOrderValue ?? 0)}
          note="Paid orders"
        />
      </div>

      <PermissionWrapper
        mod="reports"
        fallback={
          <Section title="Reports">
            <EmptyState
              title="No access"
              description="Your role does not include permission to view reports."
            />
          </Section>
        }
      >
        <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Section
            title={`Revenue - ${RANGE_LABEL[range]}`}
            description={
              overview.isLoading ? "" : `${formatNpr(rangeRevenue)} in paid revenue for this window`
            }
            className="xl:col-span-2"
          >
            {revenue.isLoading ? (
              <ChartSkeleton height={224} />
            ) : revenue.isError ? (
              <SectionError error={revenue.error} />
            ) : revenuePoints.length === 0 ? (
              <EmptyState
                title="No revenue yet"
                description="Paid orders in this window will appear here."
              />
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                <AreaChart data={revenuePoints} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatNprCompact}
                    width={64}
                  />
                  <RTooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--color-chart-1)"
                    strokeWidth={1.8}
                    fill="url(#rev-grad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Section>

          <Section title="Payment methods" description={RANGE_LABEL[range]}>
            {paymentMethods.isLoading ? (
              <ChartSkeleton />
            ) : paymentMethods.isError ? (
              <SectionError error={paymentMethods.error} />
            ) : (paymentMethods.data ?? []).length === 0 ? (
              <EmptyState
                title="No payments yet"
                description="Payment share appears once orders are paid."
              />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentMethods.data ?? []}
                        dataKey="value"
                        nameKey="method"
                        innerRadius={38}
                        outerRadius={64}
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {(paymentMethods.data ?? []).map((entry, i) => (
                          <Cell key={entry.method} fill={chartColors[i % chartColors.length]} />
                        ))}
                      </Pie>
                      <RTooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <LegendWrapper
                  data={(paymentMethods.data ?? []).map(
                    (m) => [m.method, Math.round(m.share)] as [string, number],
                  )}
                />
              </div>
            )}
          </Section>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Section title="Sales by category" description={RANGE_LABEL[range]}>
            {categorySales.isLoading ? (
              <ChartSkeleton />
            ) : categorySales.isError ? (
              <SectionError error={categorySales.error} />
            ) : (categorySales.data ?? []).length === 0 ? (
              <EmptyState
                title="No category sales yet"
                description="Paid orders will populate this breakdown."
              />
            ) : (
              <ul className="space-y-3">
                {(categorySales.data ?? []).map((c) => (
                  <li
                    key={c.category}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.category}</p>
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-surface-muted">
                        <div
                          className="h-1.5 rounded-full bg-[var(--color-chart-1)]"
                          style={{
                            width: `${Math.max(4, Math.round((c.value / maxCategoryValue) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                    <span className="num text-sm text-muted-foreground">
                      {formatNprCompact(c.value)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Top products" description="Units sold across all paid orders">
            {topProducts.isLoading ? (
              <TableSkeleton />
            ) : topProducts.isError ? (
              <SectionError error={topProducts.error} />
            ) : (topProducts.data ?? []).length === 0 ? (
              <EmptyState
                title="No sales yet"
                description="Best sellers appear once orders are paid."
              />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-label text-muted-foreground">
                    <th className="pb-2 font-medium">Product</th>
                    <th className="pb-2 text-right font-medium">Units</th>
                    <th className="pb-2 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {(topProducts.data ?? []).map((p) => (
                    <tr key={p.sku} className="border-b last:border-0">
                      <td className="py-2.5 pr-2">
                        <p className="truncate font-medium">{p.name}</p>
                        <p className="num text-xs text-muted-foreground">{p.sku}</p>
                      </td>
                      <td className="num py-2.5 text-right">{p.unitsSold}</td>
                      <td className="num py-2.5 text-right">{formatNprCompact(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section
            title="Inventory alerts"
            description="Low and out-of-stock items"
            actions={
              <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                <Link to="/inventory">View inventory</Link>
              </Button>
            }
          >
            <PermissionWrapper
              mod="inventory"
              fallback={
                <EmptyState
                  title="No access"
                  description="Your role does not include inventory permission."
                />
              }
            >
              {inventory.isLoading ? (
                <TableSkeleton rows={4} />
              ) : inventory.isError ? (
                <SectionError error={inventory.error} />
              ) : lowStockRows.length === 0 ? (
                <EmptyState
                  title="All stocked"
                  description="No items are below their reorder level."
                />
              ) : (
                <ul className="divide-y">
                  {lowStockRows.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{row.productName ?? row.sku}</p>
                        <p className="num text-xs text-muted-foreground">
                          {row.stock} in stock, reorder at {row.reorderLevel}
                        </p>
                      </div>
                      <StatusBadge status={row.status} />
                    </li>
                  ))}
                </ul>
              )}
            </PermissionWrapper>
          </Section>
        </div>
      </PermissionWrapper>

      <div className="mt-3">
        <Section
          title="Recent orders"
          description="Latest orders across all channels"
          actions={
            <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
              <Link to="/orders">View all orders</Link>
            </Button>
          }
          bodyClassName="p-0"
        >
          <PermissionWrapper
            mod="orders"
            fallback={
              <div className="p-6">
                <EmptyState
                  title="No access"
                  description="Your role does not include order permission."
                />
              </div>
            }
          >
            {recentOrders.isLoading ? (
              <div className="p-4">
                <TableSkeleton rows={5} />
              </div>
            ) : recentOrders.isError ? (
              <SectionError error={recentOrders.error} />
            ) : orders.length === 0 ? (
              <EmptyState
                title="No orders yet"
                description="Storefront orders will appear here in real time."
              />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-label text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium sm:px-5">Order</th>
                    <th className="px-4 py-2.5 font-medium sm:px-5">Customer</th>
                    <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell sm:px-5">
                      Items
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium sm:px-5">Total</th>
                    <th className="px-4 py-2.5 font-medium sm:px-5">Status</th>
                    <th className="hidden px-4 py-2.5 font-medium sm:table-cell sm:px-5">
                      Payment
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5 sm:px-5">
                        <Link
                          to="/orders/$orderId"
                          params={{ orderId: o.id }}
                          className="num font-medium hover:underline"
                        >
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-2.5 sm:px-5">
                        {o.customer?.name ?? o.email}
                      </td>
                      <td className="num hidden px-4 py-2.5 text-right sm:table-cell sm:px-5">
                        {o.items.reduce((n, it) => n + it.qty, 0)}
                      </td>
                      <td className="num px-4 py-2.5 text-right sm:px-5">
                        {formatNpr(o.amounts.total)}
                      </td>
                      <td className="px-4 py-2.5 sm:px-5">
                        <StatusBadge status={o.status} />
                      </td>
                      <td className="hidden px-4 py-2.5 sm:table-cell sm:px-5">
                        <StatusBadge status={o.payment.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PermissionWrapper>
        </Section>
      </div>
    </AppShell>
  );
}

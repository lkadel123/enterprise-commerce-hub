import { createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/layout/AppShell";
import { EmptyState, PageHeader, Section, StatCard } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminApiError } from "@/lib/api/client";
import { reportsApi } from "@/lib/api/reports";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";
import { PermissionDenied } from "@/lib/auth/RequireAdminAuth";
import { buildReportCsv, downloadCsv } from "@/lib/reports/export";
import { formatNpr, formatNprCompact } from "@/lib/utils";
import type { ReactNode } from "react";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports & Analytics — Northpeak Commerce Console" },
      {
        name: "description",
        content: "Sales, profit, category and region reporting with CSV, Excel and PDF export.",
      },
      { property: "og:title", content: "Reports & Analytics — Northpeak" },
      {
        property: "og:description",
        content: "Enterprise reporting with export and custom date ranges.",
      },
    ],
  }),
  component: ReportsPage,
});

const pieColors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

const tooltipStyle = {
  backgroundColor: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "var(--color-popover-foreground)",
};

function ChartSkeleton({ height = 300 }: { height?: number }) {
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

function ReportsPermissionGate({ children }: { children: ReactNode }) {
  const { permissions } = useAdminAuth();
  const allowed = permissions.some((p) => p.module === "reports");
  if (!allowed) return <PermissionDenied feature="reports and analytics" />;
  return <>{children}</>;
}

/** Dynamic default window: trailing 90 days (never a hardcoded business range). */
function defaultWindow(): { from: string; to: string } {
  const today = new Date();
  return {
    from: new Date(today.getTime() - 90 * 86_400_000).toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  };
}

function ReportsPage() {
  const [report, setReport] = useState("sales");
  const initialWindow = useMemo(defaultWindow, []);
  const [from, setFrom] = useState(initialWindow.from);
  const [to, setTo] = useState(initialWindow.to);

  // The selected range drives every request; the backend buckets monthly.
  const params = useMemo(() => ({ from, to, granularity: "monthly" as const }), [from, to]);
  const rangeParams = useMemo(() => ({ from, to }), [from, to]);

  // All metrics come from the backend (`/reports/*`, paid orders only).
  const revenue = reportsApi.useRevenue(params);
  const categorySales = reportsApi.useCategories(rangeParams);
  const paymentSplit = reportsApi.usePaymentMethods(rangeParams);
  const regionSales = reportsApi.useRegions(rangeParams);
  const topProducts = reportsApi.useTopProducts(10);

  const revenuePoints = revenue.data ?? [];
  const rangeRevenue = revenuePoints.reduce(
    (sum, p) => sum + (Number.isFinite(p.revenue) ? p.revenue : 0),
    0,
  );
  const rangeProfit = revenuePoints.reduce(
    (sum, p) => sum + (Number.isFinite(p.profit) ? p.profit : 0),
    0,
  );
  const rangeOrders = revenuePoints.reduce(
    (sum, p) => sum + (Number.isFinite(p.orders) ? p.orders : 0),
    0,
  );
  const regionTotal = (regionSales.data ?? []).reduce((sum, r) => sum + r.value, 0) || 1;

  const exportCsv = () => {
    if (revenuePoints.length === 0) return;
    downloadCsv(`sales-report_${from}_to_${to}.csv`, buildReportCsv(revenuePoints));
  };

  return (
    <AppShell>
      <PageHeader
        title="Reports & analytics"
        description="Build, schedule and export operational reports."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={exportCsv}
              disabled={revenuePoints.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4" /> CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled
              title="Excel export is not implemented yet"
            >
              <Download className="h-4 w-4" /> Excel
            </Button>
            <Button size="sm" className="h-9" disabled title="PDF report is not implemented yet">
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </>
        }
      />

      <ReportsPermissionGate>
        <Section className="mb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Report type</Label>
              <Select value={report} onValueChange={setReport}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">Sales report</SelectItem>
                  <SelectItem value="products">Product performance</SelectItem>
                  <SelectItem value="customers" disabled>
                    Customer report (unavailable)
                  </SelectItem>
                  <SelectItem value="inventory" disabled>
                    Inventory report (unavailable)
                  </SelectItem>
                  <SelectItem value="tax" disabled>
                    Tax report (unavailable)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                className="h-9"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                className="h-9"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Comparison</Label>
              <Select defaultValue="none" disabled>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No comparison (unsupported)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Section>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Gross Revenue"
            value={revenue.isLoading ? "…" : formatNpr(rangeRevenue)}
            note="Paid orders in range"
          />
          <StatCard
            label="Net Profit"
            value={revenue.isLoading ? "…" : formatNpr(rangeProfit)}
            note="Paid orders in range"
          />
          <StatCard
            label="Orders"
            value={revenue.isLoading ? "…" : rangeOrders.toLocaleString()}
            note="Paid orders in range"
          />
          <StatCard label="Refund Rate" value="—" note="Business definition pending" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Section
            className="xl:col-span-2"
            title="Revenue vs. profit"
            description="Monthly performance for the selected range"
          >
            {revenue.isLoading ? (
              <ChartSkeleton />
            ) : revenue.isError ? (
              <SectionError error={revenue.error} />
            ) : revenuePoints.length === 0 ? (
              <EmptyState
                title="No revenue in this range"
                description="Paid orders within the selected dates will populate this chart."
              />
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenuePoints} margin={{ left: -12, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      stroke="var(--color-muted-foreground)"
                    />
                    <YAxis
                      tickFormatter={(v: number) => formatNprCompact(v)}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      stroke="var(--color-muted-foreground)"
                    />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatNpr(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke="var(--color-chart-1)"
                      fill="url(#rev)"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      name="Profit"
                      stroke="var(--color-chart-2)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Section>

          <Section title="Payment methods" description="Share of settled transactions">
            {paymentSplit.isLoading ? (
              <ChartSkeleton />
            ) : paymentSplit.isError ? (
              <SectionError error={paymentSplit.error} />
            ) : (paymentSplit.data ?? []).length === 0 ? (
              <EmptyState
                title="No payments yet"
                description="Payment share appears once orders are paid."
              />
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentSplit.data ?? []}
                      dataKey="value"
                      nameKey="method"
                      innerRadius={58}
                      outerRadius={92}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {(paymentSplit.data ?? []).map((entry, i) => (
                        <Cell key={entry.method} fill={pieColors[i % pieColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatNpr(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </Section>

          <Section
            title="Sales by category"
            description="Revenue contribution per catalog category"
          >
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
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categorySales.data ?? []} margin={{ left: -12, right: 8 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="category"
                      tickLine={false}
                      axisLine={false}
                      fontSize={10}
                      stroke="var(--color-muted-foreground)"
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      tickFormatter={(v: number) => formatNprCompact(v)}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      stroke="var(--color-muted-foreground)"
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number) => formatNpr(v)}
                      cursor={{ fill: "var(--color-surface-muted)" }}
                    />
                    <Bar
                      dataKey="value"
                      name="Revenue"
                      fill="var(--color-chart-1)"
                      radius={[4, 4, 0, 0]}
                      barSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Section>

          <Section title="Order trend" description="Paid order volume over the period">
            {revenue.isLoading ? (
              <ChartSkeleton />
            ) : revenue.isError ? (
              <SectionError error={revenue.error} />
            ) : revenuePoints.length === 0 ? (
              <EmptyState
                title="No orders in this range"
                description="Paid orders within the selected dates will populate this chart."
              />
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenuePoints} margin={{ left: -12, right: 8 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      stroke="var(--color-muted-foreground)"
                    />
                    <YAxis
                      tickFormatter={(v: number) => formatNprCompact(v)}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      stroke="var(--color-muted-foreground)"
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="orders"
                      name="Orders"
                      stroke="var(--color-chart-3)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Section>

          <Section
            title="Regional breakdown"
            description="Settled revenue per region"
            bodyClassName="p-0"
          >
            {regionSales.isLoading ? (
              <div className="p-4">
                <ChartSkeleton height={180} />
              </div>
            ) : regionSales.isError ? (
              <SectionError error={regionSales.error} />
            ) : (regionSales.data ?? []).length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="No regional sales yet"
                  description="Paid orders will populate this breakdown."
                />
              </div>
            ) : (
              <ul className="divide-y">
                {(regionSales.data ?? []).map((r) => (
                  <li key={r.region} className="px-4 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate">{r.region}</span>
                      <span className="num font-medium">{formatNpr(r.value)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(100, (r.value / regionTotal) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {report === "products" && (
            <Section
              className="xl:col-span-3"
              title="Top products"
              description="Ranked by settled revenue in the selected range"
            >
              {topProducts.isLoading ? (
                <ChartSkeleton />
              ) : topProducts.isError ? (
                <SectionError error={topProducts.error} />
              ) : (topProducts.data ?? []).length === 0 ? (
                <EmptyState
                  title="No product sales yet"
                  description="Paid orders will populate this ranking."
                />
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProducts.data ?? []} margin={{ left: -12, right: 8 }}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--color-border)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        fontSize={10}
                        stroke="var(--color-muted-foreground)"
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis
                        tickFormatter={(v: number) => formatNprCompact(v)}
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        stroke="var(--color-muted-foreground)"
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(v: number, name) =>
                          name === "Units sold" ? String(v) : formatNpr(v)
                        }
                        cursor={{ fill: "var(--color-surface-muted)" }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        dataKey="revenue"
                        name="Revenue"
                        fill="var(--color-chart-1)"
                        radius={[4, 4, 0, 0]}
                        barSize={28}
                      />
                      <Bar
                        dataKey="unitsSold"
                        name="Units sold"
                        fill="var(--color-chart-3)"
                        radius={[4, 4, 0, 0]}
                        barSize={28}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Section>
          )}
        </div>
      </ReportsPermissionGate>
    </AppShell>
  );
}

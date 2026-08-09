import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Download,
  Eye,
  MoreHorizontal,
  Printer,
  RefreshCcw,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section, StatCard, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  categorySales,
  currency,
  dailySeries,
  orders,
  paymentSplit,
  products,
  regionSales,
  revenueSeries,
  weeklySeries,
  yearlySeries,
} from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Northpeak Commerce Console" },
      {
        name: "description",
        content:
          "Revenue, orders, customers and inventory health for your store in one enterprise commerce dashboard.",
      },
      { property: "og:title", content: "Dashboard — Northpeak Commerce Console" },
      {
        property: "og:description",
        content: "Real-time revenue, orders and inventory analytics for e-commerce operations teams.",
      },
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

const tooltipStyle = {
  backgroundColor: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "var(--color-popover-foreground)",
  boxShadow: "var(--shadow-overlay)",
};

function Dashboard() {
  const [granularity, setGranularity] = useState("monthly");
  const [metric, setMetric] = useState("revenue");

  const series =
    granularity === "daily"
      ? dailySeries
      : granularity === "weekly"
        ? weeklySeries
        : granularity === "yearly"
          ? yearlySeries
          : revenueSeries;

  const recent = orders.slice(0, 8);
  const lowStock = products.filter((p) => p.stock < 40).slice(0, 5);

  return (
    <AppShell>
      <PageHeader
        title="Good morning, Amelia"
        description="Here's what's happening with your store today."
        actions={
          <>
            <Select defaultValue="30d">
              <SelectTrigger className="h-9 w-[168px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="lastmonth">Last month</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          label="Total Revenue"
          value="$128,450"
          delta={12.8}
          note="vs previous period"
          spark={[42, 48, 45, 60, 58, 72, 80]}
        />
        <StatCard
          label="Total Orders"
          value="8,426"
          delta={8.4}
          note="1,204 today"
          spark={[30, 34, 38, 36, 45, 48, 52]}
        />
        <StatCard
          label="Total Customers"
          value="24,892"
          delta={14.2}
          note="612 new this period"
          spark={[20, 26, 30, 34, 38, 44, 50]}
        />
        <StatCard
          label="Avg. Order Value"
          value="$84.32"
          delta={5.6}
          note="Target $80.00"
          spark={[60, 62, 58, 64, 66, 68, 70]}
        />
        <StatCard
          label="Conversion Rate"
          value="4.82%"
          delta={0.8}
          note="Site-wide, all channels"
          spark={[40, 41, 44, 43, 46, 47, 49]}
        />
        <StatCard
          label="Refund Rate"
          value="1.42%"
          delta={-0.3}
          note="Below 2% threshold"
          spark={[30, 28, 26, 27, 24, 22, 20]}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Section
          className="xl:col-span-2"
          title="Revenue analytics"
          description="Revenue and order volume across the selected period"
          actions={
            <>
              <Tabs value={metric} onValueChange={setMetric}>
                <TabsList className="h-8">
                  <TabsTrigger value="revenue" className="text-xs">Revenue</TabsTrigger>
                  <TabsTrigger value="orders" className="text-xs">Orders</TabsTrigger>
                  <TabsTrigger value="profit" className="text-xs">Profit</TabsTrigger>
                </TabsList>
              </Tabs>
              <Select value={granularity} onValueChange={setGranularity}>
                <SelectTrigger className="hidden h-8 w-[112px] sm:flex">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
        >
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  tickFormatter={(v: number) => (metric === "orders" ? `${v / 1000}k` : `$${v / 1000}k`)}
                />
                <RTooltip contentStyle={tooltipStyle} />
                <Legend
                  iconType="circle"
                  iconSize={7}
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                />
                <Area
                  type="monotone"
                  dataKey={metric}
                  name={metric === "orders" ? "Orders" : metric === "profit" ? "Profit" : "Revenue"}
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  fill="url(#revGrad)"
                />
                <Line
                  type="monotone"
                  dataKey="orders"
                  name="Orders (comparison)"
                  stroke="var(--color-chart-2)"
                  strokeWidth={1.6}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Gross Revenue", "$142,180"],
              ["Net Revenue", "$128,450"],
              ["Discounts", "-$7,420"],
              ["Refunds", "-$2,018"],
              ["Taxes", "$9,864"],
              ["Shipping", "$4,292"],
            ].map(([k, v]) => (
              <div key={k} className="bg-card px-3 py-2.5">
                <dt className="text-[11px] text-muted-foreground">{k}</dt>
                <dd className="num mt-0.5 text-sm font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <div className="grid grid-cols-1 gap-4">
          <Section title="Sales by category" description="Revenue share, last 30 days">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categorySales}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={54}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke="var(--color-card)"
                    strokeWidth={2}
                  >
                    {categorySales.map((_, i) => (
                      <Cell key={i} fill={chartColors[i % chartColors.length]} />
                    ))}
                  </Pie>
                  <RTooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: number) => currency(v, 0)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-1.5">
              {categorySales.map((c, i) => (
                <li key={c.name} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: chartColors[i % chartColors.length] }}
                  />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="num font-medium">{currency(c.value, 0)}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Inventory alerts" description="Items at or below reorder level">
            <ul className="space-y-2.5">
              {lowStock.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-warning/12 text-warning">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="num truncate text-xs text-muted-foreground">
                      {p.sku} · {p.warehouse}
                    </p>
                  </div>
                  <span className="num shrink-0 text-sm font-semibold text-warning">
                    {p.stock}
                  </span>
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" size="sm" className="mt-4 w-full">
              <Link to="/inventory">
                Open inventory <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </Section>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Sales by payment method" description="Share of completed checkouts">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={paymentSplit} layout="vertical" margin={{ left: 24, right: 16 }}>
                <CartesianGrid stroke="var(--color-border)" horizontal={false} />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={128}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                />
                <RTooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
                  {paymentSplit.map((_, i) => (
                    <Cell key={i} fill={chartColors[i % chartColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Sales by region" description="Revenue distribution across markets">
          <ul className="space-y-3.5">
            {regionSales.map((r, i) => (
              <li key={r.name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{r.name}</span>
                  <span className="num text-muted-foreground">
                    {currency(r.value, 0)} · {r.share}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${r.share * 2.2}%`,
                      backgroundColor: chartColors[i % chartColors.length],
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section
        className="mt-4"
        bodyClassName="p-0"
        title="Recent orders"
        description="Latest activity across all sales channels"
        actions={
          <Button asChild variant="outline" size="sm" className="h-8">
            <Link to="/orders">View all</Link>
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/60">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Order ID</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Product</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Payment</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((o) => (
                <tr key={o.id} className="border-t transition-colors hover:bg-surface-muted/50">
                  <td className="px-4 py-2.5">
                    <Link
                      to="/orders/$orderId"
                      params={{ orderId: o.id }}
                      className="num font-medium text-primary hover:underline"
                    >
                      {o.id}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="whitespace-nowrap">{o.customer}</p>
                    <p className="truncate text-xs text-muted-foreground">{o.email}</p>
                  </td>
                  <td className="max-w-56 px-4 py-2.5">
                    <p className="truncate">{o.product}</p>
                    <p className="text-xs text-muted-foreground">{o.items} item(s)</p>
                  </td>
                  <td className="num px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {o.date}
                  </td>
                  <td className="num px-4 py-2.5 text-right font-medium">
                    {currency(o.amount)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {o.payment}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to="/orders/$orderId" params={{ orderId: o.id }}>
                            <Eye className="h-4 w-4" /> View
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Printer className="h-4 w-4" /> Print invoice
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                          <RefreshCcw className="h-4 w-4" /> Refund
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive">
                          <XCircle className="h-4 w-4" /> Cancel
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </AppShell>
  );
}

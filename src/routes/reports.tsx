import { createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
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
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section, StatCard } from "@/components/kit";
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
import {
  categorySales,
  compact,
  currency,
  paymentSplit,
  regionSales,
  revenueSeries,
} from "@/lib/mock-data";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports & Analytics — Northpeak Commerce Console" },
      {
        name: "description",
        content: "Sales, profit, category and region reporting with CSV, Excel and PDF export.",
      },
      { property: "og:title", content: "Reports & Analytics — Northpeak" },
      { property: "og:description", content: "Enterprise reporting with export and custom date ranges." },
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

function ReportsPage() {
  const [report, setReport] = useState("sales");

  return (
    <AppShell>
      <PageHeader
        title="Reports & analytics"
        description="Build, schedule and export operational reports."
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9" onClick={() => toast.success("CSV export started")}><FileSpreadsheet className="h-4 w-4" /> CSV</Button>
            <Button variant="outline" size="sm" className="h-9" onClick={() => toast.success("Excel export started")}><Download className="h-4 w-4" /> Excel</Button>
            <Button size="sm" className="h-9" onClick={() => toast.success("PDF report generating")}><FileText className="h-4 w-4" /> PDF</Button>
          </>
        }
      />

      <Section className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Report type</Label>
            <Select value={report} onValueChange={setReport}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sales">Sales report</SelectItem>
                <SelectItem value="products">Product performance</SelectItem>
                <SelectItem value="customers">Customer report</SelectItem>
                <SelectItem value="inventory">Inventory report</SelectItem>
                <SelectItem value="tax">Tax report</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">From</Label><Input type="date" className="h-9" defaultValue="2026-01-01" /></div>
          <div className="space-y-1.5"><Label className="text-xs">To</Label><Input type="date" className="h-9" defaultValue="2026-08-09" /></div>
          <div className="space-y-1.5">
            <Label className="text-xs">Comparison</Label>
            <Select defaultValue="prev">
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="prev">Previous period</SelectItem>
                <SelectItem value="year">Same period last year</SelectItem>
                <SelectItem value="none">No comparison</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Gross Revenue" value={currency(1414200, 0)} delta={18.6} note="Year to date" />
        <StatCard label="Net Profit" value={currency(462750, 0)} delta={12.4} note="32.7% margin" />
        <StatCard label="Orders" value="89,578" delta={9.8} note="Across 5 regions" />
        <StatCard label="Refund Rate" value="1.9%" delta={-0.4} note="Below 2.5% target" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Section className="xl:col-span-2" title="Revenue vs. profit" description="Monthly performance for the selected range">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueSeries} margin={{ left: -12, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted-foreground)" />
                <YAxis tickFormatter={(v: number) => compact(v)} tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted-foreground)" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => currency(v, 0)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="var(--color-chart-1)" fill="url(#rev)" strokeWidth={2} />
                <Line type="monotone" dataKey="profit" name="Profit" stroke="var(--color-chart-2)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Payment methods" description="Share of settled transactions">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={paymentSplit} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={2} stroke="none">
                  {paymentSplit.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Sales by category" description="Revenue contribution per catalog category">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categorySales} margin={{ left: -12, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={10} stroke="var(--color-muted-foreground)" interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tickFormatter={(v: number) => compact(v)} tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted-foreground)" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => currency(v, 0)} cursor={{ fill: "var(--color-surface-muted)" }} />
                <Bar dataKey="value" name="Revenue" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Order trend" description="Order volume over the period">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueSeries} margin={{ left: -12, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted-foreground)" />
                <YAxis tickFormatter={(v: number) => compact(v)} tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted-foreground)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="orders" name="Orders" stroke="var(--color-chart-3)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Regional breakdown" bodyClassName="p-0">
          <ul className="divide-y">
            {regionSales.map((r) => (
              <li key={r.name} className="px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate">{r.name}</span>
                  <span className="num font-medium">{currency(r.value, 0)}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${r.share * 2}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </AppShell>
  );
}

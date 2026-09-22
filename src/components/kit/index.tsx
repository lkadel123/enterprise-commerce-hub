import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("card-surface", className)}>
      {(title || actions) && (
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="truncate text-sm font-semibold">{title}</h2>}
            {description && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  delta,
  note,
  spark,
}: {
  label: string;
  value: string;
  /** Period-over-period change in % — omitted when the backend provides no
   * comparison data (no fabricated deltas). */
  delta?: number;
  note?: string;
  spark?: number[];
}) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="card-surface p-4 transition-shadow hover:shadow-raised">
      <p className="text-label">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="num text-2xl font-semibold tracking-tight">{value}</p>
        {spark && (
          <div className="h-9 w-20 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spark.map((v, i) => ({ i, v }))}>
                <defs>
                  <linearGradient id={`sp-${label.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={positive ? "var(--color-success)" : "var(--color-destructive)"}
                      stopOpacity={0.28}
                    />
                    <stop offset="100%" stopColor="var(--color-surface)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  strokeWidth={1.6}
                  stroke={positive ? "var(--color-success)" : "var(--color-destructive)"}
                  fill={`url(#sp-${label.replace(/\s/g, "")})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        {delta !== undefined && (
          <span
            className={cn(
              "num inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium",
              positive
                ? "bg-success/10 text-success"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {positive ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {positive ? "+" : ""}
            {delta}%
          </span>
        )}
        {note && <span className="truncate text-xs text-muted-foreground">{note}</span>}
      </div>
    </div>
  );
}

const tone: Record<string, string> = {
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/12 text-warning border-warning/25",
  danger: "bg-destructive/10 text-destructive border-destructive/20",
  info: "bg-info/10 text-info border-info/20",
  neutral: "bg-muted text-muted-foreground border-border",
};

const statusTone: Record<string, keyof typeof tone> = {
  Delivered: "success",
  Paid: "success",
  Active: "success",
  Approved: "success",
  "In Stock": "success",
  VIP: "info",
  Shipped: "info",
  Processing: "info",
  New: "info",
  Scheduled: "info",
  Pending: "warning",
  "Low Stock": "warning",
  Expiring: "warning",
  Draft: "warning",
  Cancelled: "danger",
  Refunded: "danger",
  Failed: "danger",
  Rejected: "danger",
  Blocked: "danger",
  "Out of Stock": "danger",
  Suspended: "danger",
  Archived: "neutral",
  Hidden: "neutral",
  Expired: "neutral",
  Invited: "neutral",
};

export function StatusBadge({ status }: { status: string }) {
  const t = tone[statusTone[status] ?? "neutral"];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        t,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-lg border bg-surface-muted">
        <Badge variant="secondary" className="px-1.5">0</Badge>
      </div>
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function TablePagination({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (p: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="num text-xs text-muted-foreground">
        Page {page} of {pageCount} · {total.toLocaleString()} records
      </p>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page === 1}
          className="rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-surface-muted disabled:opacity-40"
        >
          Previous
        </button>
        {Array.from({ length: Math.min(pageCount, 5) }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            onClick={() => onPage(p)}
            className={cn(
              "num min-w-8 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
              p === page
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-surface-muted",
            )}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPage(Math.min(pageCount, page + 1))}
          disabled={page === pageCount}
          className="rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-surface-muted disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

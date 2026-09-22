import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Download,
  Eye,
  MoreHorizontal,
  RefreshCcw,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section, StatusBadge, TablePagination, EmptyState } from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminApiError } from "@/lib/api/client";
import { ordersApi } from "@/lib/api/commerce";
import type { OrderDto } from "@/lib/api/types";
import { formatNpr } from "@/lib/utils";

export const Route = createFileRoute("/orders/")({
  head: () => ({
    meta: [
      { title: "Orders - Northpeak Commerce Console" },
      {
        name: "description",
        content: "Search, filter and fulfil customer orders with payment status and refund workflows.",
      },
    ],
  }),
  component: OrdersPage,
});

const PAGE_SIZE = 10;

function ordersToCsv(rows: OrderDto[]): string {
  const header = ["Order", "Customer", "Email", "Items", "Total", "Status", "Payment status", "Created"];
  const lines = rows.map((o) =>
    [
      o.orderNumber,
      o.customer?.name ?? "Guest",
      o.email,
      o.items.reduce((n, it) => n + it.qty, 0),
      o.amounts.total,
      o.status,
      o.payment.status,
      o.createdAt,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function OrdersPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [payment, setPayment] = useState("all");
  const [page, setPage] = useState(1);

  const params = {
    ...(query.trim() ? { q: query.trim() } : {}),
    ...(status !== "all" ? { status } : {}),
    ...(payment !== "all" ? { payment } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
  const ordersQuery = ordersApi.useList(params);
  const cancel = ordersApi.useCancel();
  const refund = ordersApi.useRefund();

  const rows = ordersQuery.data?.data ?? [];
  const meta = ordersQuery.data?.meta;
  const total = meta?.total ?? 0;
  const pageCount = meta?.totalPages ?? 1;

  const act = (fn: () => Promise<unknown>, success: string) => {
    fn()
      .then(() => toast.success(success))
      .catch((e: unknown) => toast.error(e instanceof AdminApiError ? e.message : "Action failed"));
  };

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.info("No orders on this page to export");
      return;
    }
    const csv = ordersToCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-page-${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded for the current page");
  };

  return (
    <AppShell>
      <PageHeader
        title="Orders"
        description={`${total} orders matching current filters`}
        actions={
          <Button variant="outline" size="sm" className="h-9" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export page CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search order number, customer or email"
            aria-label="Search orders"
            className="h-9"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-40" aria-label="Filter by order status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Processing">Processing</SelectItem>
            <SelectItem value="Shipped">Shipped</SelectItem>
            <SelectItem value="Delivered">Delivered</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
            <SelectItem value="Refunded">Refunded</SelectItem>
            <SelectItem value="Expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={payment}
          onValueChange={(v) => {
            setPayment(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-44" aria-label="Filter by payment status">
            <SelectValue placeholder="All payments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payments</SelectItem>
            <SelectItem value="Paid">Paid</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Initiated">Initiated</SelectItem>
            <SelectItem value="Failed">Failed</SelectItem>
            <SelectItem value="Refunded">Refunded</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
            <SelectItem value="Expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Section bodyClassName="p-0">
        {ordersQuery.isLoading ? (
          <div className="p-4">
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 w-full animate-pulse rounded bg-surface-muted" />
              ))}
            </div>
          </div>
        ) : ordersQuery.isError ? (
          <div className="p-6">
            <EmptyState
              title="Could not load orders"
              description={
                ordersQuery.error instanceof AdminApiError
                  ? ordersQuery.error.message
                  : "Check your connection and try again."
              }
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No orders found"
              description="Try adjusting the search or filters. Storefront orders appear here in real time."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-label text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium sm:px-5">Order</th>
                  <th className="px-4 py-2.5 font-medium sm:px-5">Customer</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell md:px-5">Items</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell lg:px-5">Date</th>
                  <th className="px-4 py-2.5 text-right font-medium sm:px-5">Total</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell lg:px-5">Payment</th>
                  <th className="px-4 py-2.5 font-medium sm:px-5">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium sm:px-5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 sm:px-5">
                      <Link to="/orders/$orderId" params={{ orderId: o.id }} className="num font-medium text-primary hover:underline">
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="whitespace-nowrap">{o.customer?.name ?? "Guest"}</p>
                      <p className="truncate text-xs text-muted-foreground">{o.email}</p>
                    </td>
                    <td className="max-w-56 hidden px-4 py-2.5 md:table-cell md:px-5">
                      <p className="truncate">{o.items[0]?.name ?? "-"}</p>
                      <p className="text-xs text-muted-foreground">{o.items.reduce((n, it) => n + it.qty, 0)} item(s)</p>
                    </td>
                    <td className="num hidden whitespace-nowrap px-4 py-2.5 text-muted-foreground lg:table-cell lg:px-5">
                      {new Date(o.createdAt).toLocaleDateString()}
                    </td>
                    <td className="num whitespace-nowrap px-4 py-2.5 text-right font-medium sm:px-5">{formatNpr(o.amounts.total)}</td>
                    <td className="hidden whitespace-nowrap px-4 py-2.5 lg:table-cell lg:px-5">
                      <p className="text-muted-foreground">{o.payment.method}</p>
                      <p className="text-xs text-muted-foreground">{o.payment.status}</p>
                    </td>
                    <td className="px-4 py-2.5 sm:px-5"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-2.5 text-right sm:px-5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${o.orderNumber}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link to="/orders/$orderId" params={{ orderId: o.id }}>
                              <Eye className="h-4 w-4" /> View
                            </Link>
                          </DropdownMenuItem>
                          {o.payment.status === "Paid" && o.status !== "Refunded" ? (
                            <DropdownMenuSeparator />
                          ) : null}
                          {o.payment.status === "Paid" && o.status !== "Refunded" ? (
                            <DropdownMenuItem
                              onClick={() =>
                                act(() => refund.mutateAsync({ id: o.id }), `Refund initiated for ${o.orderNumber}`)
                              }
                            >
                              <RefreshCcw className="h-4 w-4" /> Refund
                            </DropdownMenuItem>
                          ) : null}
                          {o.status === "Pending" || o.status === "Processing" ? (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() =>
                                act(() => cancel.mutateAsync({ id: o.id }), `${o.orderNumber} cancelled`)
                              }
                            >
                              <XCircle className="h-4 w-4" /> Cancel
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <TablePagination page={page} pageCount={pageCount} total={total} onPage={setPage} />
      </Section>
    </AppShell>
  );
}

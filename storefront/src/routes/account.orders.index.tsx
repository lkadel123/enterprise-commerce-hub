import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Price } from "@/components/common/Price";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DateLabel } from "@/components/common/DateLabel";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingSkeleton } from "@/components/loading/LoadingSkeleton";
import { ordersApi } from "@/lib/api/orders";
import { useCustomerAuthReady } from "@/lib/auth/CustomerAuthContext";
import type { OrderStatus } from "@/types";

/**
 * `/account/orders` — paginated order history with status filter.
 *
 * Desktop: table presentation. Mobile (<768px): stacked order cards.
 * All amounts come from the backend `OrderDto` — never computed client-side.
 */
export const Route = createFileRoute("/account/orders/")({
  component: OrdersPage,
});

const STATUSES: (OrderStatus | "all")[] = [
  "all",
  "Pending",
  "Processing",
  "Shipped",
  "Delivered",
  "Cancelled",
  "Refunded",
  "Expired",
];

function OrdersPage() {
  const authReady = useCustomerAuthReady();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OrderStatus | "all">("all");

  const orders = useQuery({
    queryKey: ["orders", "list", page, status],
    queryFn: async () => {
      const response = await ordersApi.list({
        page,
        pageSize: 10,
        ...(status !== "all" ? { status } : {}),
      });
      return { items: response.data, meta: response.meta };
    },
    enabled: authReady,
    placeholderData: keepPreviousData,
  });

  const meta = orders.data?.meta;
  const totalPages = meta?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Orders</h2>
        <div>
          <Label htmlFor="order-status-filter" className="sr-only">
            Filter by status
          </Label>
          <select
            id="order-status-filter"
            className="h-11 rounded-md border bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as OrderStatus | "all");
              setPage(1);
            }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All statuses" : s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {orders.isPending ? (
        <div role="status">
          <LoadingSkeleton count={3} />
        </div>
      ) : orders.isError ? (
        <ErrorState
          error={orders.error}
          title="Unable to load your orders"
          onRetry={() => void orders.refetch()}
        />
      ) : orders.data.items.length === 0 ? (
        <EmptyState
          icon={<Package className="h-10 w-10" />}
          title={status === "all" ? "No orders yet" : `No ${status.toLowerCase()} orders`}
          description="Orders you place will appear here."
          action={
            <Button asChild>
              <Link to="/products">Browse products</Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-md border md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Your order history</caption>
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th scope="col" className="px-4 py-3 font-medium">
                    Order
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Date
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Payment
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Total
                  </th>
                  <th scope="col" className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {orders.data.items.map((order) => (
                  <tr key={order.id}>
                    <td className="px-4 py-3 font-medium">{order.orderNumber}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <DateLabel date={order.createdAt} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.payment.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Price value={order.amounts.total} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild variant="outline" size="sm" className="min-h-[44px]">
                        <Link to="/account/orders/$orderId" params={{ orderId: order.id }}>
                          Details
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {orders.data.items.map((order) => (
              <li key={order.id} className="rounded-md border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="break-words font-medium">{order.orderNumber}</p>
                  <StatusBadge status={order.status} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  <DateLabel date={order.createdAt} /> · Payment: {order.payment.status}
                </p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <Price value={order.amounts.total} />
                  <Button asChild variant="outline" size="sm" className="min-h-[44px]">
                    <Link to="/account/orders/$orderId" params={{ orderId: order.id }}>
                      Details
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          {totalPages > 1 ? (
            <nav aria-label="Order pages" className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span aria-live="polite" className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}

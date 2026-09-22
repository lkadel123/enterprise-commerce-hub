import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Bell, MapPin, Package, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Price } from "@/components/common/Price";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingSkeleton } from "@/components/loading/LoadingSkeleton";
import { ordersApi } from "@/lib/api/orders";
import { useCustomerAuth, useCustomerAuthReady } from "@/lib/auth/CustomerAuthContext";
import { useUnreadCountQuery } from "@/features/account/account-hooks";

/**
 * Account dashboard (`/account`).
 *
 * Profile snapshot, recent orders, unread notification count and quick
 * actions. All data is fetched only after authentication has resolved
 * (auth-gated queries), so guests never trigger private requests.
 */
export const Route = createFileRoute("/account/")({
  component: AccountDashboard,
});

function AccountDashboard() {
  const { customer } = useCustomerAuth();
  const authReady = useCustomerAuthReady();
  const recentOrders = useQuery({
    queryKey: ["orders", "recent"],
    queryFn: async () => {
      const response = await ordersApi.list({ page: 1, pageSize: 5 });
      return response.data;
    },
    enabled: authReady,
  });
  const unread = useUnreadCountQuery();

  if (!customer) return null;

  const initials = customer.name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-6" aria-busy={recentOrders.isPending}>
      {/* Profile snapshot */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-4 text-xl">
            <span
              aria-hidden="true"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
            >
              {initials}
            </span>
            <span className="break-words">{customer.name}</span>
          </CardTitle>
          <CardDescription className="break-words">{customer.email}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Badge variant={customer.status === "Active" ? "secondary" : "destructive"}>
            {customer.status}
          </Badge>
          <Button asChild variant="outline" size="sm" className="min-h-[44px]">
            <Link to="/account/profile">
              <UserRound className="mr-2 h-4 w-4" />
              Edit profile
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Notification summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5" aria-hidden="true" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {unread.isPending
              ? "Checking unread notifications…"
              : unread.data && unread.data > 0
                ? `You have ${unread.data} unread notification${unread.data === 1 ? "" : "s"}.`
                : "You're all caught up."}
          </p>
          <Button asChild variant="outline" size="sm" className="min-h-[44px]">
            <Link to="/account/notifications">View notifications</Link>
          </Button>
        </CardContent>
      </Card>

      {/* Recent orders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent orders</CardTitle>
          <CardDescription>Your five most recent orders.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentOrders.isPending ? (
            <div role="status">
              <LoadingSkeleton count={2} />
            </div>
          ) : recentOrders.isError ? (
            <ErrorState
              error={recentOrders.error}
              title="Unable to load your orders"
              onRetry={() => void recentOrders.refetch()}
            />
          ) : recentOrders.data.length === 0 ? (
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title="No orders yet"
              description="When you place an order it will appear here."
              action={
                <Button asChild>
                  <Link to="/products">Browse products</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y">
              {recentOrders.data.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium">{order.orderNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Price value={order.amounts.total} />
                    <StatusBadge status={order.status} />
                    <Button asChild variant="outline" size="sm" className="min-h-[44px]">
                      <Link to="/account/orders/$orderId" params={{ orderId: order.id }}>
                        View
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!recentOrders.isError && !(recentOrders.data?.length === 0) ? (
            <div className="mt-4">
              <Button asChild variant="ghost" size="sm" className="min-h-[44px]">
                <Link to="/account/orders">View all orders</Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Button asChild variant="outline" className="min-h-[44px]">
            <Link to="/account/orders">
              <Package className="mr-2 h-4 w-4" /> Orders
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-[44px]">
            <Link to="/account/addresses">
              <MapPin className="mr-2 h-4 w-4" /> Addresses
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-[44px]">
            <Link to="/account/support" search={{ relatedOrderId: undefined }}>
              Get support
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

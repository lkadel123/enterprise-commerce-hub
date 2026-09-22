import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Ticket as CouponIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DateLabel } from "@/components/common/DateLabel";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingSkeleton } from "@/components/loading/LoadingSkeleton";
import { couponsApi } from "@/lib/api/coupons";
import { useCustomerAuthReady } from "@/lib/auth/CustomerAuthContext";

/**
 * `/account/coupons` — the customer's usable coupons.
 *
 * Renders only what the backend `CustomerCouponDto` provides: code, type,
 * value, min order, expiry, per-customer remaining redemptions. No invented
 * coupon rules and no admin-only fields.
 */
export const Route = createFileRoute("/account/coupons")({
  component: CouponsPage,
});

function CouponsPage() {
  const authReady = useCustomerAuthReady();
  const coupons = useQuery({
    queryKey: ["coupons", "mine"],
    queryFn: async () => (await couponsApi.list({ pageSize: 50 })).data,
    enabled: authReady,
  });

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Your coupons</h2>

      {coupons.isPending ? (
        <div role="status">
          <LoadingSkeleton count={2} />
        </div>
      ) : coupons.isError ? (
        <ErrorState
          error={coupons.error}
          title="Unable to load your coupons"
          onRetry={() => void coupons.refetch()}
        />
      ) : coupons.data.length === 0 ? (
        <EmptyState
          icon={<CouponIcon className="h-10 w-10" />}
          title="No coupons yet"
          description="Discount coupons you earn will appear here."
          action={
            <Button asChild>
              <Link to="/products">Browse products</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {coupons.data.map((coupon) => (
            <li key={coupon.code} className="rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="break-words font-mono text-lg font-semibold">{coupon.code}</p>
                <Badge variant={coupon.usable ? "secondary" : "destructive"}>
                  {coupon.usable ? "Usable" : "Fully redeemed"}
                </Badge>
              </div>
              <dl className="mt-2 space-y-1 text-sm text-muted-foreground">
                <div className="flex justify-between gap-3">
                  <dt>Type</dt>
                  <dd className="font-medium text-foreground">{coupon.type}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Value</dt>
                  <dd className="font-medium text-foreground">{coupon.value}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Minimum order</dt>
                  <dd className="font-medium text-foreground">{coupon.minOrder}</dd>
                </div>
                {coupon.maxDiscount > 0 ? (
                  <div className="flex justify-between gap-3">
                    <dt>Max discount</dt>
                    <dd className="font-medium text-foreground">{coupon.maxDiscount}</dd>
                  </div>
                ) : null}
                {coupon.perCustomerRemaining !== null ? (
                  <div className="flex justify-between gap-3">
                    <dt>Remaining uses</dt>
                    <dd className="font-medium text-foreground">{coupon.perCustomerRemaining}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt>Valid until</dt>
                  <dd className="font-medium text-foreground">
                    <DateLabel date={coupon.endAt} />
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

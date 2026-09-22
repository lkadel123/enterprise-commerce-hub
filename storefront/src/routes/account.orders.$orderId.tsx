import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Circle, ClockAlert, MessageSquareText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Price } from "@/components/common/Price";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DateLabel } from "@/components/common/DateLabel";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingSkeleton } from "@/components/loading/LoadingSkeleton";
import { ordersApi } from "@/lib/api/orders";
import { useCustomerAuthReady } from "@/lib/auth/CustomerAuthContext";
import { gatewayChoiceOf } from "@/features/checkout/checkout-validation";
import { FonepayQrCheckout } from "@/features/payment/FonepayQrCheckout";
import { CybersourceCheckout } from "@/features/payment/CybersourceCheckout";
import { ReviewForm } from "@/features/account/ReviewForm";
import type { OrderRefund, RefundStatus } from "@/types";

const REFUND_LABEL: Record<RefundStatus, string> = {
  PENDING: "Refund pending",
  SUCCESS: "Refund completed",
  FAILED: "Refund failed",
  UNSUPPORTED: "Refund processed (status-only)",
};

/**
 * `/account/orders/$orderId` — order detail with tracking timeline.
 *
 * Ownership is enforced server-side (another customer's id → 404). All
 * amounts are rendered directly from the backend `OrderDto` — no client-side
 * financial computation. Payment state always comes from the backend; the
 * optional retry action only calls the backend initiate API and uses the
 * returned server payment URL (never a client-derived amount/status).
 */
export const Route = createFileRoute("/account/orders/$orderId")({
  component: OrderDetailPage,
});

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const authReady = useCustomerAuthReady();
  const queryClient = useQueryClient();

  const order = useQuery({
    queryKey: ["order", orderId],
    queryFn: async () => (await ordersApi.getById(orderId)).data,
    enabled: authReady,
    retry: false,
  });

  const tracking = useQuery({
    queryKey: ["order", orderId, "tracking"],
    queryFn: async () => (await ordersApi.getTracking(orderId)).data,
    enabled: authReady && order.isSuccess,
  });

  if (order.isPending) {
    return (
      <div role="status" aria-busy="true">
        <LoadingSkeleton count={3} />
      </div>
    );
  }

  if (order.isError || !order.data) {
    return (
      <ErrorState
        error={order.error}
        title="Unable to load this order"
        description="The order may not exist, or it may belong to another account."
        onRetry={() => void order.refetch()}
      />
    );
  }

  const data = order.data;

  const isGatewayOrder = data.payment.method === "Credit Card";
  // Fonepay QR orders: the FONEPAY provider once a payment has been initiated,
  // or the advisory checkout-time gateway hint the backend records in
  // `payment.metadata.gatewayChoice` — which is what identifies a freshly
  // placed Fonepay order before any initiation happened. The order snapshot
  // has no `gateway` field (that projection exists only on the payment status
  // DTO), so the provider + recorded hint are the correct signals here.
  const isFonepayOrder =
    data.payment.provider === "FONEPAY" || gatewayChoiceOf(data.payment.metadata) === "FONEPAY";
  const isExpired =
    data.status === "Expired" || (data.payment.status === "Expired" && data.status !== "Cancelled");

  // Retry is only offered for an unpaid card order that hasn't reached a
  // terminal state. Payment status/amounts always come from the backend.
  const canRetryPayment =
    isGatewayOrder &&
    !isExpired &&
    !["Paid", "Refunded"].includes(data.payment.status) &&
    !["Cancelled", "Refunded", "Expired"].includes(data.status);

  // Fonepay QR retry — offered for unpaid Fonepay orders that haven't reached
  // a terminal state.
  const canRetryFonepay =
    isFonepayOrder &&
    !isExpired &&
    !["Paid", "Refunded"].includes(data.payment.status) &&
    !["Cancelled", "Refunded", "Expired"].includes(data.status);

  const handleSettled = () => {
    // The backend is authoritative — refresh this order and the history list.
    void queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    void queryClient.invalidateQueries({ queryKey: ["orders", "list"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Order {data.orderNumber}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Placed <DateLabel date={data.createdAt} />
            {data.expiresAt ? ` · Payment due by ${new Date(data.expiresAt).toLocaleString()}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={data.status} />
          <StatusBadge status={data.payment.status} />
        </div>
      </div>

      {isExpired ? (
        <div role="status" className="rounded-md border p-4 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <ClockAlert className="h-5 w-5" aria-hidden="true" />
            This order expired before payment was completed
          </div>
          <p className="mt-1 text-muted-foreground">
            Any reserved stock has been released. If you still want these items, place a new order.
          </p>
          <Button asChild className="mt-3 min-h-[44px]">
            <Link to="/products">Browse products</Link>
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm" className="min-h-[44px]">
          <Link to="/account/orders">Back to orders</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="min-h-[44px]">
          <Link to="/account/support" search={{ relatedOrderId: orderId }}>
            <MessageSquareText className="mr-2 h-4 w-4" aria-hidden="true" />
            Help with this order
          </Link>
        </Button>
      </div>

      {canRetryPayment ? (
        <div className="rounded-md border p-4">
          <h3 className="text-sm font-medium">Payment {data.payment.status.toLowerCase()}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            It looks like this card payment did not complete. You can retry using your existing
            order — a new order is never created.
          </p>
          <div className="mt-3">
            <CybersourceCheckout orderId={orderId} onSettled={handleSettled} />
          </div>
        </div>
      ) : null}

      {canRetryFonepay ? (
        <div className="rounded-md border p-4">
          <h3 className="text-sm font-medium">Complete payment with Fonepay QR</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            This order was placed with Fonepay QR. Scan the QR code below with any Fonepay-supported
            banking app to complete your payment. Your order will be confirmed automatically once
            the payment clears.
          </p>
          <div className="mt-3">
            <FonepayQrCheckout orderId={orderId} onSettled={handleSettled} />
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {data.items.map((item) => (
                <li key={item.productId} className="flex items-start justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="line-clamp-2 break-words font-medium">{item.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      SKU {item.sku} · Qty {item.qty} · <Price value={item.unitPrice} /> each
                    </span>
                  </span>
                  <Price value={item.lineTotal} className="shrink-0" />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Summary + addresses */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>
                    <Price value={data.amounts.subtotal} />
                  </dd>
                </div>
                {data.amounts.discount > 0 ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Discount</dt>
                    <dd>
                      <Price value={-data.amounts.discount} />
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Shipping</dt>
                  <dd>
                    <Price value={data.amounts.shipping} />
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Tax</dt>
                  <dd>
                    <Price value={data.amounts.tax} />
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-t pt-2 text-base font-semibold">
                  <dt>Total</dt>
                  <dd>
                    <Price value={data.amounts.total} />
                  </dd>
                </div>
              </dl>
              {data.payment.failureReason ? (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  Payment issue: {data.payment.failureReason}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {data.refund ? <RefundCard refund={data.refund} /> : null}

          {data.addresses.shipping ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Shipping address</CardTitle>
              </CardHeader>
              <CardContent>
                <address className="break-words text-sm not-italic text-muted-foreground">
                  {[
                    data.addresses.shipping.line1,
                    data.addresses.shipping.line2,
                    data.addresses.shipping.city,
                    data.addresses.shipping.state,
                    data.addresses.shipping.postalCode,
                    data.addresses.shipping.country,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </address>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Phase 18 (G18-02): review controls only for DELIVERED orders.
          Eligibility itself is enforced by the backend; this UI just exposes
          the owning order id and renders any server rejection inline. */}
      {data.status === "Delivered" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leave a review</CardTitle>
            <CardDescription>
              Thanks for your order. You can review items from this delivered order.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {data.items.map((item) => (
                <DeliveredItemReview
                  key={item.productId}
                  orderId={orderId}
                  productId={item.productId}
                  name={item.name}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Tracking timeline — only real backend events are shown. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tracking</CardTitle>
        </CardHeader>
        <CardContent>
          {tracking.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading tracking information…
            </p>
          ) : tracking.isError || !tracking.data ? (
            <p className="text-sm text-muted-foreground">
              Tracking is not available for this order yet.
            </p>
          ) : tracking.data.timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tracking events yet.</p>
          ) : (
            <ol className="space-y-4" aria-label="Tracking timeline">
              {tracking.data.timeline.map((entry) => (
                <li key={`${entry.label}-${entry.at}`} className="flex items-start gap-3">
                  {entry.done ? (
                    <CheckCircle2
                      className="mt-0.5 h-5 w-5 shrink-0 text-green-600"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  <span className="min-w-0 text-sm">
                    <span
                      className={entry.done ? "font-medium" : "font-medium text-muted-foreground"}
                    >
                      {entry.label}
                    </span>
                    <span className="block text-muted-foreground">
                      <DateLabel date={entry.at} />
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Phase 18 (G18-02) — a collapsible review control for one delivered item. */
function DeliveredItemReview({
  orderId,
  productId,
  name,
}: {
  orderId: string;
  productId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-md border p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="break-words text-sm font-medium">{name}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-[44px]"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Cancel" : "Write a review"}
        </Button>
      </div>
      {open ? (
        <div className="mt-4">
          <ReviewForm
            orderId={orderId}
            productId={productId}
            productName={name}
            onSubmitted={() => setOpen(false)}
          />
        </div>
      ) : null}
    </li>
  );
}

function RefundCard({ refund }: { refund: OrderRefund }) {
  const label = REFUND_LABEL[refund.status];
  const isProblem = refund.status === "FAILED";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Refund</CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={`text-sm font-medium ${isProblem ? "text-destructive" : ""}`}
          aria-live="polite"
        >
          {label}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          <Price value={refund.amount} />
          {refund.reason ? ` · ${refund.reason}` : ""}
        </p>
        {refund.status === "UNSUPPORTED" ? (
          <p className="mt-2 text-xs text-muted-foreground">
            This payment method was refunded as a status-only adjustment. Contact support if you
            expected a return to your original payment method.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

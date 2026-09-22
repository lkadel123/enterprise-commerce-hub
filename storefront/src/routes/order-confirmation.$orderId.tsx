import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, ClockAlert, XCircle } from "lucide-react";

import { AuthGuard } from "@/components/auth/AuthGuard";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingSkeleton } from "@/components/loading/LoadingSkeleton";
import { Price } from "@/components/common/Price";
import { pageHead } from "@/lib/seo";
import { useOrderQuery, usePaymentStatusQuery } from "@/features/checkout/checkout-hooks";
import { gatewayChoiceOf } from "@/features/checkout/checkout-validation";
import { FonepayQrCheckout } from "@/features/payment/FonepayQrCheckout";
import { CybersourceCheckout } from "@/features/payment/CybersourceCheckout";
import type { PaymentStatus } from "@/types";

/**
 * `/order-confirmation/$orderId` — post-order confirmation and payment
 * handoff.
 *
 * SECURITY: the order is loaded through the ownership-scoped backend endpoint;
 * another customer's order id simply returns 404. Payment success is NEVER
 * inferred from returning from the gateway — the authoritative state comes
 * exclusively from `GET /customer/payments/:orderId/status`, which polls
 * while the payment is Pending/Initiated.
 */
export const Route = createFileRoute("/order-confirmation/$orderId")({
  head: () => {
    const base = pageHead({
      title: "Order Confirmation — NASB",
      description: "Your order confirmation and payment status.",
      path: "/order-confirmation",
    });
    return {
      ...base,
      meta: [...base.meta, { name: "robots", content: "noindex, nofollow" }],
    };
  },
  component: OrderConfirmationRoute,
});

function OrderConfirmationRoute() {
  const { orderId } = Route.useParams();
  return (
    <AuthGuard>
      <OrderConfirmation orderId={orderId} />
    </AuthGuard>
  );
}

function OrderConfirmation({ orderId }: { orderId: string }) {
  const order = useOrderQuery(orderId);
  const paymentStatus = usePaymentStatusQuery(orderId);
  const queryClient = useQueryClient();

  // Hoisted so hooks are always called unconditionally (rules of hooks).
  const status: PaymentStatus | undefined =
    paymentStatus.data?.status ?? order.data?.payment?.status;

  // Phase 17 (P2-04): once payment reaches a terminal state, refresh the order
  // detail and the order-history list so they never show stale state.
  useEffect(() => {
    if (status === "Paid" || status === "Expired" || status === "Refunded") {
      void queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      void queryClient.invalidateQueries({ queryKey: ["orders", "list"] });
    }
  }, [status, orderId, queryClient]);

  if (order.isPending) {
    return (
      <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6" aria-busy="true">
        <LoadingSkeleton count={2} />
      </section>
    );
  }

  if (order.isError || !order.data) {
    return (
      <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <ErrorState
          error={order.error}
          title="Unable to load this order"
          description="The order may not exist, or it may belong to another account."
          onRetry={() => void order.refetch()}
        />
      </section>
    );
  }

  // The status endpoint is authoritative for payments; fall back to the
  // order's embedded payment snapshot until it resolves. `gateway` exists on
  // the status DTO; the order snapshot uses `provider`.
  const payment = paymentStatus.data ?? order.data.payment;
  const paymentGateway =
    "gateway" in payment ? (payment.gateway as string | null | undefined) : null;

  // Card gateway (Cybersource Unified Checkout): online-payment orders
  // (credit card / digital wallet) or the CYBERSOURCE gateway/provider on the
  // status DTO and order snapshot.
  const isGatewayOrder =
    order.data.payment.method === "Credit Card" ||
    order.data.payment.method === "Digital Wallet" ||
    paymentGateway === "CYBERSOURCE" ||
    (order.data.payment as { provider?: string | null }).provider === "CYBERSOURCE";
  // Fonepay QR orders: the FONEPAY gateway/provider on the status DTO or
  // order snapshot, or the advisory checkout-time gateway hint the backend
  // records in `payment.metadata.gatewayChoice`. The hint is what identifies a
  // freshly placed Fonepay order BEFORE any initiation (provider is null until
  // a payment is actually initiated), so without it the QR panel would never
  // appear for the flow the customer just picked.
  const isFonepayOrder =
    paymentGateway === "FONEPAY" ||
    (order.data.payment as { provider?: string | null }).provider === "FONEPAY" ||
    gatewayChoiceOf(order.data.payment.metadata) === "FONEPAY";
  const canRetry =
    isGatewayOrder &&
    (status === "Failed" ||
      status === "Cancelled" ||
      status === "Pending" ||
      status === "Initiated");
  const canRetryFonepay =
    isFonepayOrder &&
    (status === "Failed" ||
      status === "Cancelled" ||
      status === "Pending" ||
      status === "Initiated");

  const handleSettled = () => {
    // The backend is now authoritative — refresh the order + payment status
    // queries so the page reflects the settled state.
    void queryClient.invalidateQueries({ queryKey: ["payment-status", orderId] });
    void queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    void queryClient.invalidateQueries({ queryKey: ["orders", "list"] });
  };

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div aria-live="polite">
        {status === "Paid" ? (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-1 h-8 w-8 shrink-0 text-green-600" aria-hidden="true" />
            <div>
              <h1 className="text-display">Thank you! Payment received.</h1>
              <p className="mt-1 text-muted-foreground">Your payment was verified successfully.</p>
            </div>
          </div>
        ) : status === "Expired" ? (
          <div className="flex items-start gap-3" role="status">
            <ClockAlert className="mt-1 h-8 w-8 shrink-0 text-destructive" aria-hidden="true" />
            <div>
              <h1 className="text-display">Order expired</h1>
              <p className="mt-1 text-muted-foreground">
                This order expired before payment was completed. Any reserved stock has been
                released. If you still want these items, please place a new order.
              </p>
            </div>
          </div>
        ) : status === "Failed" ? (
          <div className="flex items-start gap-3">
            <XCircle className="mt-1 h-8 w-8 shrink-0 text-destructive" aria-hidden="true" />
            <div>
              <h1 className="text-display">Payment failed</h1>
              <p className="mt-1 text-muted-foreground">
                {payment.failureReason ??
                  "Your payment could not be completed. Your order is saved — you can retry below."}
              </p>
            </div>
          </div>
        ) : status === "Cancelled" || status === "Refunded" ? (
          <div className="flex items-start gap-3">
            <XCircle className="mt-1 h-8 w-8 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <h1 className="text-display">Payment {status.toLowerCase()}</h1>
              <p className="mt-1 text-muted-foreground">
                This payment was {status.toLowerCase()}. Contact support if this is unexpected.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <Clock className="mt-1 h-8 w-8 shrink-0 text-amber-500" aria-hidden="true" />
            <div>
              <h1 className="text-display">Order placed — payment pending</h1>
              <p className="mt-1 text-muted-foreground">
                {isGatewayOrder
                  ? "Complete your payment at the gateway. This page updates automatically once the store confirms it."
                  : `Your order has been placed. Payment method: ${payment.method}.`}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 rounded-md border p-4 text-sm">
        <h2 className="text-lg font-semibold">Order details</h2>
        <dl className="mt-3 space-y-2">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Order number</dt>
            <dd className="font-medium">{order.data.orderNumber}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Order status</dt>
            <dd className="font-medium">{order.data.status}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Payment method</dt>
            <dd className="font-medium">{payment.method}</dd>
          </div>
          {order.data.coupon ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Coupon</dt>
              <dd className="font-medium">{order.data.coupon.code}</dd>
            </div>
          ) : null}
        </dl>

        {/* Server-authoritative amounts — rendered, never computed. */}
        <dl className="mt-4 space-y-2 border-t pt-4" aria-label="Order amounts">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd>
              <Price value={order.data.amounts.subtotal} />
            </dd>
          </div>
          {order.data.amounts.discount > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Discount</dt>
              <dd>
                <Price value={-order.data.amounts.discount} />
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Shipping</dt>
            <dd>
              <Price value={order.data.amounts.shipping} />
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Tax</dt>
            <dd>
              <Price value={order.data.amounts.tax} />
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd>
              <Price value={order.data.amounts.total} />
            </dd>
          </div>
        </dl>

        <ul className="mt-4 divide-y border-t pt-2" aria-label="Items">
          {order.data.items.map((item) => (
            <li key={item.productId} className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="line-clamp-2 break-words font-medium">{item.name}</span>
                <span className="text-muted-foreground"> × {item.qty}</span>
              </span>
              <Price value={item.lineTotal} className="shrink-0" />
            </li>
          ))}
        </ul>
      </div>

      {canRetry ? (
        <div className="mt-6 rounded-md border p-4">
          <h2 className="text-sm font-medium">Complete your payment</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pay securely by card with Cybersource Unified Checkout. Retrying uses
            your existing order — a new order is never created.
          </p>
          <div className="mt-3">
            <CybersourceCheckout orderId={orderId} onSettled={handleSettled} />
          </div>
        </div>
      ) : null}

      {canRetryFonepay ? (
        <div className="mt-6 rounded-md border p-4">
          <h2 className="text-sm font-medium">Complete your payment with Fonepay QR</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Scan the QR code below with any Fonepay-supported banking app to complete your payment.
            Your order will be confirmed automatically once the payment clears.
          </p>
          <div className="mt-3">
            <FonepayQrCheckout orderId={orderId} onSettled={handleSettled} />
          </div>
        </div>
      ) : null}

      {/* Card gateway waiting notice. Fonepay orders deliberately do NOT get this
          block: the QR panel above polls the same authoritative status
          automatically and owns its own cancel/retry actions. */}
      {(status === "Pending" || status === "Initiated") && isGatewayOrder && !isFonepayOrder ? (
        <div className="mt-4 rounded-md border p-4" role="status">
          <p className="text-sm text-muted-foreground">
            {status === "Initiated"
              ? "Your payment session is active. If the payment form is not visible, refresh your payment status."
              : "We're waiting for your payment to be confirmed by the card issuer."}
          </p>
          <Button
            variant="outline"
            className="mt-2 min-h-[44px]"
            onClick={() => void paymentStatus.refetch()}
            disabled={paymentStatus.isFetching}
          >
            Refresh payment status
          </Button>
        </div>
      ) : null}

      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        <Button asChild className="min-h-[44px] w-full sm:w-auto">
          <Link to="/products">Continue shopping</Link>
        </Button>
        <Button asChild variant="outline" className="min-h-[44px] w-full sm:w-auto">
          <Link to="/cart">Back to cart</Link>
        </Button>
        <Button asChild variant="outline" className="min-h-[44px] w-full sm:w-auto">
          <Link to="/account/orders/$orderId" params={{ orderId }}>
            View your order
          </Link>
        </Button>
      </div>
    </section>
  );
}

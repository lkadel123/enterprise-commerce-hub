import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingSkeleton } from "@/components/loading/LoadingSkeleton";
import { apiErrorMessage } from "@/lib/api/client";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useCartQuery } from "@/features/cart/cart-hooks";
import { AddressStep } from "./AddressStep";
import { CheckoutStepper } from "./CheckoutStepper";
import { OrderSummary } from "./OrderSummary";
import { PaymentStep } from "./PaymentStep";
import { ReviewStep } from "./ReviewStep";
import { usePlaceOrderMutation } from "./checkout-hooks";
import type { OrderAddress, PaymentGatewayHint, PaymentMethod } from "@/types";
import type { PaymentChoice } from "./checkout-validation";

/**
 * Checkout page content (`/checkout`).
 *
 * Three-step flow: Address → Payment/Coupon → Review/Place order.
 *
 * SECURITY:
 * - The order body contains ONLY opaque fields (address strings,
 *   `paymentMethod`, `couponCode`, `notes`). Items are omitted so the server
 *   cart is the authoritative line-item source and the backend clears it on
 *   success.
 * - No financial values are computed or sent.
 * - One-shot submission guard prevents duplicate orders.
 * - Online payments settle through the two active gateways — Fonepay QR
 *   (server-rendered intent QR the customer scans) or Cybersource Unified
 *   Checkout (embedded card iframe driven by a server-created capture
 *   context). The server-authoritative verification (Fonepay Status API /
 *   Cybersource-signed response token checked against the server-side order
 *   total) settles the order. Success is never inferred client-side — the
 *   confirmation page polls `GET /customer/payments/:orderId/status` until the
 *   server settles it.
 */
export function CheckoutPage() {
  return (
    <AuthGuard>
      <CheckoutContent />
    </AuthGuard>
  );
}

function CheckoutContent() {
  const navigate = useNavigate();
  const cart = useCartQuery();
  const placeOrder = usePlaceOrderMutation();

  const [step, setStep] = useState(0);
  const [address, setAddress] = useState<OrderAddress | null>(null);
  const [choice, setChoice] = useState<PaymentChoice | null>(null);
  const [couponCode, setCouponCode] = useState<string | null>(null);

  if (cart.isPending) {
    return (
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6" aria-busy="true">
        <LoadingSkeleton count={3} />
      </section>
    );
  }

  if (cart.isError || !cart.data) {
    return (
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <ErrorState
          error={cart.error}
          title="Unable to load your cart"
          onRetry={() => void cart.refetch()}
        />
      </section>
    );
  }

  if (cart.data.items.length === 0) {
    return (
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={<ShoppingCart className="h-10 w-10" />}
          title="Your cart is empty"
          description="Add items to your cart before checking out."
          action={
            <Button asChild>
              <a href="/products">Browse products</a>
            </Button>
          }
        />
      </section>
    );
  }

  const handlePlaceOrder = (input: {
    shippingAddress: OrderAddress;
    paymentMethod: PaymentMethod;
    paymentGateway?: PaymentGatewayHint;
    couponCode?: string;
    notes?: string;
  }) => {
    placeOrder.mutate(input, {
      onSuccess: async ({ order }) => {
        toast.success(`Order ${order.orderNumber} placed.`);
        void navigate({
          to: "/order-confirmation/$orderId",
          params: { orderId: order.id },
        });
      },
      onError: (err) => {
        toast.error(apiErrorMessage(err));
      },
    });
  };

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-display">Checkout</h1>
      <div className="mt-4">
        <CheckoutStepper current={step} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          {step === 0 ? (
            <AddressStep value={address} onChange={setAddress} onContinue={() => setStep(1)} />
          ) : null}
          {step === 1 ? (
            <PaymentStep
              choice={choice}
              couponCode={couponCode}
              cartItems={cart.data.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
              }))}
              onChoiceChange={setChoice}
              onCouponChange={setCouponCode}
              onContinue={() => setStep(2)}
              onBack={() => setStep(0)}
            />
          ) : null}
          {step === 2 && address && choice ? (
            <ReviewStep
              address={address}
              choice={choice}
              couponCode={couponCode}
              submitting={placeOrder.isPending}
              onBack={() => setStep(1)}
              onPlaceOrder={handlePlaceOrder}
            />
          ) : null}
        </div>

        <OrderSummary cart={cart.data} />
      </div>
    </section>
  );
}

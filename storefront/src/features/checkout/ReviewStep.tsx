import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { focusFirstFieldError } from "@/lib/focus-field-error";
import type { OrderAddress, PaymentGatewayHint, PaymentMethod } from "@/types";
import { notesSchema, type PaymentChoice } from "@/features/checkout/checkout-validation";

interface ReviewStepProps {
  address: OrderAddress;
  choice: PaymentChoice;
  couponCode: string | null;
  submitting: boolean;
  onBack: () => void;
  onPlaceOrder: (input: {
    shippingAddress: OrderAddress;
    paymentMethod: PaymentMethod;
    paymentGateway?: PaymentGatewayHint;
    couponCode?: string;
    notes?: string;
  }) => void;
}

/** Human label for the gateway recorded on the order (advisory hint only). */
const GATEWAY_LABEL: Record<PaymentGatewayHint, string> = {
  FONEPAY: "Fonepay QR",
  CYBERSOURCE: "Card (Cybersource Unified Checkout)",
};

/**
 * Step 3 — review and place order.
 *
 * One-shot submission protection: the submit handler is a no-op while a
 * submission is already in flight (`submitting`), the button is disabled and
 * marked `aria-busy`, so a double-click can never create two orders.
 */
export function ReviewStep({
  address,
  choice,
  couponCode,
  submitting,
  onBack,
  onPlaceOrder,
}: ReviewStepProps) {
  const [notes, setNotes] = useState("");
  const [notesError, setNotesError] = useState<string | null>(null);

  const placeOrder = () => {
    if (submitting) return; // one-shot guard
    const trimmed = notes.trim();
    if (trimmed) {
      const parsed = notesSchema.safeParse(trimmed);
      if (!parsed.success) {
        setNotesError("Notes must be at most 1000 characters.");
        focusFirstFieldError(["notes"], { notes: "invalid" }, (f) => `order-${f}`);
        return;
      }
    }
    setNotesError(null);
    onPlaceOrder({
      shippingAddress: address,
      paymentMethod: choice.method,
      ...(choice.gateway ? { paymentGateway: choice.gateway } : {}),
      ...(couponCode ? { couponCode } : {}),
      ...(trimmed ? { notes: trimmed } : {}),
    });
  };

  return (
    <section aria-labelledby="review-step-heading" aria-busy={submitting}>
      <h2 id="review-step-heading" className="text-lg font-semibold">
        Review your order
      </h2>

      <dl className="mt-4 space-y-3 rounded-md border p-4 text-sm">
        <div>
          <dt className="font-medium">Ship to</dt>
          <dd className="mt-1 break-words text-muted-foreground">
            {[
              address.line1,
              address.line2,
              address.city,
              address.state,
              address.postalCode,
              address.country,
            ]
              .filter(Boolean)
              .join(", ")}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Payment</dt>
          <dd className="mt-1 text-muted-foreground">
            {choice.method}
            {choice.gateway ? ` — ${GATEWAY_LABEL[choice.gateway]}` : ""}
          </dd>
        </div>
        {couponCode ? (
          <div>
            <dt className="font-medium">Coupon</dt>
            <dd className="mt-1 text-muted-foreground">
              {couponCode} (final discount confirmed by the store)
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4">
        <Label htmlFor="order-notes">Order notes (optional)</Label>
        <textarea
          id="order-notes"
          className="mt-1 min-h-[88px] w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={notes}
          maxLength={1000}
          onChange={(e) => setNotes(e.target.value)}
          aria-invalid={notesError ? true : undefined}
          aria-describedby={notesError ? "order-notes-error" : undefined}
        />
        {notesError ? (
          <p id="order-notes-error" role="alert" className="mt-1 text-sm text-destructive">
            {notesError}
          </p>
        ) : null}
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        The final total — including shipping, taxes and any coupon discount — is computed by the
        store when your order is placed and shown on the next page.
      </p>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button variant="outline" className="min-h-[44px]" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button
          className="min-h-[44px] w-full sm:w-auto"
          onClick={placeOrder}
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? "Placing order…" : "Place order"}
        </Button>
      </div>
    </section>
  );
}

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiErrorMessage } from "@/lib/api/client";
import { useValidateCouponMutation } from "@/features/checkout/checkout-hooks";
import {
  isValidCouponCode,
  type PaymentChoice,
  type PaymentGatewayChoice,
} from "@/features/checkout/checkout-validation";
import type { CouponValidationResult } from "@/types";

interface PaymentStepProps {
  choice: PaymentChoice | null;
  couponCode: string | null;
  cartItems: { productId: string; quantity: number }[];
  onChoiceChange: (choice: PaymentChoice) => void;
  onCouponChange: (code: string | null) => void;
  onContinue: () => void;
  onBack: () => void;
}

const METHODS: {
  /** Stable React key — `id` alone repeats when one method has two gateways. */
  key: string;
  id: PaymentChoice["method"];
  gateway?: PaymentGatewayChoice;
  label: string;
  hint: string;
}[] = [
  {
    key: "COD",
    id: "Cash on Delivery",
    label: "Cash on Delivery",
    hint: "Pay in cash when your order arrives.",
  },
  {
    key: "FONEPAY_QR",
    // Fonepay QR settles from the customer's bank account, so it rides on the
    // existing "Bank Transfer" method with the FONEPAY gateway — no new
    // backend payment-method enum value is introduced.
    id: "Bank Transfer",
    gateway: "FONEPAY",
    label: "Fonepay QR",
    hint: "Scan a payment QR with any Fonepay-supported banking app.",
  },
  {
    key: "CYBERSOURCE_CARD",
    id: "Credit Card",
    // Card payments run on Cybersource Unified Checkout (embedded, PCI SAQ A):
    // the backend creates the capture context from the server-side order
    // total, the card form renders inside Cybersource's own iframe, and only
    // a Cybersource-signed, server-verified payment token can settle the
    // order.
    gateway: "CYBERSOURCE",
    label: "Credit / Debit Card",
    hint: "Pay securely by card with Cybersource Unified Checkout.",
  },
];

/**
 * Step 2 — payment method and coupon.
 *
 * The coupon check is ADVISORY only: the projected discount comes from the
 * backend validate endpoint, but the authoritative discount is computed again
 * when the order is created. No discount math happens on the client.
 */
export function PaymentStep({
  choice,
  couponCode,
  cartItems,
  onChoiceChange,
  onCouponChange,
  onContinue,
  onBack,
}: PaymentStepProps) {
  const [couponInput, setCouponInput] = useState(couponCode ?? "");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponResult, setCouponResult] = useState<CouponValidationResult | null>(null);
  const validateCoupon = useValidateCouponMutation();

  const applyCoupon = () => {
    const code = couponInput.trim();
    if (!isValidCouponCode(code)) {
      setCouponError("Enter a valid coupon code (3–50 letters, numbers, - or _).");
      return;
    }
    setCouponError(null);
    validateCoupon.mutate(
      { code, items: cartItems },
      {
        onSuccess: (response) => {
          const result = response.data;
          setCouponResult(result);
          if (result.valid) {
            onCouponChange(code.toUpperCase());
            toast.success(
              `Coupon ${code.toUpperCase()} applied — final discount confirmed at order.`,
            );
          } else {
            onCouponChange(null);
            toast.error(result.message ?? "This coupon cannot be applied.");
          }
        },
        onError: (err) => {
          setCouponResult(null);
          onCouponChange(null);
          toast.error(apiErrorMessage(err));
        },
      },
    );
  };

  const removeCoupon = () => {
    setCouponInput("");
    setCouponResult(null);
    setCouponError(null);
    onCouponChange(null);
  };

  const canContinue =
    choice !== null &&
    (choice.method === "Credit Card" || choice.method === "Digital Wallet"
      ? !!choice.gateway
      : true);

  return (
    <section aria-labelledby="payment-step-heading">
      <h2 id="payment-step-heading" className="text-lg font-semibold">
        Payment method
      </h2>

      <fieldset className="mt-4 space-y-2">
        <legend className="sr-only">Payment method</legend>
        {METHODS.map((method) => {
          const selected =
            choice?.method === method.id && (choice.gateway ?? null) === (choice?.gateway ?? null);
          return (
            <label
              key={method.key}
              className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <input
                type="radio"
                name="payment-method"
                className="mt-1 h-4 w-4"
                checked={selected}
                onChange={() =>
                  onChoiceChange(
                    method.gateway
                      ? { method: method.id, gateway: method.gateway }
                      : { method: method.id },
                  )
                }
              />
              <span className="text-sm">
                <span className="font-medium">{method.label}</span>
                <br />
                <span className="text-muted-foreground">{method.hint}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {choice?.method === "Credit Card" ? (
        <p className="mt-3 flex min-h-[44px] items-center gap-2 rounded-md border bg-muted px-3 text-sm text-muted-foreground">
          <span aria-hidden="true">💳</span>
          <span>
            Card payments are processed securely through Cybersource Unified Checkout after you
            place your order.
          </span>
        </p>
      ) : null}

      {choice?.gateway === "FONEPAY" ? (
        <p className="mt-3 flex min-h-[44px] items-center gap-2 rounded-md border bg-muted px-3 text-sm text-muted-foreground">
          <span aria-hidden="true">🔳</span>
          <span>
            After you place your order a Fonepay payment QR is shown here — scan it with any
            Fonepay-supported banking app. The store verifies the payment server-side and this page
            updates automatically.
          </span>
        </p>
      ) : null}

      <div className="mt-6 rounded-md border p-4">
        <h3 className="text-sm font-medium">Coupon code</h3>
        {couponCode && couponResult?.valid && couponResult.coupon ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-foreground">
              <span className="font-medium">{couponResult.coupon.code}</span> applied.
              {couponResult.coupon.discount !== null ? (
                <>
                  {" "}
                  Projected discount:{" "}
                  <span className="font-medium">{couponResult.coupon.discount}</span>{" "}
                  <span className="text-muted-foreground">
                    (final amount confirmed by the store when the order is placed)
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  {" "}
                  Final amount confirmed by the store when the order is placed.
                </span>
              )}
            </p>
            <Button variant="outline" size="sm" className="min-h-[44px]" onClick={removeCoupon}>
              Remove
            </Button>
          </div>
        ) : (
          <form
            className="mt-2 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              applyCoupon();
            }}
            noValidate
          >
            <div className="flex-1">
              <Label htmlFor="coupon-code" className="sr-only">
                Coupon code
              </Label>
              <Input
                id="coupon-code"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                placeholder="e.g. SAVE10"
                autoComplete="off"
                aria-invalid={couponError ? true : undefined}
                aria-describedby={couponError ? "coupon-error" : undefined}
              />
              {couponError ? (
                <p id="coupon-error" role="alert" className="mt-1 text-sm text-destructive">
                  {couponError}
                </p>
              ) : null}
            </div>
            <Button
              type="submit"
              variant="outline"
              className="min-h-[44px]"
              disabled={validateCoupon.isPending}
              aria-busy={validateCoupon.isPending}
            >
              {validateCoupon.isPending ? "Checking…" : "Apply"}
            </Button>
          </form>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Coupon discounts are verified again when your order is placed — the final total shown
          after placing the order is authoritative.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button variant="outline" className="min-h-[44px]" onClick={onBack}>
          Back
        </Button>
        <Button
          className="min-h-[44px] w-full sm:w-auto"
          disabled={!canContinue}
          onClick={onContinue}
        >
          Review order
        </Button>
      </div>
      {!canContinue ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Select a payment method
          {choice?.method === "Credit Card" ? " (card is confirmed at checkout)" : ""} to continue.
        </p>
      ) : null}
    </section>
  );
}

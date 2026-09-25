import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiErrorMessage } from "@/lib/api/client";
import {
  usePaymentGatewaysQuery,
  useValidateCouponMutation,
} from "@/features/checkout/checkout-hooks";
import { isValidCouponCode, type PaymentChoice } from "@/features/checkout/checkout-validation";
import type { CouponValidationResult, CustomerPaymentGatewayOption } from "@/types";

interface PaymentStepProps {
  choice: PaymentChoice | null;
  couponCode: string | null;
  cartItems: { productId: string; quantity: number }[];
  /**
   * Notified with the customer's selection, or `null` when a previously chosen
   * method is no longer reported as available by the backend.
   */
  onChoiceChange: (choice: PaymentChoice | null) => void;
  onCouponChange: (code: string | null) => void;
  onContinue: () => void;
  onBack: () => void;
}

/**
 * The order choice a server-reported payment option represents. The backend
 * owns the label→method mapping (`CUSTOMER_PAYMENT_GATEWAY_CATALOG`), so no
 * method/gateway pairing is decided here: "COD" settles offline and every
 * online option carries the gateway that processes it.
 */
function toPaymentChoice(option: CustomerPaymentGatewayOption): PaymentChoice {
  return option.gateway === "COD"
    ? { method: option.method }
    : { method: option.method, gateway: option.gateway };
}

/** True when `choice` is exactly the option the backend reported as `option`. */
function isSameChoice(choice: PaymentChoice | null, option: CustomerPaymentGatewayOption): boolean {
  if (!choice) return false;
  const optionGateway = option.gateway === "COD" ? null : option.gateway;
  return choice.method === option.method && (choice.gateway ?? null) === optionGateway;
}

/**
 * Step 2 — payment method and coupon.
 *
 * Payment methods are SERVER-DRIVEN (`GET /customer/payments/gateways`): only
 * options the backend reports `available: true` are rendered, so a gateway that
 * is disabled or not fully configured (Fonepay by default) is never presented
 * as payable — and enabling it on the server makes it appear without a
 * storefront deploy. A selection the backend stops reporting as available is
 * cleared rather than carried into the order.
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
  // Server-derived payment options: the provider registry (enabled + fully
  // configured) decides what is payable in this deployment, never the browser.
  const gateways = usePaymentGatewaysQuery();
  const options = gateways.data ?? [];
  // Backend contract (`getAvailableGateways`): render ONLY the options reported
  // `available: true` — an unavailable gateway is not a payment method the
  // customer may pick, so it is not offered at all.
  const availableOptions = options.filter((option) => option.available);

  // A selected method only stays selected while the backend still reports it as
  // available: a gateway can be disabled server-side between sessions, and
  // silently carrying a stale choice into the order would invite a payment that
  // can never settle.
  useEffect(() => {
    if (!choice || gateways.data === undefined) return;
    const stillAvailable = gateways.data.some(
      (option) => option.available && isSameChoice(choice, option),
    );
    if (!stillAvailable) onChoiceChange(null);
  }, [choice, gateways.data, onChoiceChange]);

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

  // Only a method the backend currently reports as available can be continued
  // with, so an unknown or unavailable selection never reaches the order.
  const canContinue = availableOptions.some((option) => isSameChoice(choice, option));

  return (
    <section aria-labelledby="payment-step-heading">
      <h2 id="payment-step-heading" className="text-lg font-semibold">
        Payment method
      </h2>

      {gateways.isPending ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Loading payment methods…
        </p>
      ) : null}

      {gateways.isError ? (
        <div className="mt-4 rounded-md border p-4">
          <p role="alert" className="text-sm text-destructive">
            Unable to load the available payment methods.
          </p>
          <Button
            variant="outline"
            className="mt-2 min-h-[44px]"
            onClick={() => void gateways.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {gateways.isSuccess ? (
        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">Payment method</legend>
          {availableOptions.map((option) => (
            <label
              key={option.gateway}
              className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <input
                type="radio"
                name="payment-method"
                className="mt-1 h-4 w-4"
                checked={isSameChoice(choice, option)}
                onChange={() => onChoiceChange(toPaymentChoice(option))}
              />
              <span className="text-sm">
                <span className="font-medium">{option.label}</span>
                <br />
                <span className="text-muted-foreground">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

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
          {gateways.isError
            ? "Payment methods could not be loaded — retry before continuing."
            : "Select an available payment method to continue."}
        </p>
      ) : null}
    </section>
  );
}

import { z } from "zod";

/**
 * Client-side Zod schemas for checkout forms.
 *
 * These MIRROR the backend validators exactly (field names, max lengths,
 * optionality) so users get instant feedback, but they are advisory only —
 * the backend re-validates everything and remains authoritative.
 *
 * Financial fields are deliberately absent: the client never sends or
 * computes prices, discounts, taxes, shipping fees or totals.
 */

/** Mirrors `createCustomerAddressSchema` (backend customer-address.validator). */
export const addressFormSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(100),
  line1: z.string().trim().min(1, "Address line 1 is required").max(255),
  line2: z.string().trim().max(255).optional(),
  city: z.string().trim().min(1, "City is required").max(100),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().min(1, "Postal code is required").max(20),
  country: z.string().trim().min(2, "Country is required").max(100),
  isDefault: z.boolean().optional(),
});

export type AddressFormValues = z.infer<typeof addressFormSchema>;

/** Mirrors the order-create inline address schema (customer-order.validator). */
export const orderAddressSchema = z.object({
  line1: z.string().trim().min(1, "Address line 1 is required").max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1, "City is required").max(100),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().trim().min(1, "Country is required").max(100),
});

/** Mirrors `validateCouponSchema` code pattern (backend customer-coupon.validator). */
export const COUPON_CODE_PATTERN = /^[A-Za-z0-9_-]{3,50}$/;

export function isValidCouponCode(code: string): boolean {
  return COUPON_CODE_PATTERN.test(code.trim());
}

/** Order notes — mirrors the backend `notes` field (≤1000 chars). */
export const notesSchema = z.string().trim().max(1000);

export type PaymentGatewayChoice = "FONEPAY" | "CYBERSOURCE";

export interface PaymentChoice {
  /** Backend `PaymentMethod` enum value sent with the order. */
  method: "Cash on Delivery" | "Bank Transfer" | "Credit Card" | "Digital Wallet";
  /**
   * Gateway used when a choice is gateway-settled:
   * - "CYBERSOURCE" — card payment via Cybersource Unified Checkout.
   * - "FONEPAY" — QR / Intent Checkout: the storefront shows a
   *   server-generated payment QR that the customer scans with any
   *   Fonepay-supported banking app.
   * The backend always re-validates the gateway and fails closed when the
   * gateway is not configured.
   */
  gateway?: PaymentGatewayChoice;
}

/**
 * Read the advisory checkout-time gateway hint the backend records on
 * `order.payment.metadata.gatewayChoice` when an order is created with a
 * `paymentGateway` (see `CreateCustomerOrderInput`).
 *
 * ADVISORY ONLY: it records which flow the customer PICKED — never that a
 * payment exists. The authoritative gateway is `payment.provider`, which the
 * backend sets only when a payment is actually initiated. Any value the
 * backend did not record as FONEPAY/CYBERSOURCE is ignored rather than trusted,
 * and callers must still treat payment status as server-owned.
 */
export function gatewayChoiceOf(
  metadata: Record<string, unknown> | undefined,
): PaymentGatewayChoice | null {
  const raw = metadata?.gatewayChoice;
  if (typeof raw !== "string") return null;
  return raw === "FONEPAY" || raw === "CYBERSOURCE" ? raw : null;
}

/** Flatten a Zod error into `{ field: message }` for inline form errors. */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

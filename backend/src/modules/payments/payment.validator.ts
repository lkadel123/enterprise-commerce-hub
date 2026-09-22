import { z } from "zod";

/** Active online gateway enum (registered providers only). */
export const ACTIVE_PAYMENT_PROVIDERS = ["CYBERSOURCE", "FONEPAY"] as const;
export type ActivePaymentProvider = (typeof ACTIVE_PAYMENT_PROVIDERS)[number];

/** Schema for initiating a payment (admin surface). */
export const initiatePaymentSchema = z.object({
  orderId: z.string().trim().min(1, "Order ID is required"),
  provider: z.enum(ACTIVE_PAYMENT_PROVIDERS).optional(),
  customerName: z.string().trim().optional(),
  customerEmail: z.string().email("Valid email is required").optional(),
  customerPhone: z.string().trim().optional(),
});

/**
 * Schema for verifying a payment callback.
 *
 * Settlement is always decided server-side: the customer path uses a
 * server-to-server lookup (ownership-scoped session reference) and gateway
 * flows re-verify through the provider API. No financial fields (amount,
 * status) are accepted from the client — those are always derived from the
 * order record and the authoritative gateway API. (F-06: the previously
 * accepted client `status` field was never used by the service and is
 * rejected outright.)
 */
export const verifyPaymentSchema = z
  .object({
    providerTransactionId: z.string().trim().min(1, "Transaction ID is required"),
    provider: z.enum(ACTIVE_PAYMENT_PROVIDERS).optional(),
    signature: z.string().trim().max(4096).optional(),
  })
  .strict();

/** Schema for checking payment status */
export const paymentStatusSchema = z.object({
  providerTransactionId: z.string().trim().min(1, "Transaction ID is required"),
});

/** Schema for setting order payment status */
export const setOrderPaymentSchema = z.object({
  paymentStatus: z.enum(["Paid", "Failed", "Cancelled"]),
  transactionId: z.string().trim().optional(),
});

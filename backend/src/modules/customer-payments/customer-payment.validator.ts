import { z } from "zod";
import { objectIdSchema } from "../../utils/zod.js";
import { CUSTOMER_PAYMENT_GATEWAYS } from "./customer-payment.types.js";

/**
 * Path parameter shared by all customer-payment endpoints.
 * Only a well-formed ObjectId is accepted.
 */
export const customerPaymentParamsSchema = z.object({
  orderId: objectIdSchema,
});

/**
 * Initiation input.
 *
 * `.strict()` deliberately rejects every unrecognised field — including any
 * financial value (amount, price, subtotal, discount, shipping, tax, total).
 * The payable amount is derived exclusively from the server-side Order record.
 */
export const customerPaymentInitiateSchema = z
  .object({
    gateway: z.enum(CUSTOMER_PAYMENT_GATEWAYS),
  })
  .strict();

/**
 * Verification input (authenticated customer).
 *
 * `.strict()` rejects any tampered payload carrying a financial field. The
 * reference must match the gateway session stored at initiation, and the
 * provider-confirmed amount is compared to the server-side order total in
 * minor units. No client-supplied value is ever trusted as the payable amount.
 */
export const customerPaymentVerifySchema = z
  .object({
    gateway: z.enum(CUSTOMER_PAYMENT_GATEWAYS),
    providerTransactionId: z.string().trim().min(1, "Transaction ID is required").max(200),
    /**
     * Cybersource Unified Checkout ONLY: the Cybersource-signed payment
     * response token (JWT) returned by the Unified Checkout SDK. Opaque —
     * it is verified server-side against Cybersource's public keys and
     * bound to the stored merchant reference. No other gateway accepts it,
     * and no financial value is ever carried in it.
     */
    responseToken: z.string().trim().min(1).max(8192).optional(),
  })
  .strict();

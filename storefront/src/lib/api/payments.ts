import { apiFetch } from "./client";
import type { ApiEnvelope, CustomerPaymentResult } from "@/types";

/**
 * Customer payments API client.
 *
 * Mirrors the backend `customer-payments` module mounted at
 * `/api/v1/customer/payments` (see
 * `backend/src/modules/customer-payments/customer-payment.routes.ts`).
 *
 * SECURITY: bodies contain ONLY `{gateway}` / `{gateway, providerTransactionId}`.
 * The payment amount is always the server-side order total — never a client
 * value. CYBERSOURCE uses Unified Checkout: the server returns a capture
 * context (`payment.clientToken`), the browser renders the Cybersource-hosted
 * iframe, and success comes exclusively from server-side verification of the
 * signed response JWT. Fonepay QR follows the same rule: the server returns a
 * display-only QR image and the payment only settles after the backend
 * re-checks the Fonepay Status API. No gateway callback endpoint is exposed
 * here, and no gateway credentials, private keys or access tokens are ever
 * handled by the frontend.
 */
/**
 * Gateways usable on the customer payment surface (backend re-validates):
 * - "CYBERSOURCE" — Unified Checkout card payment (capture context + verify).
 * - "FONEPAY" — QR / Intent Checkout; the response carries `payment.qrImage`.
 */
export type CustomerPaymentGatewayValue = "CYBERSOURCE" | "FONEPAY";

export const customerPaymentsApi = {
  /**
   * POST /customer/payments/:orderId/initiate
   * Returns a `CustomerPaymentResult`. For "CYBERSOURCE" the `clientToken` is
   * the one-time Unified Checkout capture context; for "FONEPAY" `payment.qrImage`
   * is the display-only QR (data URL). All session data is
   * server-created — never constructed client-side. The payment amount is
   * always the server order total.
   */
  initiate(
    orderId: string,
    gateway: CustomerPaymentGatewayValue,
  ): Promise<ApiEnvelope<CustomerPaymentResult>> {
    return apiFetch<ApiEnvelope<CustomerPaymentResult>>(
      `/customer/payments/${encodeURIComponent(orderId)}/initiate`,
      { method: "POST", body: { gateway } },
    );
  },

  /**
   * POST /customer/payments/:orderId/verify
   * Server-side verification of the gateway transaction against the stored
   * session. The response is the authoritative payment state. For
   * CYBERSOURCE, `providerTransactionId` is the Cybersource response payload
   * reference bound at initiation — never a client-decided status.
   */
  verify(
    orderId: string,
    body: {
      gateway: CustomerPaymentGatewayValue;
      providerTransactionId: string;
      /**
       * Cybersource ONLY: the Cybersource-signed payment response token
       * (JWT) produced by the Unified Checkout SDK after the customer pays.
       * Opaque — the backend verifies it against Cybersource's public keys
       * and binds it to the stored merchant reference before settlement.
       */
      responseToken?: string;
    },
  ): Promise<ApiEnvelope<CustomerPaymentResult>> {
    return apiFetch<ApiEnvelope<CustomerPaymentResult>>(
      `/customer/payments/${encodeURIComponent(orderId)}/verify`,
      { method: "POST", body },
    );
  },

  /** GET /customer/payments/:orderId/status — authoritative current status. */
  getStatus(orderId: string): Promise<ApiEnvelope<{ payment: CustomerPaymentResult["payment"] }>> {
    return apiFetch(`/customer/payments/${encodeURIComponent(orderId)}/status`);
  },

  /**
   * POST /customer/payments/:orderId/cancel
   * Cancel a pending payment attempt (Pending/Initiated → Cancelled).
   */
  cancel(orderId: string): Promise<ApiEnvelope<CustomerPaymentResult>> {
    return apiFetch<ApiEnvelope<CustomerPaymentResult>>(
      `/customer/payments/${encodeURIComponent(orderId)}/cancel`,
      { method: "POST" },
    );
  },
};

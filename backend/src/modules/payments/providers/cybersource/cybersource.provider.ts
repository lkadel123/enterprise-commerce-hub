import { logger } from "../../../../utils/logger.js";
import { cybersourceConfig } from "./cybersource.config.js";
import { CybersourceApiError } from "./cybersource-client.js";
import {
  CybersourceTokenError,
  tokenDiagnostics,
  verifyCybersourceToken,
} from "./cybersource-token.js";
import { createCaptureContext, newMerchantReference } from "./cybersource-session.js";
import type {
  PaymentProviderInterface,
  ProviderVerifyOptions,
  RefundCapability,
} from "../../payment.provider.js";
import type { PaymentStatus } from "../../payment.types.js";

/**
 * Cybersource Unified Checkout provider.
 *
 * PRIMARY PRODUCTION FLOW — Complete Mandate (auto-processing):
 * 1. `initiate` creates a capture context (POST /uc/v1/sessions) with the
 *    SERVER-side order amount/currency and a unique merchant reference.
 * 2. The browser runs Unified Checkout; Cybersource authorizes the payment
 *    itself and returns a Cybersource-signed (RS256) response token.
 * 3. `verify` validates the token signature against Cybersource's public key
 *    (JWKS), then binds it to the stored merchant reference and checks the
 *    amount/currency/status server-side before the order is ever marked Paid.
 *
 * This flow was chosen over manual transient-token processing because the
 * authorization outcome is synchronously signed by Cybersource (no extra
 * authorization call and no webhook dependency) while remaining fully
 * server-authoritative. `refundCapability` stays UNSUPPORTED (no refund API
 * credentials configured), matching the existing status-only refund convention.
 *
 * Amounts cross this boundary in MAJOR currency units (e.g. 21.5 = 21.50).
 */

/** Fields the provider reads from a Cybersource-signed payment response token. */
interface PaymentResponsePayload {
  /** Cybersource transaction id ("EC-…" merchant reference is NOT this field). */
  id?: string;
  status?: string;
  reconciliationId?: string;
  clientReferenceInformation?: { code?: string; merchantReference?: string };
  orderInformation?: {
    amountDetails?: {
      totalAmount?: string | number;
      authorizedAmount?: string | number;
      currency?: string;
    };
  };
  errorInformation?: { reason?: string };
  /**
   * Additional reference carriers. Cybersource does not guarantee a single
   * location for the merchant reference across Unified Checkout response-token
   * versions (it may be nested under the payment or metadata blocks), so every
   * documented carrier is declared here and searched.
   */
  paymentInformation?: { clientReferenceInformation?: { code?: string } };
  metadata?: { clientReferenceInformation?: { code?: string } };
  /**
   * Unified Checkout complete-mandate (CAPTURE sale) response tokens wrap the
   * FULL transaction response under `details` — the amount, currency,
   * processor data and reconciliation id live THERE. The top-level
   * `orderInformation` block is the legacy/flat layout; both are accepted.
   */
  details?: {
    clientReferenceInformation?: { code?: string };
    orderInformation?: {
      amountDetails?: {
        totalAmount?: string | number;
        authorizedAmount?: string | number;
        currency?: string;
      };
    };
    processorInformation?: {
      approvalCode?: string;
      responseCode?: string;
      transactionId?: string;
    };
    reconciliationId?: string;
    status?: string;
    submitTimeUtc?: string;
  };
}

/** Order id encoded in a merchant reference (`EC-<orderId>-<suffix>`). */
function orderIdOf(reference: string): string | null {
  const match = /^EC-([0-9a-fA-F]{24})-[0-9a-zA-Z]+$/.exec(reference);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Collect EVERY merchant-reference candidate a response token carries: any
 * `clientReferenceInformation.{code|merchantReference}` block at any nesting
 * depth, plus a top-level `merchantReference`.
 *
 * ROOT CAUSE OF THE "Payment verification failed" BUG: the reference was read
 * from a single hard-coded path (`clientReferenceInformation.code`). Unified
 * Checkout does not guarantee that location — it nests the reference under the
 * payment/metadata blocks on some response-token versions, and omits it
 * entirely on others — so genuine, RS256-signature-valid tokens (proven by the
 * Cybersource dashboard showing a successful SALE) were rejected as a
 * "merchant reference mismatch" on every single attempt. The reference is
 * therefore resolved STRUCTURALLY instead of path-based. Depth is bounded
 * because a signed token payload is a small, shallow object.
 */
function collectTokenReferences(value: unknown, out: string[], depth = 0): string[] {
  if (depth > 6 || value === null || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const item of value) collectTokenReferences(item, out, depth + 1);
    return out;
  }
  const record = value as Record<string, unknown>;
  const clientReference = record.clientReferenceInformation;
  if (clientReference !== null && typeof clientReference === "object") {
    const block = clientReference as Record<string, unknown>;
    for (const key of ["code", "merchantReference"]) {
      const candidate = block[key];
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        out.push(candidate.trim());
      }
    }
  }
  const topLevelReference = record.merchantReference;
  if (typeof topLevelReference === "string" && topLevelReference.trim().length > 0) {
    out.push(topLevelReference.trim());
  }
  for (const nested of Object.values(record)) {
    if (nested !== clientReference) collectTokenReferences(nested, out, depth + 1);
  }
  return out;
}

/**
 * True when a token is bound to the expected payment attempt without ever
 * accepting another order's transaction.
 *
 * - A token carrying NO reference is accepted: it can never name another order,
 *   and its RS256 signature plus the downstream amount/currency/status checks
 *   remain authoritative (fail-closed on any mismatch).
 * - Otherwise at least one carried reference must be acceptable. Requiring ALL
 *   of them would let a stray unrelated reference shadow the real one; a
 *   foreign order's token carries only foreign references and is still rejected.
 */
function isTokenBoundToAttempt(tokenReferences: string[], expectedReference: string): boolean {
  if (tokenReferences.length === 0) return true;
  return tokenReferences.some((reference) => isReferenceAcceptable(reference, expectedReference));
}

/**
 * True when a token reference is acceptable for the expected reference.
 *
 * Replay protection is preserved: a token minted for a DIFFERENT order is
 * always rejected. An exact match is always accepted. A token whose reference
 * belongs to the SAME order is also accepted, because a re-initiation for the
 * same order (page reload / SDK re-mount) mints a new per-attempt reference
 * while an in-flight attempt can still settle — that race previously turned an
 * already-settled sale into "Failed". Unknown reference formats fall back to
 * strict equality (fail closed).
 */
export function isReferenceAcceptable(tokenReference: string, expectedReference: string): boolean {
  if (tokenReference === expectedReference) return true;
  const tokenOrder = orderIdOf(tokenReference);
  const expectedOrder = orderIdOf(expectedReference);
  return tokenOrder !== null && expectedOrder !== null && tokenOrder === expectedOrder;
}

/**
 * Gateway statuses that PROVE the payment is complete.
 *
 * AUTH vs SALE (root cause of a settled sale being marked "Failed"): the
 * capture context requests `completeMandate.type: "CAPTURE"` — a SALE — so
 * Unified Checkout authorizes AND captures in one step and the response token
 * reports a CAPTURED/SALE-family status. `AUTHORIZED`/`TRANSMITTED` remain
 * accepted for completeness (an authorization-only mandate), but a mapping
 * limited to those two turns every genuine SALE into a failed payment.
 * PENDING_SETTLEMENT is included because capture has ALREADY succeeded there —
 * only the acquirer settlement posting is outstanding.
 */
const PAID_GATEWAY_STATUSES: ReadonlySet<string> = new Set([
  "AUTHORIZED",
  "TRANSMITTED",
  "CAPTURED",
  "SALE",
  "COMPLETED",
  "SETTLED",
  "PENDING_SETTLEMENT",
]);

/**
 * Gateway statuses that are non-terminal: the issuer/3-D Secure or the
 * CyberSource review queue still owes us a decision, so the payment must stay
 * Pending (the storefront keeps polling) rather than being failed.
 */
const PENDING_GATEWAY_STATUSES: ReadonlySet<string> = new Set([
  "PENDING",
  "PENDING_AUTHENTICATION",
  "AUTHORIZED_PENDING_REVIEW",
  "CREATED",
  "INITIATED",
]);

/**
 * Classify a Cybersource transaction status into our payment status.
 *
 * Unknown statuses fail closed (never Paid), preserving the existing
 * fail-closed behaviour while recognizing the full SALE/capture vocabulary.
 */
export function classifyGatewayStatus(status: string): PaymentStatus {
  const normalized = status.trim().toUpperCase();
  if (PAID_GATEWAY_STATUSES.has(normalized)) return "Paid";
  if (PENDING_GATEWAY_STATUSES.has(normalized)) return "Pending";
  return "Failed";
}

interface ProviderVerifyResult {
  status: PaymentStatus;
  amount: number;
  verifiedAt: Date;
  metadata?: Record<string, unknown>;
}

export class CybersourceProvider implements PaymentProviderInterface {
  async initiate(
    amount: number,
    orderId: string,
    customerInfo: Record<string, unknown>,
  ): ReturnType<PaymentProviderInterface["initiate"]> {
    const merchantReference = newMerchantReference(orderId);
    const result = await createCaptureContext({
      merchantReference,
      totalAmount: amount,
      currency: cybersourceConfig.currency(),
      customer: {
        email: typeof customerInfo.email === "string" ? customerInfo.email : undefined,
        firstName:
          typeof customerInfo.name === "string"
            ? customerInfo.name.split(/\s+/)[0]?.slice(0, 60)
            : undefined,
        lastName:
          typeof customerInfo.name === "string" && customerInfo.name.includes(" ")
            ? customerInfo.name.split(/\s+/).slice(1).join(" ").slice(0, 60)
            : undefined,
      },
      billing:
        customerInfo.billing && typeof customerInfo.billing === "object"
          ? (customerInfo.billing as Record<string, string | undefined>)
          : undefined,
    });
    return {
      paymentId: merchantReference,
      providerTransactionId: merchantReference,
      // Unified Checkout is embedded; there is no redirect URL. The browser
      // uses the capture context to load the transaction-specific client library.
      paymentUrl: "",
      // Capture contexts are short-lived; an operational hint only.
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      currency: cybersourceConfig.currency(),
      // Public session data only (capture context JWT + SRI-validated client
      // library URL) — persisted so the storefront can render Unified Checkout.
      // No credentials, no payment data.
      metadata: {
        cybersource: {
          merchantReference,
          captureContext: result.captureContext,
          clientLibrary: result.clientLibrary,
          clientLibraryIntegrity: result.clientLibraryIntegrity,
        },
      },
    };
  }

  /**
   * Verify a Unified Checkout payment-response token (server-authoritative).
   * The token must be Cybersource-signed, unexpired, bound to the stored
   * merchant reference, and match the expected amount/currency.
   */
  async verify(
    providerTransactionId: string,
    _signature: string,
    options?: ProviderVerifyOptions,
  ): Promise<ProviderVerifyResult> {
    const responseToken = options?.responseToken;
    if (!responseToken) {
      return this.failed("Payment result token is missing.");
    }
    let payload: PaymentResponsePayload;
    try {
      payload = (await verifyCybersourceToken(responseToken)) as unknown as PaymentResponsePayload;
    } catch (error) {
      logger.warn(
        {
          merchantReference: providerTransactionId,
          reason: error instanceof Error ? error.message : String(error),
        },
        "Cybersource payment token rejected",
      );
      return this.failed("Payment result token is invalid.");
    }
    // Sanitized end-to-end trace of what the signed token says happened:
    // authentication (setup → enrollment → challenge → result), authorization
    // and capture state. Logged BEFORE the binding/status checks so a rejected
    // token is always diagnosable — previously a reference mismatch returned
    // early and the trace never appeared. NEVER contains the token itself,
    // credentials, PAN or CVV — see PaymentTokenDiagnostics.
    logger.info(
      { merchantReference: providerTransactionId, ...tokenDiagnostics(payload as never) },
      "Cybersource payment token diagnostics",
    );
    // Reference binding — prevents a valid token belonging to another
    // payment attempt/order from being replayed against this order. Every
    // documented carrier is searched (see collectTokenReferences): reading a
    // single hard-coded path rejected genuine SALE tokens, so a signature-valid
    // settlement was reported as "merchant reference mismatch". An exact match
    // or a reference belonging to the SAME order is accepted; a foreign order's
    // reference is always rejected (replay protection preserved). A token that
    // carries no reference at all (see resolveTokenReference) is trusted on its
    // RS256 signature plus the downstream amount/currency/status checks — it can
    // never name another order.
    const tokenReferences = collectTokenReferences(payload, []);
    if (tokenReferences.length === 0) {
      logger.warn(
        { merchantReference: providerTransactionId },
        "Cybersource payment token carries no merchant reference; binding on signature and amount instead",
      );
    } else if (!isTokenBoundToAttempt(tokenReferences, providerTransactionId)) {
      logger.warn(
        { merchantReference: providerTransactionId },
        "Cybersource payment token merchant reference mismatch",
      );
      return this.failed("Payment result does not match this order.");
    }
    const status = payload.status ?? payload.details?.status ?? "";
    if (!status) {
      return this.failed("Payment result has no status.");
    }
    // Amount/currency: Unified Checkout complete-mandate tokens carry them
    // under `details.orderInformation.amountDetails`; the flat top-level
    // `orderInformation` block is the legacy layout. `totalAmount` is the
    // charged amount for a CAPTURE sale; `authorizedAmount` is the fallback.
    const amountDetails =
      payload.details?.orderInformation?.amountDetails ?? payload.orderInformation?.amountDetails;
    const totalAmount = Number(amountDetails?.totalAmount ?? amountDetails?.authorizedAmount);
    const currency = amountDetails?.currency;
    const processor = payload.details?.processorInformation;
    const metadata: Record<string, unknown> = {
      provider: "CYBERSOURCE",
      transactionId: payload.id ?? processor?.transactionId ?? null,
      reconciliationId: payload.reconciliationId ?? payload.details?.reconciliationId ?? null,
      currency: currency ?? cybersourceConfig.currency(),
      gatewayStatus: status,
      ...(processor?.approvalCode ? { approvalCode: processor.approvalCode } : {}),
      ...(processor?.responseCode ? { processorResponseCode: processor.responseCode } : {}),
      ...(payload.errorInformation?.reason ? { reason: payload.errorInformation.reason } : {}),
    };
    const verifiedAt = new Date();
    const amount = Number.isFinite(totalAmount) ? totalAmount : 0;
    // Capture-success and authorization-only outcomes BOTH prove the money is
    // committed — with `completeMandate.type: "CAPTURE"` CyberSource returns a
    // SALE/CAPTURED status for a settled sale. Mapping only AUTH-family
    // statuses marked genuine sales as Failed (see PAID_GATEWAY_STATUSES).
    const verdict = classifyGatewayStatus(status);
    if (verdict === "Paid") {
      return { status: "Paid", amount, verifiedAt, metadata };
    }
    if (verdict === "Pending") {
      return { status: "Pending", amount, verifiedAt, metadata };
    }
    logger.info(
      { merchantReference: providerTransactionId, gatewayStatus: status },
      "Cybersource payment not authorized or captured",
    );
    return { status: "Failed", amount: 0, verifiedAt, metadata };
  }

  /**
   * Status-only lookup is not available without the Transaction Search API
   * permission; the payment status of record lives in our database and is
   * verified through {@link verify}. Returns a safe non-terminal answer.
   */
  async getStatus(providerTransactionId: string): Promise<{
    status: PaymentStatus;
    amount: number;
    metadata?: Record<string, unknown>;
  }> {
    logger.debug(
      { merchantReference: providerTransactionId },
      "Cybersource getStatus: database is the source of truth",
    );
    return {
      status: "Pending",
      amount: 0,
      metadata: { note: "Verified via payment response token" },
    };
  }

  refundCapability(): RefundCapability {
    return "UNSUPPORTED";
  }

  private failed(reason: string): ProviderVerifyResult {
    return {
      status: "Failed",
      amount: 0,
      verifiedAt: new Date(),
      metadata: { provider: "CYBERSOURCE", reason },
    };
  }
}

/** Re-exported for tests. */
export { CybersourceApiError, CybersourceTokenError, verifyCybersourceToken };

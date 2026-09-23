import { randomUUID } from "node:crypto";
import { logger } from "../../../../utils/logger.js";
import { cybersourceConfig } from "./cybersource.config.js";
import { cybersourceRequest } from "./cybersource-client.js";
import {
  CybersourceTokenError,
  decodeJwtPayload,
  extractClientLibrary,
} from "./cybersource-token.js";
/** Formats a server-side amount with exactly two decimals for the gateway. */
export function formatAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RangeError("Payment amount must be a positive finite number.");
  }
  return amount.toFixed(2);
}
/**
 * Map legacy payment type names to the current Unified Checkout enum.
 * "CARD" (manual card entry) is now "PANENTRY"; other values pass through
 * (GOOGLEPAY, APPLEPAY, CLICKTOPAY, … are unchanged).
 */
function toCurrentPaymentType(paymentType: string): string {
  return paymentType.toUpperCase() === "CARD" ? "PANENTRY" : paymentType.toUpperCase();
}
/**
 * Normalize a country to ISO 3166-1 alpha-2, as REQUIRED by the Cybersource
 * billTo.country field (a full country name is rejected with HTTP 400
 * MAX_LENGTH). Known names map to their ISO code; anything that is not a
 * 2-letter code and not in the map is omitted (undefined) so an invalid value
 * never reaches the gateway.
 */
const COUNTRY_NAME_TO_ISO = {
  nepal: "NP",
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  "united kingdom": "GB",
  canada: "CA",
  australia: "AU",
  germany: "DE",
  france: "FR",
  netherlands: "NL",
  india: "IN",
  japan: "JP",
  china: "CN",
  singapore: "SG",
  "hong kong": "HK",
  "new zealand": "NZ",
  spain: "ES",
  italy: "IT",
  brazil: "BR",
  "south korea": "KR",
  korea: "KR",
  "united arab emirates": "AE",
  "saudi arabia": "SA",
  qatar: "QA",
  bangladesh: "BD",
  "sri lanka": "LK",
  thailand: "TH",
  malaysia: "MY",
  indonesia: "ID",
  philippines: "PH",
  vietnam: "VN",
  switzerland: "CH",
  austria: "AT",
  belgium: "BE",
  ireland: "IE",
  portugal: "PT",
  sweden: "SE",
  norway: "NO",
  denmark: "DK",
  finland: "FI",
  poland: "PL",
  mexico: "MX",
  argentina: "AR",
  "south africa": "ZA",
  nigeria: "NG",
  kenya: "KE",
  egypt: "EG",
  turkey: "TR",
};
/** Returns an ISO-3166 alpha-2 country code, or undefined when unmappable. */
export function toIsoCountry(country: string | null | undefined): string | undefined {
  if (!country) return undefined;
  const trimmed = country.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(trimmed)) return trimmed;
  return COUNTRY_NAME_TO_ISO[trimmed.toLowerCase() as keyof typeof COUNTRY_NAME_TO_ISO];
}
/** Bill-to block accepted by the Unified Checkout Sessions API (all optional). */
export interface CaptureContextBillTo {
  address1?: string;
  address2?: string;
  locality?: string;
  administrativeArea?: string;
  postalCode?: string;
  country?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

/** Server-authoritative input for building a capture-context request. */
export interface CybersourceCaptureContextInput {
  /** Opaque per-attempt merchant reference (replay protection binding). */
  merchantReference: string;
  /** Authoritative order total in MAJOR currency units (never client-supplied). */
  totalAmount: number;
  /** ISO 4217 currency, e.g. "USD". */
  currency: string;
  billing?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  customer?: {
    email?: string;
    firstName?: string;
    lastName?: string;
  };
}

/** Public session data the browser needs to render Unified Checkout. */
export interface CybersourceCaptureContext {
  captureContext: string;
  clientLibrary: string;
  clientLibraryIntegrity: string;
}

/** Builds the capture-context request body from server-authoritative data. */
export function buildCaptureContextRequest(input: CybersourceCaptureContextInput) {
  const billTo: CaptureContextBillTo = {};
  if (input.billing?.line1) billTo.address1 = input.billing.line1;
  if (input.billing?.line2) billTo.address2 = input.billing.line2;
  if (input.billing?.city) billTo.locality = input.billing.city;
  if (input.billing?.state) billTo.administrativeArea = input.billing.state;
  if (input.billing?.postalCode) billTo.postalCode = input.billing.postalCode;
  if (input.billing?.country) {
    const isoCountry = toIsoCountry(input.billing.country);
    if (isoCountry) {
      billTo.country = isoCountry;
    } else {
      // Never send a non-ISO value (the sessions API rejects it with 400
      // MAX_LENGTH); omit the field and surface the gap in logs instead.
      logger.warn(
        { merchantReference: input.merchantReference, country: input.billing.country },
        "Cybersource billTo.country omitted: not an ISO-3166 alpha-2 code or known country name.",
      );
    }
  }
  if (input.customer?.email) billTo.email = input.customer.email;
  if (input.customer?.firstName) billTo.firstName = input.customer.firstName.slice(0, 60);
  if (input.customer?.lastName) billTo.lastName = input.customer.lastName.slice(0, 60);
  const targetOrigins = cybersourceConfig.targetOrigins();
  if (targetOrigins.some((origin) => !origin.startsWith("https:"))) {
    // The Unified Checkout sessions API REJECTS non-HTTPS target origins
    // ("Origin must use HTTPS protocol"). Surfaced as a warning so a missing
    // TLS deployment shows up in logs instead of only as a generic 503.
    logger.warn(
      { targetOrigins },
      "Cybersource target origins contain non-HTTPS values; the sessions API requires HTTPS origins.",
    );
  }
  const request = {
    targetOrigins,
    clientVersion: cybersourceConfig.clientVersion(),
    allowedCardNetworks: cybersourceConfig.allowedCardNetworks(),
    allowedPaymentTypes: cybersourceConfig.allowedPaymentTypes().map(toCurrentPaymentType),
    country: cybersourceConfig.country(),
    locale: cybersourceConfig.locale(),
    captureMandate: {
      billingType: "FULL",
      requestEmail: true,
      requestPhone: false,
      requestShipping: false,
      showAcceptedNetworkIcons: true,
    },
    // SALE mandate: CyberSource requires authorize AND capture, not
    // authorization-only. `completeMandate.type: "CAPTURE"` makes Unified
    // Checkout authorize and capture in a single step, so the response
    // token reports a settled SALE and NO separate capture API call is
    // needed. "AUTH" would leave the transaction unsettled.
    // `decisionManager` behaviour is intentionally unchanged.
    ...(cybersourceConfig.completeMandateEnabled()
      ? { completeMandate: { type: "CAPTURE", decisionManager: false } }
      : {}),
  };
  return {
    ...request,
    /**
     * Transaction-specific data — REQUIRED `data` wrapper in the current
     * sessions schema. The merchant reference is echoed into the
     * Cybersource-signed payment response token — the server-side
     * verification binds the token to the stored reference (replay
     * protection) using this field.
     */
    data: {
      clientReferenceInformation: { code: input.merchantReference },
      orderInformation: {
        amountDetails: {
          totalAmount: formatAmount(input.totalAmount),
          currency: input.currency.toUpperCase(),
        },
        ...(Object.keys(billTo).length > 0 ? { billTo } : {}),
      },
    },
  };
}
/** Creates a capture context and returns it with its client-library info. */
export async function createCaptureContext(
  input: CybersourceCaptureContextInput,
): Promise<CybersourceCaptureContext> {
  const request = buildCaptureContextRequest(input);
  logger.info(
    {
      merchantReference: input.merchantReference,
      currency: request.data.orderInformation.amountDetails.currency,
    },
    "Creating Cybersource capture context",
  );
  const response: unknown = await cybersourceRequest("POST", "/uc/v1/sessions", request);
  let captureContext: string | undefined;
  if (typeof response === "string") {
    captureContext = response.replace(/^"|"$/g, "");
  } else if (response && typeof response === "object") {
    const candidate = response as { token?: unknown; captureContext?: unknown };
    if (typeof candidate.token === "string") {
      captureContext = candidate.token;
    } else if (typeof candidate.captureContext === "string") {
      captureContext = candidate.captureContext;
    }
  }
  if (!captureContext || captureContext.split(".").length !== 3) {
    logger.error(
      { merchantReference: input.merchantReference },
      "Cybersource session response malformed",
    );
    throw new CybersourceTokenError(
      "Cybersource session response did not contain a capture context.",
    );
  }
  // The capture context was just obtained server-to-server; decoding (without
  // verification) only extracts the public session data the browser needs.
  let clientLibrary;
  let clientLibraryIntegrity;
  try {
    const payload = decodeJwtPayload(captureContext);
    ({ clientLibrary, clientLibraryIntegrity } = extractClientLibrary(payload));
  } catch (error) {
    logger.error(
      { merchantReference: input.merchantReference, error },
      "Capture context client library extraction failed",
    );
    throw error;
  }
  logger.info(
    { merchantReference: input.merchantReference },
    "Cybersource capture context created",
  );
  return { captureContext, clientLibrary, clientLibraryIntegrity };
}
/** Generates a unique, opaque merchant reference for one payment attempt. */
export function newMerchantReference(orderId: string): string {
  // Order id keeps support/debugging easy; the UUID suffix prevents replay of
  // a previous attempt's capture context against the same order.
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
  return `EC-${orderId}-${suffix}`;
}

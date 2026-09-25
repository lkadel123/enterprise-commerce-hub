import { z } from "zod";

/**
 * Fonepay API request/response shapes, validated with Zod (never blindly trust
 * provider JSON). Mirrors the supplied "Checkout Intent Flow V1.10" document
 * and the "Intent API collection" Postman collection.
 *
 * SECURITY: these schemas describe PROVIDER responses only. Nothing here is
 * ever sent to the browser verbatim — the customer DTO projection decides what
 * is safe.
 */

/* --------------------------------- Login ---------------------------------- */

/** The login `accessToken` may already carry the "Bearer " prefix (documented sample does). */
export const fonepayLoginResponseSchema = z
  .object({
    username: z.string().optional(),
    accessToken: z.string().min(1),
    refreshToken: z.string().optional(),
    tokenType: z.string().optional(),
    expiresIn: z.coerce.number().positive().optional(),
  })
  .passthrough();

export type FonepayLoginResponse = z.infer<typeof fonepayLoginResponseSchema>;

/* -------------------------------- Bank list ------------------------------- */

export const fonepayBankSchema = z.object({
  bankName: z.string(),
  bankCode: z.string(),
  bankIcon: z.string().optional(),
  packageName: z.string().optional(),
  intentScheme: z.string().optional(),
});

export const fonepayBankListResponseSchema = z.object({
  bankDetails: z.array(fonepayBankSchema),
});

export type FonepayBank = z.infer<typeof fonepayBankSchema>;
export type FonepayBankListResponse = z.infer<typeof fonepayBankListResponseSchema>;

/* ------------------------------ Intent QR --------------------------------- */

export const fonepayIntentQrRequestSchema = z.object({
  /** Decimal rupees, 1..9,999,999 (validated further in fonepay.config). */
  amount: z.number(),
  billId: z.string().min(1),
  terminalId: z.string().min(1).max(16),
  paymentMode: z.literal("QR"),
  referenceLabel: z.string().regex(/^[a-zA-Z0-9]{1,30}$/),
  qrType: z.literal("INTENT_QR"),
});

/**
 * `POST /api/merchant/third-party/v2/generate-intent-qr` response — the
 * documented SUCCESS body.
 *
 * Verified contract: a TOP-LEVEL JSON object (there is no `data`/`result`
 * envelope), carrying the documented fields
 * `qrString · qrDisplayName · status · terminalId · prn · qrMessage ·
 * terminalName · websocketId · location · fonepayPanNumber`.
 *
 * STRICTNESS: `qrString` is the only field that carries the payable payload, so
 * it is REQUIRED and must be non-empty — a body without it is never a usable QR,
 * whatever `status` claims. The remaining documented fields are display/
 * diagnostic data and stay optional, and unknown extra fields are tolerated so a
 * provider-side addition cannot break checkout.
 *
 * Application-level failures (HTTP 200 carrying `message`/`error`/`qrMessage`
 * and no QR payload) are recognized BEFORE this schema by
 * `describeFonepayApplicationFailure` and surfaced as provider errors, so a body
 * that reaches this schema and fails is a genuine contract violation.
 */
export const fonepayIntentQrResponseSchema = z
  .object({
    /**
     * The payable payload — the ONLY field that makes a QR usable. Required and
     * non-blank: `trim()` first so a whitespace-only body fails as `too_small`
     * instead of producing a QR the customer cannot scan.
     */
    qrString: z.string().trim().min(1),
    qrDisplayName: z.string().optional(),
    status: z.string().optional(),
    terminalId: z.union([z.string(), z.number()]).optional(),
    prn: z.string().optional(),
    qrMessage: z.string().optional(),
    terminalName: z.string().optional(),
    /** Documented (`websocketId`) URL of the per-QR notification socket. */
    websocketId: z.string().optional(),
    location: z.string().optional(),
    /** Documented Fonepay PAN of the merchant terminal (display only). */
    fonepayPanNumber: z.string().optional(),
  })
  .passthrough();

export type FonepayIntentQrRequest = z.infer<typeof fonepayIntentQrRequestSchema>;
export type FonepayIntentQrResponse = z.infer<typeof fonepayIntentQrResponseSchema>;

/* ------------------------------ Payment status ----------------------------- */

export const fonepayStatusRequestSchema = z.object({
  terminalId: z.string().min(1).max(16),
  referenceLabel: z.string().regex(/^[a-zA-Z0-9]{1,30}$/),
});

export const fonepayStatusResponseSchema = z
  .object({
    prn: z.string(),
    merchantCode: z.string(),
    paymentStatus: z.string(),
    fonepayTraceId: z.union([z.number(), z.string()]).optional(),
    requestedAmount: z.union([z.string(), z.number()]).optional(),
    totalTransactionAmount: z.union([z.string(), z.number()]).optional(),
    paymentMessage: z.string().optional(),
  })
  .passthrough();

export type FonepayStatusRequest = z.infer<typeof fonepayStatusRequestSchema>;
export type FonepayStatusResponse = z.infer<typeof fonepayStatusResponseSchema>;

/* ------------------------------ WebSocket --------------------------------- */

/**
 * WebSocket messages wrap a STRINGIFIED JSON `transactionStatus` (documented).
 * The payment message's `paymentSuccess` flag is a NOTIFICATION ONLY — the
 * backend always re-verifies through the Status API before marking Paid.
 */
export interface FonepayWsEnvelope {
  merchantId?: number | string;
  deviceId?: string;
  transactionStatus?: string;
  [key: string]: unknown;
}

export interface FonepayWsTransactionStatus {
  remarks1?: string;
  remarks2?: string;
  transactionDate?: string;
  productNumber?: string;
  amount?: string | number;
  message?: string;
  success?: boolean;
  QRVerified?: boolean;
  commissionType?: string;
  commissionAmount?: number;
  totalCalculatedAmount?: number;
  paymentSuccess?: boolean;
  traceId?: number | string;
  [key: string]: unknown;
}

/** Cap for stored WebSocket-delivered event ids (duplicate-notification guard). */
export const FONEPAY_MAX_STORED_WS_EVENTS = 20;

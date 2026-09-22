import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { logger } from "../../../../utils/logger.js";
import { cybersourceConfig } from "./cybersource.config.js";
import { CYBERSOURCE_CLIENT_LIBRARY_HOSTS, } from "./cybersource-types.js";
/**
 * Verification of Cybersource-signed JWTs (capture contexts and Unified
 * Checkout payment-response tokens).
 *
 * Cybersource signs these tokens with RS256; the public key for a token is
 * resolved from the token's `kid` via the Cybersource public-keys endpoint:
 *
 *   GET https://{host}/flex/v2/public-keys/{kid}
 *
 * SECURITY:
 * - Only RS256 is accepted (rejects `none` and algorithm-confusion via HS*).
 * - The `kid` is strictly validated before being used in any request path.
 * - Public keys are cached in memory per (host, kid) with a TTL.
 * - Tokens are checked for expiry after signature verification.
 */
const ALLOWED_ALGORITHM = "RS256";
const KID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const JWK_CACHE_TTL_MS = 60 * 60 * 1000;
/** Minimal RSA JWK shape returned by the Cybersource public-keys endpoint. */
export interface RsaJwk {
    kty: string;
    n: string;
    e: string;
    kid?: string;
    use?: string;
    alg?: string;
}
/**
 * Loose payload shape of a Cybersource-signed JWT (capture context or
 * Unified Checkout payment-response token). Unknown fields stay accessible
 * through the index signature without `any`.
 */
export interface CybersourceTokenPayload {
    [key: string]: unknown;
    id?: string;
    reconciliationId?: string;
    status?: string;
    exp?: number;
    /** Capture-context id — the handle to quote when tracing with Cybersource. */
    jti?: string;
    kid?: string;
    clientReferenceInformation?: { code?: string };
    orderInformation?: { amountDetails?: { totalAmount?: string | number; currency?: string } };
    errorInformation?: { reason?: string };
    /** Payment/payer-authentication result data (enrollment/challenge outcome). */
    consumerAuthenticationInformation?: Record<string, unknown>;
    processingInformation?: Record<string, unknown>;
    paymentInformation?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    /** Flex endpoint map (tokensUrl / completeUrl / authenticationSetupUrl). */
    flx?: Record<string, unknown>;
    ctx?: Array<{
        type?: string;
        data?: { clientLibrary?: unknown; clientLibraryIntegrity?: unknown } & Record<
            string,
            unknown
        >;
    }>;
}
const jwkCache = new Map<string, { key: RsaJwk; fetchedAt: number }>();
export class CybersourceTokenError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CybersourceTokenError";
    }
}
/** Decode (WITHOUT verifying) a JWT payload — for public, non-sensitive data only. */
export function decodeJwtPayload(token: string): CybersourceTokenPayload {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[1]) {
        throw new CybersourceTokenError("Malformed token.");
    }
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}
function decodeJwtHeader(token: string): Record<string, unknown> {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[0]) {
        throw new CybersourceTokenError("Malformed token.");
    }
    return JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
}
async function fetchJwk(host: string, kid: string): Promise<RsaJwk> {
    const cacheKey = `${host}:${kid}`;
    const cached = jwkCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < JWK_CACHE_TTL_MS) {
        return cached.key;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    let response: Response;
    try {
        response = await fetch(`https://${host}/flex/v2/public-keys/${encodeURIComponent(kid)}`, {
            headers: { Accept: "application/json" },
            signal: controller.signal,
        });
    }
    catch {
        throw new CybersourceTokenError("Cybersource public key could not be fetched.");
    }
    finally {
        clearTimeout(timer);
    }
    if (!response.ok) {
        logger.error({ host, kid, status: response.status }, "Cybersource public-key fetch failed");
        throw new CybersourceTokenError("Cybersource public key could not be fetched.");
    }
    const jwk = (await response.json()) as RsaJwk | null;
    if (!jwk || jwk.kty !== "RSA" || !jwk.n || !jwk.e) {
        throw new CybersourceTokenError("Cybersource public key response is not a valid RSA JWK.");
    }
    jwkCache.set(cacheKey, { key: jwk, fetchedAt: Date.now() });
    return jwk;
}
/**
 * Verify a Cybersource-signed JWT (RS256, JWKS-resolved key) and return its
 * payload. Throws {@link CybersourceTokenError} on any failure.
 */
export async function verifyCybersourceToken(token: string): Promise<CybersourceTokenPayload> {
    if (!token || typeof token !== "string" || token.length > 16_384) {
        throw new CybersourceTokenError("Invalid token.");
    }
    const header = decodeJwtHeader(token);
    const alg = typeof header.alg === "string" ? header.alg.toUpperCase() : "";
    if (alg !== ALLOWED_ALGORITHM) {
        throw new CybersourceTokenError("Disallowed token algorithm.");
    }
    const kid = typeof header.kid === "string" ? header.kid : "";
    if (!KID_PATTERN.test(kid)) {
        throw new CybersourceTokenError("Invalid token key id.");
    }
    const jwk = await fetchJwk(cybersourceConfig.jwksHost(), kid);
    const publicKey = createPublicKey({
        key: jwk,
        format: "jwk",
    } as unknown as Parameters<typeof createPublicKey>[0]);
    const parts = token.split(".");
    const signedData = Buffer.from(`${parts[0]}.${parts[1]}`, "utf8");
    const signature = Buffer.from(parts[2], "base64url");
    let signatureValid = false;
    try {
        signatureValid = cryptoVerify("RSA-SHA256", signedData, publicKey, signature);
    }
    catch {
        signatureValid = false;
    }
    if (!signatureValid) {
        throw new CybersourceTokenError("Token signature verification failed.");
    }
    const payload = decodeJwtPayload(token);
    const exp = payload.exp;
    if (typeof exp === "number" && exp * 1000 < Date.now()) {
        throw new CybersourceTokenError("Token has expired.");
    }
    return payload;
}
/**
 * Extract the transaction-specific client library URL + integrity hash from a
 * capture context payload. The URL is allowlisted to Cybersource origins.
 */
export function extractClientLibrary(payload: CybersourceTokenPayload): {
    clientLibrary: string;
    clientLibraryIntegrity: string;
} {
    // Legacy format (clientVersion 0.x): entry.type === "clientLibrary" with
    // data.clientLibrary = [url, integrity]. Current format (clientVersion 1.x):
    // data.clientLibrary is a plain URL string + separate
    // data.clientLibraryIntegrity — the entry type is "uc-<version>".
    const entry = payload.ctx?.find((ctx) => {
        const lib = ctx?.data?.clientLibrary;
        return typeof lib === "string" || Array.isArray(lib);
    });
    const data = entry?.data?.clientLibrary;
    let url;
    let integrity = "";
    if (Array.isArray(data)) {
        url = typeof data[0] === "string" ? data[0] : undefined;
        integrity = typeof data[1] === "string" ? data[1] : "";
    }
    else if (typeof data === "string") {
        url = data;
        integrity =
            typeof entry?.data?.clientLibraryIntegrity === "string" ? entry.data.clientLibraryIntegrity : "";
    }
    if (!url || typeof url !== "string") {
        throw new CybersourceTokenError("Capture context does not contain a client library URL.");
    }
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        throw new CybersourceTokenError("Capture context client library URL is malformed.");
    }
    if (parsed.protocol !== "https:" || !CYBERSOURCE_CLIENT_LIBRARY_HOSTS.has(parsed.hostname)) {
        throw new CybersourceTokenError("Capture context client library host is not allowed.");
    }
    return { clientLibrary: url, clientLibraryIntegrity: integrity };
}

/**
 * SANITIZED, support-grade summary of a capture context.
 *
 * WHY THIS EXISTS: diagnosing "the flow stops after Payer Authentication Setup"
 * requires knowing exactly what the capture context asked Cybersource to do —
 * the complete-mandate type, the consumer-authentication (Payer Auth / 3-D
 * Secure) networks/types, the allowed card networks, and whether the session
 * exposes the Flex endpoints the SDK needs (`tokensUrl` → transient token,
 * `authenticationSetupUrl` → payer-auth setup, `completeUrl` → authorization).
 *
 * SECURITY: this NEVER returns the capture-context JWT, its signature, any
 * credential, card number or CVV. Only public session metadata is echoed.
 */
export interface CaptureContextSummary {
    /** Capture-context `jti` — the id to quote when tracing with Cybersource. */
    jti?: string;
    kid?: string;
    /** Unified Checkout app claim type, e.g. "uc-1.0.0". */
    ctxType?: string;
    serviceOrigin?: string;
    clientVersion?: string;
    targetOrigins: string[];
    allowedCardNetworks: string[];
    allowedPaymentTypes: string[];
    /** True when the payment types expose PANENTRY (card entry). */
    panEntryEnabled: boolean;
    captureMandate: {
        present: boolean;
        billingType?: string;
        requestEmail?: boolean;
        requestPhone?: boolean;
        requestShipping?: boolean;
        showAcceptedNetworkIcons?: boolean;
        showConfirmationStep?: boolean;
        deviceFingerprinting: boolean;
    };
    completeMandate: {
        present: boolean;
        /** "AUTH" authorizes only; "CAPTURE" authorizes and captures. */
        type?: string;
        decisionManager?: string | boolean;
        transactionId?: string;
        consumerAuthentication?: {
            allowedCardNetworks: string[];
            allowedPaymentTypes: string[];
        };
    };
    /** Flex endpoints the SDK will use. Booleans only — URLs are never logged. */
    flex: {
        tokensUrl: boolean;
        completeUrl: boolean;
        authenticationSetupUrl: boolean;
    };
    /**
     * True when the capture context carries a complete mandate, which is what
     * makes the SDK's `mount()` authorize the payment automatically. When false,
     * `mount()` resolves with a TRANSIENT token and the merchant must call
     * `complete()` — a silent-degradation trap.
     */
    autoProcessingAvailable: boolean;
}

/** Narrow an unknown value to a string array without leaking anything. */
function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string");
}

/** Read the Unified Checkout ("uc-") or generic ("gda-") app claim. */
function findAppClaim(payload: CybersourceTokenPayload): {
    type?: string;
    data: Record<string, unknown>;
} {
    const entry = payload.ctx?.find((ctx) => {
        const type = ctx?.type;
        return typeof type === "string" && (type.startsWith("uc-") || type.startsWith("gda-"));
    });
    const fallback = payload.ctx?.find((ctx) => ctx?.data !== undefined);
    const chosen = entry ?? fallback;
    const data = chosen?.data;
    return {
        ...(typeof chosen?.type === "string" ? { type: chosen.type } : {}),
        data: data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {},
    };
}

/**
 * Build the sanitized summary of a capture context. Never throws — a partially
 * populated summary is far more useful for diagnosis than an exception.
 */
export function summarizeCaptureContext(payload: CybersourceTokenPayload): CaptureContextSummary {
    const claim = findAppClaim(payload);
    const data = claim.data;
    const captureMandate = (data.captureMandate ?? {}) as Record<string, unknown>;
    const rawComplete = (data.completeMandate ?? {}) as Record<string, unknown>;
    const consumerAuth = (rawComplete.consumerAuthentication ?? {}) as Record<string, unknown>;
    const flex = (payload.flx ?? {}) as Record<string, unknown>;
    const deviceFingerprinting = (captureMandate.deviceFingerprinting ?? {}) as Record<
        string,
        unknown
    >;

    const allowedPaymentTypes = asStringArray(data.allowedPaymentTypes);
    const completeMandatePresent = Object.keys(rawComplete).length > 0;

    return {
        ...(typeof payload.jti === "string" ? { jti: payload.jti } : {}),
        ...(typeof payload.kid === "string" ? { kid: payload.kid } : {}),
        ...(claim.type ? { ctxType: claim.type } : {}),
        ...(typeof data.serviceOrigin === "string" ? { serviceOrigin: data.serviceOrigin } : {}),
        ...(typeof data.clientVersion === "string" ? { clientVersion: data.clientVersion } : {}),
        targetOrigins: asStringArray(data.targetOrigins),
        allowedCardNetworks: asStringArray(data.allowedCardNetworks),
        allowedPaymentTypes,
        panEntryEnabled: allowedPaymentTypes.includes("PANENTRY"),
        captureMandate: {
            present: Object.keys(captureMandate).length > 0,
            ...(typeof captureMandate.billingType === "string"
                ? { billingType: captureMandate.billingType }
                : {}),
            ...(typeof captureMandate.requestEmail === "boolean"
                ? { requestEmail: captureMandate.requestEmail }
                : {}),
            ...(typeof captureMandate.requestPhone === "boolean"
                ? { requestPhone: captureMandate.requestPhone }
                : {}),
            ...(typeof captureMandate.requestShipping === "boolean"
                ? { requestShipping: captureMandate.requestShipping }
                : {}),
            ...(typeof captureMandate.showAcceptedNetworkIcons === "boolean"
                ? { showAcceptedNetworkIcons: captureMandate.showAcceptedNetworkIcons }
                : {}),
            ...(typeof captureMandate.showConfirmationStep === "boolean"
                ? { showConfirmationStep: captureMandate.showConfirmationStep }
                : {}),
            deviceFingerprinting: Object.keys(deviceFingerprinting).length > 0,
        },
        completeMandate: {
            present: completeMandatePresent,
            ...(typeof rawComplete.type === "string" ? { type: rawComplete.type } : {}),
            ...(typeof rawComplete.decisionManager === "string" ||
            typeof rawComplete.decisionManager === "boolean"
                ? { decisionManager: rawComplete.decisionManager }
                : {}),
            ...(typeof rawComplete.transactionId === "string"
                ? { transactionId: rawComplete.transactionId }
                : {}),
            ...(Object.keys(consumerAuth).length > 0
                ? {
                      consumerAuthentication: {
                          allowedCardNetworks: asStringArray(consumerAuth.allowedCardNetworks),
                          allowedPaymentTypes: asStringArray(consumerAuth.allowedPaymentTypes),
                      },
                  }
                : {}),
        },
        flex: {
            tokensUrl: typeof flex.tokensUrl === "string",
            completeUrl: typeof flex.completeUrl === "string",
            authenticationSetupUrl: typeof flex.authenticationSetupUrl === "string",
        },
        autoProcessingAvailable: completeMandatePresent,
    };
}
/**
 * SANITIZED view of a Unified Checkout payment-response token.
 *
 * Covers the whole post-setup chain so a stalled or declined payment is
 * diagnosable from logs alone:
 *   - enrollment / challenge / authentication → `authentication.*`
 *   - authorization                           → `status`, ids, `routing`
 *   - capture                                 → `status` (CAPTURED)
 *
 * SECURITY: never includes the token, its signature, credentials, PAN or CVV.
 */
export interface PaymentTokenDiagnostics {
    status?: string;
    transactionId?: string;
    reconciliationId?: string;
    merchantReference?: string;
    amount?: string | number;
    currency?: string;
    reason?: string;
    /** True when the payload carries payer-authentication result data. */
    authenticationPresent: boolean;
    authentication: {
        /** Payer-auth status, e.g. "AUTHENTICATION_SUCCESSFUL". */
        status?: string;
        eci?: string;
        specificationVersion?: string;
        authenticationTransactionId?: string;
        directoryServerTransactionId?: string;
        acsTransactionId?: string;
        /** True when the issuer demanded a challenge (step-up). */
        challengeRequired: boolean;
    };
    /** Processing/authorization routing information, when present. */
    routing: {
        network?: string;
        paymentType?: string;
        captureMandateType?: string;
    };
    /**
     * SAFE structural shape of the payload: dotted KEY PATHS only (never
     * values), depth-bounded. Unified Checkout has changed the response-token
     * layout between versions (the amount's carrier path is not stable across
     * them), so knowing the real key paths is the only reliable way to parse
     * the outcome. Key names are structure, not secrets.
     */
    keyPaths?: string[];
}

/** Read the first string value for `key` from a plain object. */
function pickString(source: Record<string, unknown>, key: string): string | undefined {
    const value = source[key];
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Keys whose VALUES are safe to log (order amounts/currency — never card/token data). */
const VALUE_SAFE_KEY_PATTERN = /^(totalAmount|amount|currency|taxAmount)$/i;
const MAX_WALK_DEPTH = 6;
const MAX_KEY_PATHS = 120;

/**
 * Walk a payload and collect dotted key paths. Values are NEVER captured
 * except for amount/currency keys (order amounts are merchant data, not
 * secrets) — card, token, signature and credential fields contribute their
 * KEY NAME only.
 */
export function payloadKeyPaths(value: unknown, prefix = "", out: string[] = [], depth = 0): string[] {
    if (depth > MAX_WALK_DEPTH || out.length >= MAX_KEY_PATHS || value === null || typeof value !== "object") {
        return out;
    }
    const record = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(record)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (item !== null && typeof item === "object") {
            out.push(path);
            payloadKeyPaths(item, path, out, depth + 1);
            continue;
        }
        if (VALUE_SAFE_KEY_PATTERN.test(key)) {
            out.push(`${path}=${String(item)}`);
        } else {
            out.push(path);
        }
    }
    return out;
}


/** Extract the sanitized diagnostics from a verified response-token payload. */
export function tokenDiagnostics(payload: CybersourceTokenPayload): PaymentTokenDiagnostics {
    const consumerAuth = payload.consumerAuthenticationInformation ?? {};
    const processing = payload.processingInformation ?? {};
    const paymentInfo = payload.paymentInformation ?? {};
    const card = (paymentInfo.card ?? {}) as Record<string, unknown>;
    const tokenizedCard = (card.tokenizedCard ?? {}) as Record<string, unknown>;
    const metadata = payload.metadata ?? {};

    const authStatus =
        pickString(consumerAuth, "authenticationStatus") ?? pickString(consumerAuth, "paStatus");
    const challengeRequired =
        consumerAuth.challengeRequired === true ||
        authStatus === "CHALLENGE_REQUIRED" ||
        authStatus === "PENDING_AUTHENTICATION";
    const paymentType =
        pickString(tokenizedCard, "paymentInstrumentType") ??
        pickString(processing, "paymentSolution");

    const amount = payload.orderInformation?.amountDetails?.totalAmount;
    const currency = payload.orderInformation?.amountDetails?.currency;
    const status = pickString(payload as unknown as Record<string, unknown>, "status");
    const merchantReference = payload.clientReferenceInformation?.code;
    const reason = payload.errorInformation?.reason;

    return {
        ...(status ? { status } : {}),
        ...(typeof payload.id === "string" ? { transactionId: payload.id } : {}),
        ...(typeof payload.reconciliationId === "string"
            ? { reconciliationId: payload.reconciliationId }
            : {}),
        ...(typeof merchantReference === "string" ? { merchantReference } : {}),
        ...(amount !== undefined ? { amount } : {}),
        ...(typeof currency === "string" ? { currency } : {}),
        ...(typeof reason === "string" ? { reason } : {}),
        // Real response-token shape (key paths + amount/currency values only)
        // so the amount/status carrier can be parsed from the actual layout.
        keyPaths: payloadKeyPaths(payload),
        authenticationPresent: Object.keys(consumerAuth).length > 0,
        authentication: {
            ...(authStatus ? { status: authStatus } : {}),
            ...(pickString(consumerAuth, "eci") ? { eci: pickString(consumerAuth, "eci")! } : {}),
            ...(pickString(consumerAuth, "specificationVersion")
                ? { specificationVersion: pickString(consumerAuth, "specificationVersion")! }
                : {}),
            ...(pickString(consumerAuth, "authenticationTransactionId")
                ? {
                      authenticationTransactionId: pickString(
                          consumerAuth,
                          "authenticationTransactionId",
                      )!,
                  }
                : {}),
            ...(pickString(consumerAuth, "directoryServerTransactionId")
                ? {
                      directoryServerTransactionId: pickString(
                          consumerAuth,
                          "directoryServerTransactionId",
                      )!,
                  }
                : {}),
            ...(pickString(consumerAuth, "acsTransactionId")
                ? { acsTransactionId: pickString(consumerAuth, "acsTransactionId")! }
                : {}),
            challengeRequired,
        },
        routing: {
            ...(pickString(paymentInfo, "network")
                ? { network: pickString(paymentInfo, "network")! }
                : {}),
            ...(paymentType ? { paymentType } : {}),
            ...(pickString(metadata, "completeMandateType")
                ? { captureMandateType: pickString(metadata, "completeMandateType")! }
                : {}),
        },
    };
}

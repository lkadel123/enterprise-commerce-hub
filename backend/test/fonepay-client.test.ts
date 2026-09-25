import "./helpers/fonepay-test-env.js";

import { createVerify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../src/config/env.js";
import { logger } from "../src/utils/logger.js";
import {
  FonepayApiError,
  generateFonepayIntentQr,
  getFonepayAccessToken,
  getFonepayBankList,
  getFonepayPaymentStatus,
  resetFonepayTokenForTests,
} from "../src/modules/payments/providers/fonepay/fonepay.client.js";
import {
  FONEPAY_REFERENCE_PATTERN,
  fonepayBasicAuth,
  normalizeFonepayPrivateKey,
  signFonepayPayload,
} from "../src/modules/payments/providers/fonepay/fonepay.signature.js";
import { FONEPAY_TEST_PUBLIC_KEY_PEM } from "./helpers/fonepay-test-env.js";

/**
 * Fonepay HTTP client contract (offline — `fetch` is stubbed, no request ever
 * leaves the process).
 *
 * The security-critical invariant pinned here is the DOCUMENTED signing rule:
 * the request body is serialized exactly once and the signature is computed over
 * that exact string, so Fonepay's own verification (which re-serializes nothing)
 * succeeds. A signature over a re-ordered/re-encoded body would be rejected by
 * Fonepay in production but is invisible to a naive "signature header exists"
 * assertion — hence `expectSignatureOver` verifies it cryptographically against
 * the generated public key.
 */

const fetchMock = vi.fn();

beforeEach(() => {
  resetFonepayTokenForTests();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function loginResponse(token = "jwt-token-1"): Response {
  return jsonResponse({
    username: "test-merchant-user",
    accessToken: token,
    refreshToken: "refresh",
    tokenType: "Bearer",
    expiresIn: 3600,
  });
}

/** Assert `signature` is a valid SHA256withRSA signature over `body`. */
function expectSignatureOver(body: string, signature: string): void {
  const verifier = createVerify("RSA-SHA256");
  verifier.update(body, "utf8");
  verifier.end();
  expect(verifier.verify(FONEPAY_TEST_PUBLIC_KEY_PEM, Buffer.from(signature, "base64"))).toBe(true);
}

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

function capturedRequests(): CapturedRequest[] {
  return (fetchMock.mock.calls as unknown as [string, RequestInit][]).map(([url, init]) => ({
    url,
    method: init.method ?? "GET",
    headers: (init.headers ?? {}) as Record<string, string>,
    body: typeof init.body === "string" ? init.body : null,
  }));
}

function lastRequest(): CapturedRequest {
  const requests = capturedRequests();
  const request = requests[requests.length - 1];
  if (!request) throw new Error("fetch was not called");
  return request;
}

/* ------------------- generate-intent-qr response fixtures ---------------- */

/**
 * SANITIZED fixtures for `POST /api/merchant/third-party/v2/generate-intent-qr`.
 *
 * The documented SUCCESS body is a TOP-LEVEL object (no `data`/`result`
 * envelope) carrying `qrString`, `qrDisplayName`, `status`, `terminalId`,
 * `prn`, `qrMessage`, `terminalName`, `websocketId`, `location` and
 * `fonepayPanNumber`. Every value here is synthetic: the QR payload is a
 * hand-written EMVCo-shaped string that encodes nothing, the socket URL is under
 * `.invalid`, and the PRN/PAN are obvious placeholders. No real merchant,
 * customer or payment data appears in this file.
 */
const SANITIZED_QR_PAYLOAD =
  "00020101021229340011fonepay.invalid5204581253035240540650.005802NP5914SANITIZED TEST6007KATHMANDU6304ABCD";
const SANITIZED_QR_RESPONSE = {
  qrString: SANITIZED_QR_PAYLOAD,
  qrDisplayName: "Sanitized Store",
  status: "SUCCESS",
  terminalId: 123456,
  prn: "FPSANITIZEDPRN000001",
  qrMessage: "QR generated",
  terminalName: "Sanitized Terminal",
  websocketId: "wss://sanitized.invalid/qr/1",
  location: "Kathmandu",
  fonepayPanNumber: "SANITIZED-PAN",
};
/** Secret-looking values used to prove diagnostics never leak payload data. */
const SANITIZED_ACCESS_TOKEN = "sanitized-access-token-0123456789";
const SANITIZED_CUSTOMER_EMAIL = "shopper@example.invalid";

/** A valid, signed-callable generate-intent-qr request. */
function qrRequest(): Promise<unknown> {
  return generateFonepayIntentQr({
    amount: 100,
    billId: "6ab0cf116e9cc135e743ff5a",
    terminalId: env.FONEPAY_TERMINAL_ID,
    paymentMode: "QR",
    referenceLabel: "FPabcdef0123456789",
    qrType: "INTENT_QR",
  });
}

/** Await a rejected QR request and return the typed provider error. */
async function qrFailure(): Promise<FonepayApiError> {
  try {
    await qrRequest();
  } catch (error) {
    expect(error).toBeInstanceOf(FonepayApiError);
    return error as FonepayApiError;
  }
  throw new Error("generate-intent-qr was expected to fail");
}

describe("Fonepay request signing", () => {
  it("signs the exact Base64 PKCS8 body it sends to the documented login endpoint", async () => {
    fetchMock.mockResolvedValueOnce(loginResponse());

    await getFonepayAccessToken();

    const request = lastRequest();
    expect(request.method).toBe("POST");
    expect(request.url).toBe(
      `${env.FONEPAY_BASE_URL}/api/merchant/merchantDetailsForThirdParty/v2/login`,
    );
    // Basic auth carries the merchant credentials; the signature covers the body.
    expect(request.headers.Authorization).toBe(
      fonepayBasicAuth(env.FONEPAY_USERNAME, env.FONEPAY_PASSWORD),
    );
    expect(request.headers["Content-Type"]).toBe("application/json");
    const body = request.body ?? "";
    expect(JSON.parse(body)).toEqual({
      username: env.FONEPAY_USERNAME,
      password: env.FONEPAY_PASSWORD,
    });
    expectSignatureOver(body, request.headers.signature ?? "");
  });

  it("signs the exact QR request body and sends the Bearer token", async () => {
    fetchMock.mockResolvedValueOnce(loginResponse("jwt-token-2")).mockResolvedValueOnce(
      jsonResponse({
        qrString: "000201010212...",
        qrDisplayName: "NASB Store",
        status: "SUCCESS",
        terminalId: 123456,
        prn: "FPabcdef0123456789",
        websocketId: "wss://ws.example.invalid/qr/1",
      }),
    );

    await generateFonepayIntentQr({
      amount: 100,
      billId: "6ab0cf116e9cc135e743ff5a",
      terminalId: env.FONEPAY_TERMINAL_ID,
      paymentMode: "QR",
      referenceLabel: "FPabcdef0123456789",
      qrType: "INTENT_QR",
    });

    const request = lastRequest();
    expect(request.url).toBe(
      `${env.FONEPAY_BASE_URL}/api/merchant/third-party/v2/generate-intent-qr`,
    );
    expect(request.headers.Authorization).toBe("Bearer jwt-token-2");
    const body = request.body ?? "";
    expect(JSON.parse(body)).toEqual({
      amount: 100,
      billId: "6ab0cf116e9cc135e743ff5a",
      terminalId: env.FONEPAY_TERMINAL_ID,
      paymentMode: "QR",
      referenceLabel: "FPabcdef0123456789",
      qrType: "INTENT_QR",
    });
    // The signature must cover the EXACT bytes sent — not a re-serialization.
    expectSignatureOver(body, request.headers.signature ?? "");
  });

  it("sends the documented status request (terminalId + referenceLabel, signed)", async () => {
    fetchMock.mockResolvedValueOnce(loginResponse("jwt-token-3")).mockResolvedValueOnce(
      jsonResponse({
        prn: "FPabcdef0123456789",
        merchantCode: env.FONEPAY_TERMINAL_ID,
        paymentStatus: "COMPLETED",
        requestedAmount: "100.00",
        totalTransactionAmount: "100.00",
      }),
    );

    await getFonepayPaymentStatus({
      terminalId: env.FONEPAY_TERMINAL_ID,
      referenceLabel: "FPabcdef0123456789",
    });

    const request = lastRequest();
    expect(request.url).toBe(
      `${env.FONEPAY_BASE_URL}/api/merchant/third-party/v2/thirdPartyDynamicQrGetStatus`,
    );
    expect(JSON.parse(request.body ?? "")).toEqual({
      terminalId: env.FONEPAY_TERMINAL_ID,
      referenceLabel: "FPabcdef0123456789",
    });
    expectSignatureOver(request.body ?? "", request.headers.signature ?? "");
  });

  it("caches the access token and does not re-login for every call", async () => {
    fetchMock.mockResolvedValueOnce(loginResponse("jwt-cached")).mockImplementation(async () =>
      jsonResponse({
        prn: "FPaaaaaaaaaaaaaaaaaa",
        merchantCode: env.FONEPAY_TERMINAL_ID,
        paymentStatus: "PENDING",
      }),
    );

    await getFonepayPaymentStatus({
      terminalId: env.FONEPAY_TERMINAL_ID,
      referenceLabel: "FPaaaaaaaaaaaaaaaaaa",
    });
    await getFonepayPaymentStatus({
      terminalId: env.FONEPAY_TERMINAL_ID,
      referenceLabel: "FPaaaaaaaaaaaaaaaaaa",
    });

    const urls = capturedRequests().map((request) => request.url);
    expect(urls.filter((url) => url.endsWith("/login"))).toHaveLength(1);
    expect(urls.filter((url) => url.endsWith("/thirdPartyDynamicQrGetStatus"))).toHaveLength(2);
  });

  it("requests the bank list for the INTENT payment mode", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse("jwt-intent"))
      .mockResolvedValueOnce(jsonResponse({ bankDetails: [{ bankName: "X", bankCode: "111" }] }));

    const banks = await getFonepayBankList();

    const request = lastRequest();
    expect(request.method).toBe("GET");
    expect(request.url).toBe(`${env.FONEPAY_BASE_URL}/api/merchant/third-party/v2/banks/list`);
    expect(request.headers.paymentMode).toBe("INTENT");
    expect(request.headers.Authorization).toBe("Bearer jwt-intent");
    expect(banks.bankDetails).toHaveLength(1);
  });
});

/* ----------------------------- Error mapping ------------------------------ */

describe("Fonepay error mapping", () => {
  function statusRequest(): Promise<unknown> {
    return getFonepayPaymentStatus({
      terminalId: env.FONEPAY_TERMINAL_ID,
      referenceLabel: "FPabcdef0123456789",
    });
  }

  it("reports a duplicate reference label (409) as a typed conflict", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(jsonResponse({ message: "Duplicate reference label" }, 409));

    await expect(statusRequest()).rejects.toMatchObject({
      name: "FonepayApiError",
      httpStatus: 409,
      kind: "duplicate_reference",
    });
  });

  it("reports an unknown terminal (409) as a typed conflict", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(jsonResponse({ message: "Invalid terminal" }, 409));

    await expect(statusRequest()).rejects.toMatchObject({
      httpStatus: 409,
      kind: "terminal_not_found",
    });
  });

  it("maps 400 to a validation error and 401 to an auth error", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(jsonResponse({ message: "Invalid request" }, 400));
    await expect(statusRequest()).rejects.toMatchObject({ httpStatus: 400, kind: "validation" });

    resetFonepayTokenForTests();
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(jsonResponse({ message: "Unauthorized" }, 401));
    await expect(statusRequest()).rejects.toMatchObject({ httpStatus: 401, kind: "auth" });
  });

  it("maps an unexpected provider failure to a generic provider error", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(jsonResponse({ message: "boom" }, 500));

    await expect(statusRequest()).rejects.toMatchObject({ httpStatus: 500, kind: "provider" });
  });

  it("maps a transport failure to a network error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));

    await expect(statusRequest()).rejects.toMatchObject({ httpStatus: 502, kind: "network" });
  });

  it("maps an aborted request to a timeout error", async () => {
    const original = env.FONEPAY_REQUEST_TIMEOUT_MS;
    env.FONEPAY_REQUEST_TIMEOUT_MS = 20;
    try {
      fetchMock.mockImplementationOnce(
        (_url: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const abortError = new Error("aborted");
              abortError.name = "AbortError";
              reject(abortError);
            });
          }),
      );

      await expect(statusRequest()).rejects.toMatchObject({ httpStatus: 504, kind: "timeout" });
    } finally {
      env.FONEPAY_REQUEST_TIMEOUT_MS = original;
    }
  });

  it("fails closed when the provider response does not match the documented shape", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse())
      // No `qrString` — must never be treated as a usable QR.
      .mockResolvedValueOnce(jsonResponse({ status: "SUCCESS", prn: "P1" }));

    await expect(qrRequest()).rejects.toMatchObject({
      name: "FonepayApiError",
      httpStatus: 502,
      // A 200 body that advertises a status but carries no QR payload is an
      // application-level failure: never a success, and no longer an opaque
      // schema violation reported to operators as a "network" error.
      kind: "provider",
      message: "Fonepay returned a QR response with no QR payload (status: SUCCESS).",
    });
  });

  it("fails fast with 503 when the gateway is not enabled", async () => {
    const original = env.FONEPAY_ENABLED;
    env.FONEPAY_ENABLED = false;
    try {
      await expect(statusRequest()).rejects.toMatchObject({
        httpStatus: 503,
        kind: "not_configured",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      env.FONEPAY_ENABLED = original;
    }
  });
});

/* ----------------- generate-intent-qr response contract ------------------ */

describe("Fonepay generate-intent-qr response contract", () => {
  it("accepts the documented top-level success body", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(jsonResponse(SANITIZED_QR_RESPONSE));

    await expect(qrRequest()).resolves.toMatchObject({
      qrString: SANITIZED_QR_PAYLOAD,
      qrDisplayName: "Sanitized Store",
      status: "SUCCESS",
      terminalId: 123456,
      prn: "FPSANITIZEDPRN000001",
      terminalName: "Sanitized Terminal",
      websocketId: "wss://sanitized.invalid/qr/1",
      location: "Kathmandu",
      fonepayPanNumber: "SANITIZED-PAN",
    });
  });

  it("accepts a success body without the display-only fields", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(
        jsonResponse({ qrString: SANITIZED_QR_PAYLOAD, terminalId: "123456" }),
      );

    await expect(qrRequest()).resolves.toMatchObject({
      qrString: SANITIZED_QR_PAYLOAD,
      terminalId: "123456",
    });
  });

  it("reports an HTTP 200 application-level failure with the provider reason", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(jsonResponse({ status: "FAILED", message: "Invalid terminal id" }));

    const error = await qrFailure();

    expect(error).toBeInstanceOf(FonepayApiError);
    expect(error).toMatchObject({ httpStatus: 502, kind: "provider" });
    expect(error.message).toContain("Invalid terminal id");
    // Safe diagnostics: provider field NAMES and types only, never values.
    expect(error.diagnostics?.responseShape.keys).toEqual(["status", "message"]);
    expect(error.diagnostics?.responseShape.fieldTypes).toEqual({
      status: "string",
      message: "string",
    });
    expect(error.diagnostics?.issues).toBeUndefined();
  });

  it("reports an HTTP 200 `error`-only failure body", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(jsonResponse({ error: "Unauthorized" }));

    await expect(qrRequest()).rejects.toMatchObject({
      httpStatus: 502,
      kind: "provider",
      message: "Fonepay rejected the QR request: Unauthorized",
    });
  });

  it("reports a provider failure delivered as `qrMessage`", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(jsonResponse({ qrMessage: "QR could not be generated" }));

    await expect(qrRequest()).rejects.toMatchObject({
      httpStatus: 502,
      kind: "provider",
      message: "Fonepay rejected the QR request: QR could not be generated",
    });
  });

  it("fails closed with issue path and types when a required field is missing", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse())
      // Documented fields, but the payable payload is absent and no provider
      // message explains it: a genuine contract violation.
      .mockResolvedValueOnce(jsonResponse({ prn: "FPSANITIZEDPRN000001" }));

    const error = await qrFailure();

    expect(error).toMatchObject({ httpStatus: 502, kind: "invalid_response" });
    expect(error.diagnostics?.issues).toEqual([
      { path: "qrString", code: "invalid_type", expected: "string", received: "undefined" },
    ]);
    expect(error.diagnostics?.responseShape.keys).toEqual(["prn"]);
    // The provider body itself is never attached to the error.
    expect(JSON.stringify(error.diagnostics)).not.toContain("FPSANITIZEDPRN000001");
  });

  it("rejects an empty QR payload", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(jsonResponse({ qrString: "" }));

    await expect(qrRequest()).rejects.toMatchObject({
      httpStatus: 502,
      kind: "invalid_response",
      diagnostics: {
        issues: [
          { path: "qrString", code: "too_small", expected: "string", constraint: ">= 1 (string)" },
        ],
      },
    });
  });

  it("rejects a whitespace-only QR payload (never a scannable QR)", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse())
      // No provider status/message to report, so this is a contract violation:
      // the schema trims before `min(1)` and rejects the blank payload.
      .mockResolvedValueOnce(jsonResponse({ qrString: "   " }));

    await expect(qrRequest()).rejects.toMatchObject({
      httpStatus: 502,
      kind: "invalid_response",
      diagnostics: { issues: [{ path: "qrString", code: "too_small" }] },
    });
  });

  it("reports a status-only 200 body as a provider failure, never a success", async () => {
    fetchMock.mockResolvedValueOnce(loginResponse()).mockResolvedValueOnce(
      // A status word with no payload: the provider's own outcome, reported as
      // such instead of being read as a schema bug.
      jsonResponse({ qrString: "   ", status: "SUCCESS" }),
    );

    await expect(qrRequest()).rejects.toMatchObject({
      httpStatus: 502,
      kind: "provider",
      message: "Fonepay returned a QR response with no QR payload (status: SUCCESS).",
    });
  });

  it("keeps a wrong-typed qrString a contract violation even with a provider message", async () => {
    fetchMock.mockResolvedValueOnce(loginResponse()).mockResolvedValueOnce(
      jsonResponse({
        qrString: { raw: SANITIZED_QR_PAYLOAD },
        message: "Duplicate reference label",
      }),
    );

    const error = await qrFailure();

    // The provider message must NOT downgrade an unreadable payload into a
    // "provider rejected the request" story: we cannot prove there was no QR.
    expect(error).toMatchObject({ httpStatus: 502, kind: "invalid_response" });
    expect(error.diagnostics?.issues?.[0]).toMatchObject({
      path: "qrString",
      code: "invalid_type",
      expected: "string",
      received: "object",
    });
    expect(error.diagnostics?.responseShape.nestedKeys).toEqual({ qrString: ["raw"] });
    expect(JSON.stringify(error.diagnostics)).not.toContain(SANITIZED_QR_PAYLOAD);
  });

  it("rejects a WRAPPED payload instead of guessing an envelope", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(jsonResponse({ data: { qrString: SANITIZED_QR_PAYLOAD } }));

    const error = await qrFailure();

    expect(error).toMatchObject({ httpStatus: 502, kind: "invalid_response" });
    // The shape summary is what makes a provider-side envelope change obvious
    // without recording the payload itself.
    expect(error.diagnostics?.responseShape).toMatchObject({
      type: "object",
      keys: ["data"],
      fieldTypes: { data: "object" },
      nestedKeys: { data: ["qrString"] },
    });
    expect(JSON.stringify(error.diagnostics)).not.toContain(SANITIZED_QR_PAYLOAD);
  });

  it("classifies a non-JSON 200 body as invalid, never as a network failure", async () => {
    fetchMock.mockResolvedValueOnce(loginResponse()).mockResolvedValueOnce(
      new Response("<html>gateway maintenance</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(qrRequest()).rejects.toMatchObject({
      httpStatus: 502,
      // A 2xx body that is not JSON is a contract violation: reporting it as
      // `network` is what previously hid this class of production failure.
      kind: "invalid_response",
    });
  });

  it("logs redaction-safe diagnostics and never provider values", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    try {
      fetchMock.mockResolvedValueOnce(loginResponse()).mockResolvedValueOnce(
        jsonResponse({
          // Unreadable payload: a contract violation, so the log must carry the
          // issue path/types without a single provider value.
          qrString: { raw: SANITIZED_QR_PAYLOAD },
          accessToken: SANITIZED_ACCESS_TOKEN,
          customer: { email: SANITIZED_CUSTOMER_EMAIL },
        }),
      );

      await expect(qrRequest()).rejects.toMatchObject({ kind: "invalid_response" });

      const logged = JSON.stringify(errorSpy.mock.calls);
      // USEFUL: which field, which types, which provider fields were present.
      expect(logged).toContain("qrString");
      expect(logged).toContain("invalid_type");
      expect(logged).toContain("object");
      expect(logged).toContain("accessToken");
      expect(logged).toContain("customer");
      // SAFE: no QR payload, token, customer data or nested value.
      expect(logged).not.toContain(SANITIZED_QR_PAYLOAD);
      expect(logged).not.toContain(SANITIZED_ACCESS_TOKEN);
      expect(logged).not.toContain(SANITIZED_CUSTOMER_EMAIL);
      expect(logged).not.toContain("shopper@");
    } finally {
      errorSpy.mockRestore();
    }
  });
});

/* ------------------------- Private key normalization ---------------------- */

describe("Fonepay private key normalization", () => {
  it("accepts a Base64 PKCS8 key without PEM headers", () => {
    const key = normalizeFonepayPrivateKey(env.FONEPAY_PRIVATE_KEY);
    expect(key.type).toBe("private");
    expect(signFonepayPayload(key, "payload")).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("accepts a HEX PKCS8 key", () => {
    const hex = Buffer.from(env.FONEPAY_PRIVATE_KEY, "base64").toString("hex");
    expect(normalizeFonepayPrivateKey(hex).type).toBe("private");
  });

  it("signs exactly like an independent SHA256withRSA signer", () => {
    const key = normalizeFonepayPrivateKey(env.FONEPAY_PRIVATE_KEY);
    const body = JSON.stringify({ terminalId: "TESTTERM1", referenceLabel: "FP1" });
    expectSignatureOver(body, signFonepayPayload(key, body));
  });

  it("rejects PEM-wrapped keys and non-PKCS8 material", () => {
    expect(() => normalizeFonepayPrivateKey("-----BEGIN PRIVATE KEY-----")).toThrow();
    expect(() => normalizeFonepayPrivateKey("not a valid key!!")).toThrow();
    expect(() => normalizeFonepayPrivateKey("")).toThrow();
  });

  it("enforces the documented alphanumeric reference-label pattern", () => {
    expect(FONEPAY_REFERENCE_PATTERN.test("FPabcdef0123456789")).toBe(true);
    expect(FONEPAY_REFERENCE_PATTERN.test("fp-ref-with-dashes")).toBe(false);
    expect(FONEPAY_REFERENCE_PATTERN.test("a".repeat(31))).toBe(false);
  });
});

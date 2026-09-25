import "./helpers/fonepay-test-env.js";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FONEPAY_CURRENCY,
  FONEPAY_MAX_AMOUNT,
  FONEPAY_MIN_AMOUNT,
  FONEPAY_QR_WAIT_WINDOW_MS,
  generateFonepayReferenceLabel,
  isRecognizedFonepayStatus,
  mapFonepayStatus,
  toFonepayAmount,
} from "../src/modules/payments/providers/fonepay/fonepay.config.js";
import { FonepayProvider } from "../src/modules/payments/providers/fonepay/fonepay.provider.js";
import { FONEPAY_REFERENCE_PATTERN } from "../src/modules/payments/providers/fonepay/fonepay.signature.js";
import type {
  FonepayIntentQrResponse,
  FonepayStatusResponse,
} from "../src/modules/payments/providers/fonepay/fonepay.types.js";

/**
 * Fonepay provider contracts (offline — the HTTP client module is stubbed, so no
 * request ever leaves the process).
 *
 * Covers the invariants that protect live money:
 * 1. `referenceLabel`: alphanumeric, order-bound, CSPRNG-random suffix, ≤ 30
 *    chars. Fonepay rejects anything else, and a guessable label would let a
 *    third party query someone else's transaction through the Status API.
 * 2. Amount normalization: a two-decimal rupee amount inside Fonepay's
 *    documented 1..9,999,999 range — never zero, negative, NaN or out of range.
 * 3. Status mapping: the DOCUMENTED success vocabulary (`COMPLETED`, the value
 *    the v2 third-party PKI status API returns; `SUCCESS`, the value of the QR
 *    status API) maps to `Paid`; every RECOGNIZED terminal value maps to its
 *    order-side equivalent; every UNRECOGNIZED value maps to `Pending` — never
 *    `Paid` (an unknown string must not be able to settle an order) and never a
 *    falsely terminal failure.
 * 4. `verify` fail-closed rules: reference binding, terminal binding and amount
 *    agreement are all checked before `Paid` can reach the payment service.
 * 5. Initiation: the SERVER amount and an order-bound reference are sent to
 *    Fonepay, and the customer receives display data only (QR image, no redirect
 *    URL) — the QR is never proof of payment.
 *
 * Pure configuration validation (no `env`, no network) is covered by
 * `test/fonepay-configuration.test.ts`.
 */

/** The provider's HTTP client, replaced so the provider contract runs offline. */
const client = vi.hoisted(() => ({
  terminalId: "TESTTERM1",
  generateFonepayIntentQr: vi.fn(),
  getFonepayPaymentStatus: vi.fn(),
  configuredFonepayTerminalId: vi.fn(),
}));

vi.mock("../src/modules/payments/providers/fonepay/fonepay.client.js", () => ({
  configuredFonepayTerminalId: client.configuredFonepayTerminalId,
  generateFonepayIntentQr: client.generateFonepayIntentQr,
  getFonepayPaymentStatus: client.getFonepayPaymentStatus,
}));

const provider = new FonepayProvider();

/** A Mongo ObjectId-shaped order id (what `initiate` binds the label to). */
const ORDER_ID = "6ab0cf116e9cc135e743ff5a";

/** A provider status payload that satisfies every verification rule. */
function statusResponse(
  referenceLabel: string,
  overrides: Partial<FonepayStatusResponse> = {},
): FonepayStatusResponse {
  return {
    prn: referenceLabel,
    merchantCode: client.terminalId,
    paymentStatus: "COMPLETED",
    requestedAmount: "100.50",
    totalTransactionAmount: "100.50",
    fonepayTraceId: 987654,
    ...overrides,
  };
}

beforeEach(() => {
  client.generateFonepayIntentQr.mockReset();
  client.getFonepayPaymentStatus.mockReset();
  client.configuredFonepayTerminalId.mockReset();
  client.configuredFonepayTerminalId.mockReturnValue(client.terminalId);
});

describe("Fonepay reference-label generation", () => {
  it("builds an order-bound, 22-character alphanumeric label", () => {
    const label = generateFonepayReferenceLabel(ORDER_ID);

    expect(label).toMatch(FONEPAY_REFERENCE_PATTERN);
    expect(label).toHaveLength(22);
    // "FP" + last 10 alphanumeric chars of the order id + 10 CSPRNG hex chars.
    expect(label.slice(0, 12)).toBe(`FP${ORDER_ID.slice(-10)}`);
    expect(label.slice(12)).toMatch(/^[0-9a-f]{10}$/);
  });

  it("strips characters Fonepay does not accept from the order fragment", () => {
    const label = generateFonepayReferenceLabel("order/with/slashes-and-dashes");

    expect(label).toMatch(FONEPAY_REFERENCE_PATTERN);
    expect(label).not.toMatch(/[^a-zA-Z0-9]/);
    // Never longer than 30 chars, whatever the order id looks like.
    expect(generateFonepayReferenceLabel("x".repeat(64))).toHaveLength(22);
  });

  it("never repeats a label (CSPRNG suffix, not a counter)", () => {
    const labels = new Set<string>();
    for (let i = 0; i < 500; i++) labels.add(generateFonepayReferenceLabel(ORDER_ID));

    // 40 random bits per label: a collision in 500 draws is ~1 in 1.4 million.
    expect(labels.size).toBe(500);
  });
});

describe("Fonepay amount normalization", () => {
  it("rounds to two decimals inside the documented range", () => {
    expect(toFonepayAmount(100)).toBe(100);
    expect(toFonepayAmount(12.346)).toBe(12.35);
    expect(toFonepayAmount(12.344)).toBe(12.34);
    expect(toFonepayAmount(1.999)).toBe(2);
    expect(toFonepayAmount(FONEPAY_MIN_AMOUNT)).toBe(1);
    expect(toFonepayAmount(FONEPAY_MAX_AMOUNT)).toBe(9_999_999);
  });

  it("rejects amounts Fonepay cannot charge (never a silent 0)", () => {
    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => toFonepayAmount(invalid)).toThrow(/positive server-side amount/);
    }

    expect(() => toFonepayAmount(FONEPAY_MAX_AMOUNT + 1)).toThrow(/between 1 and 9999999/);
    expect(() => toFonepayAmount(0.5)).toThrow(/between 1 and 9999999/);
  });
});

describe("Fonepay status mapping", () => {
  it("maps the documented success vocabulary to Paid", () => {
    for (const raw of ["COMPLETED", "completed", "PAID", "SUCCESS", "SETTLED", "captured"]) {
      expect(mapFonepayStatus(raw)).toBe("Paid");
      expect(isRecognizedFonepayStatus(raw)).toBe(true);
    }
    expect(mapFonepayStatus("  completed  ")).toBe("Paid");
  });

  it("maps recognized pending vocabulary to Pending", () => {
    for (const raw of ["PENDING", "INITIATED", "IN_PROGRESS", "in progress", "processing"]) {
      expect(mapFonepayStatus(raw)).toBe("Pending");
      expect(isRecognizedFonepayStatus(raw)).toBe(true);
    }
  });

  it("maps terminal failures to their order-side status", () => {
    for (const raw of ["FAILED", "failure", "DECLINED", "REJECTED", "error"]) {
      expect(mapFonepayStatus(raw)).toBe("Failed");
    }
    for (const raw of ["CANCELLED", "canceled", "cancel"]) {
      expect(mapFonepayStatus(raw)).toBe("Cancelled");
    }
    for (const raw of ["EXPIRED", "timeout", "timed out", "timedout"]) {
      expect(mapFonepayStatus(raw)).toBe("Expired");
    }
  });

  it("never invents Paid for an unrecognized or blank status (fails closed)", () => {
    for (const raw of ["SOME_FUTURE_UNKNOWN_STATUS", "", "   ", "unknown"]) {
      expect(mapFonepayStatus(raw)).toBe("Pending");
      expect(isRecognizedFonepayStatus(raw)).toBe(false);
    }
  });
});

describe("Fonepay provider verification", () => {
  it("declares NPR and no refund API (documented status-only refunds)", async () => {
    expect(FONEPAY_CURRENCY).toBe("NPR");
    expect(provider.refundCapability()).toBe("UNSUPPORTED");

    const refund = await provider.refund!("FP35e743ff5a0123456789", 100);
    expect(refund.status).toBe("FAILED");
    expect(refund.message).toMatch(/does not document a refund API/i);
    // No provider call may be attempted for an unsupported operation.
    expect(client.getFonepayPaymentStatus).not.toHaveBeenCalled();
  });

  it("marks the payment Paid when reference, terminal and amounts agree", async () => {
    const referenceLabel = generateFonepayReferenceLabel(ORDER_ID);
    client.getFonepayPaymentStatus.mockResolvedValue(statusResponse(referenceLabel));

    const result = await provider.verify(referenceLabel, "");

    expect(client.getFonepayPaymentStatus).toHaveBeenCalledExactlyOnceWith({
      terminalId: client.terminalId,
      referenceLabel,
    });
    expect(result.status).toBe("Paid");
    expect(result.amount).toBe(100.5);
    expect(result.metadata).toMatchObject({
      fonepay: {
        referenceLabel,
        paymentStatus: "COMPLETED",
        // Declared explicitly: Fonepay settles in NPR and its status payload
        // carries no currency field, so the service compares THIS value.
        currency: "NPR",
        transactionId: "987654",
      },
    });
  });

  it("fails closed when the provider echoes a different reference", async () => {
    const referenceLabel = generateFonepayReferenceLabel(ORDER_ID);
    client.getFonepayPaymentStatus.mockResolvedValue(
      statusResponse(referenceLabel, { prn: "SOMEONE-ELSES-PRN" }),
    );

    const result = await provider.verify(referenceLabel, "");

    expect(result.status).toBe("Failed");
    expect(result.amount).toBe(0);
    expect(result.metadata).toMatchObject({ fonepay: { error: "Payment reference mismatch." } });
  });

  it("fails closed when the status belongs to another terminal", async () => {
    const referenceLabel = generateFonepayReferenceLabel(ORDER_ID);
    client.getFonepayPaymentStatus.mockResolvedValue(
      statusResponse(referenceLabel, { merchantCode: "OTHERTERM" }),
    );

    const result = await provider.verify(referenceLabel, "");

    expect(result.status).toBe("Failed");
    expect(result.metadata).toMatchObject({ fonepay: { error: "Payment terminal mismatch." } });
  });

  it("fails closed when the two reported amounts disagree", async () => {
    const referenceLabel = generateFonepayReferenceLabel(ORDER_ID);
    client.getFonepayPaymentStatus.mockResolvedValue(
      statusResponse(referenceLabel, {
        requestedAmount: "100.50",
        totalTransactionAmount: "250.00",
      }),
    );

    const result = await provider.verify(referenceLabel, "");

    expect(result.status).toBe("Failed");
    expect(result.metadata).toMatchObject({
      fonepay: { error: "Fonepay reported amounts disagree." },
    });
  });

  it("leaves an unrecognized provider status Pending — never Paid", async () => {
    const referenceLabel = generateFonepayReferenceLabel(ORDER_ID);
    client.getFonepayPaymentStatus.mockResolvedValue(
      statusResponse(referenceLabel, { paymentStatus: "SOME_FUTURE_UNKNOWN_STATUS" }),
    );

    const result = await provider.verify(referenceLabel, "");

    expect(result.status).toBe("Pending");
  });

  it("exposes the same status through getStatus (polling path)", async () => {
    const referenceLabel = generateFonepayReferenceLabel(ORDER_ID);
    client.getFonepayPaymentStatus.mockResolvedValue(
      statusResponse(referenceLabel, { paymentStatus: "PENDING" }),
    );

    const result = await provider.getStatus(referenceLabel);

    expect(result.status).toBe("Pending");
    // getStatus reports a live snapshot only — it never stamps `verifiedAt`.
    expect(result).not.toHaveProperty("verifiedAt");
  });
});

describe("Fonepay provider initiation", () => {
  it("requests an INTENT_QR for the server amount and returns display data only", async () => {
    client.generateFonepayIntentQr.mockResolvedValue({
      qrString: "FONEPAY-QR-PAYLOAD",
      prn: "PRN-1",
      qrDisplayName: "Example Store",
      websocketId: "wss://fonepay.invalid/ws/1",
      status: "SUCCESS",
    } satisfies FonepayIntentQrResponse);

    const before = Date.now();
    const session = await provider.initiate(100.5, ORDER_ID, {});

    expect(client.generateFonepayIntentQr).toHaveBeenCalledTimes(1);
    const request = client.generateFonepayIntentQr.mock.calls[0]![0];
    expect(request).toMatchObject({
      amount: 100.5,
      billId: ORDER_ID,
      terminalId: client.terminalId,
      paymentMode: "QR",
      qrType: "INTENT_QR",
    });
    expect(request.referenceLabel).toMatch(FONEPAY_REFERENCE_PATTERN);

    // The stored provider transaction id IS the reference label: verification
    // binds the provider response back to it.
    expect(session.providerTransactionId).toBe(request.referenceLabel);
    expect(session.paymentId).toBe("PRN-1");
    expect(session.currency).toBe("NPR");
    // A QR gateway has no redirect: the browser must never be sent anywhere.
    expect(session.paymentUrl).toBe("");
    expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(before + FONEPAY_QR_WAIT_WINDOW_MS);

    const fonepay = (session.metadata as { fonepay: Record<string, unknown> }).fonepay;
    expect(fonepay).toMatchObject({
      referenceLabel: request.referenceLabel,
      qrString: "FONEPAY-QR-PAYLOAD",
      billId: ORDER_ID,
      amount: 100.5,
    });
    // The customer receives a rendered PNG data URL — the QR is display data,
    // never proof of payment.
    expect(fonepay.qrImage).toEqual(expect.stringMatching(/^data:image\/png;base64,/));
  });

  it("rejects an unchargeable amount before calling Fonepay", async () => {
    await expect(provider.initiate(0, ORDER_ID, {})).rejects.toThrow(/positive server-side amount/);
    await expect(provider.initiate(FONEPAY_MAX_AMOUNT + 1, ORDER_ID, {})).rejects.toThrow(
      /between 1 and 9999999/,
    );

    expect(client.generateFonepayIntentQr).not.toHaveBeenCalled();
  });
});

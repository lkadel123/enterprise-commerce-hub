import { describe, expect, it, vi, afterEach } from "vitest";
import { createPublicKey, generateKeyPairSync, sign as cryptoSign } from "node:crypto";

import {
  buildCaptureContextRequest,
  newMerchantReference,
} from "../src/modules/payments/providers/cybersource/cybersource-session.js";
import {
  CybersourceProvider,
  classifyGatewayStatus,
  isReferenceAcceptable,
} from "../src/modules/payments/providers/cybersource/cybersource.provider.js";

/**
 * Regression suite for the "authorized in CyberSource, Failed in our API" bug.
 *
 * ROOT CAUSE: the capture context requested `completeMandate.type: "AUTH"`
 * (authorization-only) while `verify` accepted only AUTH-family statuses, and
 * the merchant reference was read from a single hard-coded token path
 * (`clientReferenceInformation.code`) that Unified Checkout does not
 * guarantee. A genuine, RS256-signature-valid SALE was therefore reported as
 * "Payment verification failed." Both defects are pinned here:
 *
 *  1. the sessions request MUST ask for CAPTURE (SALE) with the reference
 *     echoed into `data.clientReferenceInformation.code`;
 *  2. `verify` MUST map CAPTURED/SALE statuses to Paid and MUST bind the
 *     reference structurally (any carrier, same-order tolerance) — replay
 *     protection stays intact (a foreign order's reference is rejected).
 */

const ORDER_ID = "6ab0cf116e9cc135e743ff5a";
const REFERENCE = `EC-${ORDER_ID}-a1b2c3d4e5f6`;
const FOREIGN_REFERENCE = `EC-5f5a4e3d2c1b0a9988776655-deadbeefcafe`;

describe("Cybersource capture-context mandate (SALE)", () => {
  it("requests authorize+capture (CAPTURE), not authorization-only", () => {
    const request = buildCaptureContextRequest({
      merchantReference: REFERENCE,
      totalAmount: 132.9,
      currency: "usd",
    });
    expect(request.completeMandate).toEqual({ type: "CAPTURE", decisionManager: false });
  });

  it("echoes the merchant reference into data.clientReferenceInformation.code", () => {
    const request = buildCaptureContextRequest({
      merchantReference: REFERENCE,
      totalAmount: 132.9,
      currency: "USD",
    });
    expect(request.data.clientReferenceInformation.code).toBe(REFERENCE);
  });

  it("keeps the amount and currency server-authoritative", () => {
    const request = buildCaptureContextRequest({
      merchantReference: REFERENCE,
      totalAmount: 132.9,
      currency: "usd",
    });
    expect(request.data.orderInformation.amountDetails.totalAmount).toBe("132.90");
    expect(request.data.orderInformation.amountDetails.currency).toBe("USD");
  });

  it("only offers HTTPS target origins to the sessions API", () => {
    const request = buildCaptureContextRequest({
      merchantReference: REFERENCE,
      totalAmount: 132.9,
      currency: "USD",
    });
    expect(request.targetOrigins.length).toBeGreaterThan(0);
    for (const origin of request.targetOrigins) {
      expect(origin.startsWith("https://")).toBe(true);
    }
  });

  it("mints per-attempt references in the EC-<orderId>-<suffix> shape", () => {
    const first = newMerchantReference(ORDER_ID);
    const second = newMerchantReference(ORDER_ID);
    expect(first).toMatch(new RegExp(`^EC-${ORDER_ID}-[0-9a-zA-Z]+$`));
    expect(first).not.toBe(second);
  });
});

describe("Cybersource gateway status classification", () => {
  it("maps the SALE/capture family to Paid", () => {
    for (const status of ["CAPTURED", "SALE", "SETTLED", "PENDING_SETTLEMENT", "COMPLETED"]) {
      expect(classifyGatewayStatus(status)).toBe("Paid");
    }
  });

  it("still maps the authorization-only family to Paid", () => {
    for (const status of ["AUTHORIZED", "TRANSMITTED"]) {
      expect(classifyGatewayStatus(status)).toBe("Paid");
    }
  });

  it("keeps issuer/3-D Secure and review outcomes Pending", () => {
    for (const status of [
      "PENDING",
      "PENDING_AUTHENTICATION",
      "AUTHORIZED_PENDING_REVIEW",
      "CREATED",
      "INITIATED",
    ]) {
      expect(classifyGatewayStatus(status)).toBe("Pending");
    }
  });

  it("normalizes case/whitespace and fails closed on unknown statuses", () => {
    expect(classifyGatewayStatus(" captured ")).toBe("Paid");
    expect(classifyGatewayStatus("DECLINED")).toBe("Failed");
    expect(classifyGatewayStatus("INVALID_ACCOUNT")).toBe("Failed");
    expect(classifyGatewayStatus("")).toBe("Failed");
  });
});

describe("Cybersource merchant-reference binding", () => {
  it("accepts an exact reference match", () => {
    expect(isReferenceAcceptable(REFERENCE, REFERENCE)).toBe(true);
  });

  it("accepts a re-initiated attempt of the SAME order (reload race)", () => {
    const laterAttempt = `EC-${ORDER_ID}-ffff00001111`;
    expect(isReferenceAcceptable(laterAttempt, REFERENCE)).toBe(true);
    expect(isReferenceAcceptable(REFERENCE, laterAttempt)).toBe(true);
  });

  it("rejects a token minted for a DIFFERENT order (replay protection)", () => {
    expect(isReferenceAcceptable(FOREIGN_REFERENCE, REFERENCE)).toBe(false);
    expect(isReferenceAcceptable(REFERENCE, FOREIGN_REFERENCE)).toBe(false);
  });

  it("falls back to strict equality for unknown reference formats", () => {
    expect(isReferenceAcceptable("not-an-ec-reference", "not-an-ec-reference")).toBe(true);
    expect(isReferenceAcceptable("other-value", "not-an-ec-reference")).toBe(false);
  });
});

/**
 * `verify` end-to-end against a REAL RS256-signed token: the JWKS fetch is
 * stubbed with a locally generated RSA key so the signature path, the
 * reference binding and the status classification are all exercised exactly
 * as in production — no token-verification logic is mocked away.
 */
describe("CybersourceProvider.verify (signed response token)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const exportedJwk = createPublicKey(privateKey).export({ format: "jwk" });
  const publicJwk = { kty: "RSA", n: exportedJwk.n, e: exportedJwk.e };

  function signToken(claims: Record<string, unknown>): string {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const header = encode({ alg: "RS256", kid: "test-kid-123", typ: "JWT" });
    const payload = encode(claims);
    const signature = cryptoSign("RSA-SHA256", Buffer.from(`${header}.${payload}`, "utf8"), privateKey);
    return `${header}.${payload}.${signature.toString("base64url")}`;
  }

  function stubJwks(): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => publicJwk })),
    );
  }

  const provider = new CybersourceProvider();

  it("marks a signature-valid CAPTURED sale as Paid with the CyberSource transaction id", async () => {
    stubJwks();
    const result = await provider.verify(REFERENCE, "", {
      responseToken: signToken({
        id: "7012345678901234500001",
        reconciliationId: "789012345678",
        status: "CAPTURED",
        clientReferenceInformation: { code: REFERENCE },
        orderInformation: { amountDetails: { totalAmount: "132.90", currency: "USD" } },
      }),
    });
    expect(result.status).toBe("Paid");
    expect(result.amount).toBe(132.9);
    expect(result.metadata?.transactionId).toBe("7012345678901234500001");
    expect(result.metadata?.gatewayStatus).toBe("CAPTURED");
  });

  it("maps a settled SALE status to Paid", async () => {
    stubJwks();
    const result = await provider.verify(REFERENCE, "", {
      responseToken: signToken({
        status: "SALE",
        clientReferenceInformation: { code: REFERENCE },
        orderInformation: { amountDetails: { totalAmount: "132.90", currency: "USD" } },
      }),
    });
    expect(result.status).toBe("Paid");
  });

  it("parses the REAL Unified Checkout nested details.* response shape", async () => {
    // Captured live from a sandbox complete-mandate (CAPTURE) response token:
    // the transaction response rides under `details`, NOT at the top level —
    // reading only the flat shape turned genuine sales into amount 0 and
    // "Payment verification failed."
    stubJwks();
    const result = await provider.verify(REFERENCE, "", {
      responseToken: signToken({
        id: "7899897824866628204009",
        message: "Payment approved",
        status: "AUTHORIZED",
        metadata: { ccJti: "cc-jti", ttJti: "tt-jti" },
        details: {
          clientReferenceInformation: { code: REFERENCE },
          orderInformation: {
            amountDetails: {
              authorizedAmount: "74.85",
              totalAmount: "74.85",
              currency: "USD",
            },
          },
          processorInformation: {
            approvalCode: "831000",
            responseCode: "100",
            transactionId: "712X9Y8Z7654321",
          },
          reconciliationId: "789012345678",
          submitTimeUtc: "2026-09-21T11:23:00.000Z",
        },
      }),
    });
    expect(result.status).toBe("Paid");
    expect(result.amount).toBe(74.85);
    expect(result.metadata?.transactionId).toBe("7899897824866628204009");
    expect(result.metadata?.reconciliationId).toBe("789012345678");
    expect(result.metadata?.approvalCode).toBe("831000");
    expect(result.metadata?.processorResponseCode).toBe("100");
    expect(result.metadata?.currency).toBe("USD");
  });

  it("falls back to authorizedAmount when totalAmount is absent", async () => {
    stubJwks();
    const result = await provider.verify(REFERENCE, "", {
      responseToken: signToken({
        status: "CAPTURED",
        clientReferenceInformation: { code: REFERENCE },
        details: {
          orderInformation: { amountDetails: { authorizedAmount: "25.00", currency: "USD" } },
        },
      }),
    });
    expect(result.status).toBe("Paid");
    expect(result.amount).toBe(25);
  });

  it("accepts a token whose reference rides a nested carrier (structural binding)", async () => {
    stubJwks();
    const result = await provider.verify(REFERENCE, "", {
      responseToken: signToken({
        status: "CAPTURED",
        metadata: { clientReferenceInformation: { code: REFERENCE } },
        orderInformation: { amountDetails: { totalAmount: "132.90", currency: "USD" } },
      }),
    });
    expect(result.status).toBe("Paid");
  });

  it("accepts a same-order reference from an earlier attempt", async () => {
    stubJwks();
    const result = await provider.verify(REFERENCE, "", {
      responseToken: signToken({
        status: "CAPTURED",
        clientReferenceInformation: { code: `EC-${ORDER_ID}-previous1` },
        orderInformation: { amountDetails: { totalAmount: "132.90", currency: "USD" } },
      }),
    });
    expect(result.status).toBe("Paid");
  });

  it("accepts a token that carries no reference at all (signature + amount bind)", async () => {
    stubJwks();
    const result = await provider.verify(REFERENCE, "", {
      responseToken: signToken({
        status: "CAPTURED",
        orderInformation: { amountDetails: { totalAmount: "132.90", currency: "USD" } },
      }),
    });
    expect(result.status).toBe("Paid");
  });

  it("rejects a token minted for a foreign order (replay protection)", async () => {
    stubJwks();
    const result = await provider.verify(REFERENCE, "", {
      responseToken: signToken({
        status: "CAPTURED",
        clientReferenceInformation: { code: FOREIGN_REFERENCE },
        orderInformation: { amountDetails: { totalAmount: "132.90", currency: "USD" } },
      }),
    });
    expect(result.status).toBe("Failed");
    expect(result.metadata?.reason).toBe("Payment result does not match this order.");
  });

  it("keeps issuer-decision outcomes Pending, not Failed", async () => {
    stubJwks();
    const result = await provider.verify(REFERENCE, "", {
      responseToken: signToken({
        status: "PENDING_AUTHENTICATION",
        clientReferenceInformation: { code: REFERENCE },
        orderInformation: { amountDetails: { totalAmount: "132.90", currency: "USD" } },
      }),
    });
    expect(result.status).toBe("Pending");
  });

  it("fails closed on a declined transaction", async () => {
    stubJwks();
    const result = await provider.verify(REFERENCE, "", {
      responseToken: signToken({
        status: "DECLINED",
        clientReferenceInformation: { code: REFERENCE },
        errorInformation: { reason: "declined" },
      }),
    });
    expect(result.status).toBe("Failed");
    expect(result.amount).toBe(0);
  });

  it("rejects a tampered (signature-invalid) token", async () => {
    stubJwks();
    const token = signToken({
      status: "CAPTURED",
      clientReferenceInformation: { code: REFERENCE },
    });
    const [header, payload] = token.split(".");
    const result = await provider.verify(REFERENCE, "", {
      responseToken: `${header}.${payload}.c2lnbmF0dXJlLWZvcmdlcnk`,
    });
    expect(result.status).toBe("Failed");
    expect(result.metadata?.reason).toBe("Payment result token is invalid.");
  });

  it("fails fast when no response token is supplied", async () => {
    const result = await provider.verify(REFERENCE, "", {});
    expect(result.status).toBe("Failed");
    expect(result.metadata?.reason).toBe("Payment result token is missing.");
  });
});

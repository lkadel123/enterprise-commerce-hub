import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ordersApi } from "@/lib/api/orders";
import { customerPaymentsApi } from "@/lib/api/payments";
import { setAccessToken } from "@/lib/api/client";
import { recordedBodies, resetCommerceState } from "@/test/handlers/commerce";
import { server } from "@/test/server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/**
 * SECURITY REGRESSION (architecture §24): the storefront must never send
 * client-controlled financial fields. The backend derives identity from the
 * session and computes all amounts server-side; its `.strict()` validators
 * reject unknown fields. These tests pin the request bodies at the client
 * boundary so a future regression (e.g. sending a computed total) fails CI.
 */
describe("financial field exclusion", () => {
  const FINANCIAL_FIELDS = [
    "amount",
    "total",
    "subtotal",
    "payable",
    "discount",
    "discountAmount",
    "tax",
    "taxAmount",
    "shippingFee",
    "price",
    "paymentStatus",
    "status",
    "customerId",
  ];

  function assertNoFinancialFields(body: unknown): void {
    expect(body).toBeTypeOf("object");
    for (const field of FINANCIAL_FIELDS) {
      expect(body).not.toHaveProperty(field);
    }
  }

  beforeEach(() => {
    resetCommerceState();
    setAccessToken("tok-owner");
  });

  it("order creation sends only opaque identifiers/strings", async () => {
    await ordersApi.create({
      items: [{ productId: "prod-1", quantity: 2 }],
      paymentMethod: "Cash on Delivery",
      notes: "leave at door",
    } as Parameters<typeof ordersApi.create>[0]);
    const [body] = recordedBodies["order/create"] ?? [];
    expect(body).toBeDefined();
    assertNoFinancialFields(body);
    const b = body as Record<string, unknown>;
    // Only legitimate fields present:
    for (const key of Object.keys(b)) {
      expect(["items", "paymentMethod", "couponCode", "notes", "address"].includes(key)).toBe(true);
    }
  });

  it("payment initiation sends only the gateway choice", async () => {
    await customerPaymentsApi.initiate("order-1", "CYBERSOURCE");
    const [body] = recordedBodies["payment/initiate"] ?? [];
    expect(body).toEqual({ gateway: "CYBERSOURCE" });
  });

  it("payment verification sends only gateway + provider transaction id", async () => {
    await customerPaymentsApi.verify("order-1", {
      gateway: "CYBERSOURCE",
      providerTransactionId: "cs-42",
    });
    const [body] = recordedBodies["payment/verify"] ?? [];
    assertNoFinancialFields(body);
    expect(body).toMatchObject({ gateway: "CYBERSOURCE", providerTransactionId: "cs-42" });
  });

  it("cart merge sends only productId/quantity pairs", async () => {
    const { apiFetch } = await import("@/lib/api/client");
    await apiFetch("/cart/merge", {
      method: "POST",
      body: { items: [{ productId: "p1", quantity: 2 }] },
    });
    const [body] = recordedBodies["cart/merge"] ?? [];
    expect(body).toEqual({ items: [{ productId: "p1", quantity: 2 }] });
    for (const item of (body as { items: Array<Record<string, unknown>> }).items) {
      expect(Object.keys(item).sort()).toEqual(["productId", "quantity"]);
    }
  });

  it("payment responses come back as authoritative data (client never computes state)", async () => {
    const result = await customerPaymentsApi.getStatus("order-1");
    expect(result.data.payment.status).toBeTypeOf("string");
  });
});

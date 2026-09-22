/**
 * MSW integration tests for the storefront API clients (Phase 11).
 *
 * Exercises the real client modules against handlers that mirror the backend
 * customer routers, including:
 * - happy paths for every account domain
 * - 401 (unauthenticated) and validation-error contracts
 * - server-authoritative payment/order construction: request bodies must never
 *   contain client-controlled financial fields
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { API_BASE_URL } from "@/config/env";
import { fail, ok } from "@/test/fixtures/catalog";
import { resetAuthState } from "@/test/handlers/auth";
import { recordedBodies, resetCommerceState } from "@/test/handlers/commerce";
import { recordedAccountBodies, resetAccountState } from "@/test/handlers/account";
import { server } from "@/test/server";

import { setAccessToken } from "./client";
import { addressesApi } from "./addresses";
import { notificationsApi } from "./notifications";
import { supportApi } from "./support";
import { reviewsApi } from "./reviews";
import { couponsApi } from "./coupons";
import { ordersApi } from "./orders";
import { customerPaymentsApi } from "./payments";

const FINANCIAL_KEYS = [
  "amount",
  "total",
  "payable",
  "subtotal",
  "discount",
  "taxAmount",
  "shippingFee",
  "paymentStatus",
  "status",
];

function assertNoFinancialFields(body: unknown): void {
  if (body === null || typeof body !== "object") return;
  for (const key of Object.keys(body as Record<string, unknown>)) {
    expect(FINANCIAL_KEYS).not.toContain(key);
  }
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  resetAuthState();
  resetCommerceState();
  resetAccountState();
  // Authenticated requests: publish an in-memory token directly.
  setAccessToken("test-access-token");
});

afterEach(() => {
  setAccessToken(null);
});

describe("addresses API", () => {
  it("lists saved addresses", async () => {
    const res = await addressesApi.list();
    expect(res.success).toBe(true);
    expect(res.data[0]!).toMatchObject({ city: "Kathmandu", country: "Nepal" });
  });

  it("creates an address with only location fields", async () => {
    const res = await addressesApi.create({
      label: "Office",
      line1: "9 Durbar Marg",
      city: "Kathmandu",
      postalCode: "44600",
      country: "Nepal",
    });
    expect(res.success).toBe(true);
    const body = (recordedAccountBodies["address/create"]?.[0] ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(body)) {
      expect([
        "label",
        "line1",
        "line2",
        "city",
        "state",
        "postalCode",
        "country",
        "isDefault",
      ]).toContain(key);
    }
  });

  it("updates and deletes an address by id", async () => {
    const updated = await addressesApi.update("addr-1", { city: "Lalitpur" });
    expect(updated.data.city).toBe("Lalitpur");
    const deleted = await addressesApi.remove("addr-1");
    expect(deleted.data.deleted).toBe(true);
  });

  it("surfaces 401 when unauthenticated", async () => {
    setAccessToken(null);
    await expect(addressesApi.list()).rejects.toMatchObject({ status: 401 });
  });
});

describe("notifications API", () => {
  it("lists notifications with pagination meta", async () => {
    const res = await notificationsApi.list({ unread: true });
    expect(res.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(res.data[0]!.read).toBe(false);
  });

  it("reads the unread badge count", async () => {
    const res = await notificationsApi.getUnreadCount();
    expect(res.data.count).toBe(1);
  });

  it("marks one/all read and deletes a notification", async () => {
    const one = await notificationsApi.markRead("ntf-1");
    expect(one.data.read).toBe(true);
    const all = await notificationsApi.markAllRead();
    expect(all.data.updated).toBe(1);
    const del = await notificationsApi.delete("ntf-1");
    expect(del.data.deleted).toBe(true);
  });
});

describe("support API", () => {
  it("creates a conversation without identity fields (server-forced)", async () => {
    const res = await supportApi.createConversation({
      subject: "Damaged item",
      initialMessage: "The box arrived crushed.",
    });
    expect(res.success).toBe(true);
    const body = (recordedAccountBodies["support/create"]?.[0] ?? {}) as Record<string, unknown>;
    expect(body.senderType).toBeUndefined();
    expect(body.customerId).toBeUndefined();
  });

  it("lists conversations, reads messages and replies", async () => {
    const list = await supportApi.listConversations();
    expect(list.data[0]!).toMatchObject({ id: "conv-1" });
    const messages = await supportApi.getMessages("conv-1");
    expect(messages.data[0]!.senderType).toBe("customer");
    await supportApi.sendMessage("conv-1", "Any update?");
    expect(recordedAccountBodies["support/message"]?.[0]).toEqual({ message: "Any update?" });
  });
});

describe("reviews API", () => {
  it("submits a review that the server forces to Pending", async () => {
    const res = await reviewsApi.create({
      orderId: "order-1",
      productId: "prod-2",
      rating: 4,
      body: "Solid keyboard.",
    });
    expect(res.success).toBe(true);
    const body = (recordedAccountBodies["review/create"]?.[0] ?? {}) as Record<string, unknown>;
    // G18-02: the client must send only the delivered-order context + content,
    // never moderation state or financials.
    expect(body.orderId).toBe("order-1");
    expect(body.status).toBeUndefined();
    assertNoFinancialFields(body);
  });

  it("lists the customer's own reviews", async () => {
    const res = await reviewsApi.list();
    expect(res.data).toHaveLength(1);
  });
});

describe("coupons API", () => {
  it("validates a coupon sending only {code}", async () => {
    const res = await couponsApi.validate({ code: "SAVE10" });
    expect(res.data).toEqual({ valid: true, code: "SAVE10" });
    const body = (recordedAccountBodies["coupon/validate"]?.[0] ?? {}) as Record<string, unknown>;
    // Strict backend contract — a financial field would be rejected with 422.
    expect(Object.keys(body)).toEqual(["code"]);
  });

  it("receives 422 when extra (e.g. financial) keys are smuggled in", async () => {
    server.use(
      http.post(`${API_BASE_URL}/customer/coupons/validate`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(fail("VALIDATION_ERROR", "Unrecognized key"), {
          status: Object.keys(body).some((k) => k !== "code") ? 422 : 200,
        });
      }),
    );
    await expect(
      couponsApi.validate({ code: "SAVE10", amount: 100 } as never),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("reports invalid coupons with the backend error contract", async () => {
    await expect(couponsApi.validate({ code: "NOPE01" })).rejects.toMatchObject({
      status: 404,
      code: "COUPON_INVALID",
    });
  });

  it("lists the customer's usable coupons", async () => {
    const res = await couponsApi.list({ page: 1 });
    expect(res.data[0]!).toMatchObject({ code: "SAVE10" });
  });
});

describe("orders & payments security contract", () => {
  it("creates orders carrying only opaque identifiers", async () => {
    await ordersApi.create({
      items: [{ productId: "prod-1", quantity: 2 }],
      shippingAddress: { line1: "12 Thamel Road", city: "Kathmandu", country: "Nepal" },
      paymentMethod: "Cash on Delivery",
    } as never);
    const body = (recordedBodies["order/create"]?.[0] ?? {}) as Record<string, unknown>;
    assertNoFinancialFields(body);
    for (const key of Object.keys(body)) {
      expect(["items", "shippingAddress", "paymentMethod", "couponCode", "notes"]).toContain(key);
    }
  });

  it("initiates payments sending only {gateway} — amount stays server-side", async () => {
    await customerPaymentsApi.initiate("order-1", "CYBERSOURCE");
    expect(recordedBodies["payment/initiate"]?.[0]).toEqual({ gateway: "CYBERSOURCE" });
  });

  it("verifies payments with only gateway + provider transaction id", async () => {
    const res = await customerPaymentsApi.verify("order-1", {
      gateway: "CYBERSOURCE",
      providerTransactionId: "cs-123",
    });
    expect(res.success).toBe(true);
    expect(recordedBodies["payment/verify"]?.[0]).toEqual({
      gateway: "CYBERSOURCE",
      providerTransactionId: "cs-123",
    });
  });

  it("reads authoritative payment status", async () => {
    const res = await customerPaymentsApi.getStatus("order-1");
    expect(res.data.payment.status).toBe("Initiated");
  });

  it("propagates 403 for another customer's order (IDOR surface)", async () => {
    server.use(
      http.get(`${API_BASE_URL}/customer/orders/other-order`, () =>
        HttpResponse.json(fail("FORBIDDEN", "Not your order."), { status: 403 }),
      ),
    );
    await expect(ordersApi.getById("other-order")).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
  });
});

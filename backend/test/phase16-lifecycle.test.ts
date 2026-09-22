import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import {
  getApp,
  seedCatalog,
  seedProduct,
  seedInventory,
  seedCustomerAccount,
  customerAccessTokenFor,
  userTokenFor,
} from "./helpers/fixtures.js";
import { InventoryModel } from "../src/modules/inventory/inventory.model.js";
import { OrderModel } from "../src/modules/orders/order.model.js";
import { NotificationModel } from "../src/modules/notifications/notification.model.js";
import { orderService } from "../src/modules/orders/order.service.js";
import { orderRepository } from "../src/modules/orders/order.repository.js";
import { paymentProviderMap } from "../src/modules/payments/payment.providers.js";
import type { PaymentProviderInterface } from "../src/modules/payments/payment.provider.js";


const app = getApp();

async function seedCommerce(price = 100) {
  const { category, brand } = await seedCatalog();
  const product = await seedProduct(category._id, brand._id, { sku: `P16-${price}`, price });
  await seedInventory(product._id, `P16-${price}`);
  return { product };
}

async function placeOrder(
  account: { _id: { toString(): string } },
  productId: string,
  opts: { key?: string; qty?: number } = {},
) {
  const { header } = customerAccessTokenFor(account);
  return request(app)
    .post("/api/v1/customer/orders")
    .set(header)
    .set(opts.key ? { "Idempotency-Key": opts.key } : {})
    .send({
      items: [{ productId, quantity: opts.qty ?? 1 }],
      paymentMethod: "Digital Wallet",
    });
}

async function invFor(productId: string) {
  return InventoryModel.findOne({ product: productId, warehouse: "Rotterdam DC" })
    .lean()
    .exec() as Promise<{ stock: number; reserved: number } | null>;
}

async function markPaid(orderId: string, provider = "FONEPAY") {
  await OrderModel.updateOne(
    { _id: orderId },
    {
      $set: {
        "payment.status": "Paid",
        "payment.provider": provider,
        "payment.providerTransactionId": `pb-${orderId}`,
        "payment.amount": 120,
        "payment.paidAt": new Date(),
      },
    },
  );
}

function withMockProvider(key: "FONEPAY", fake: PaymentProviderInterface) {
  const original = paymentProviderMap[key];
  paymentProviderMap[key] = fake;
  return () => {
    paymentProviderMap[key] = original;
  };
}

function paidVerification(amountPaisa: number): PaymentProviderInterface {
  return {
    initiate: vi.fn(),
    verify: vi.fn().mockResolvedValue({
      status: "Paid",
      amount: amountPaisa,
      verifiedAt: new Date(),
      metadata: {},
    }),
    getStatus: vi.fn(),
    refundCapability: () => "UNSUPPORTED" as const,
  } as unknown as PaymentProviderInterface;
}

describe("Phase 16 - order lifecycle", () => {
  beforeAll(async () => {
    await connect();
  });
  beforeEach(async () => {
    await clearDatabase();
  });
  afterAll(async () => {
    await disconnect();
  });

  describe("16B order creation idempotency", () => {
    it("returns the SAME order for a retried request with the same key", async () => {
      const { product } = await seedCommerce();
      const account = await seedCustomerAccount();
      const first = await placeOrder(account, product._id.toString(), { key: "idem-1" });
      expect(first.status).toBe(201);
      const second = await placeOrder(account, product._id.toString(), { key: "idem-1" });
      expect(second.status).toBe(201);
      expect(second.body.data.id).toBe(first.body.data.id);
      expect(await OrderModel.countDocuments()).toBe(1);
    });

    it("rejects the same key with a materially different payload", async () => {
      const { product } = await seedCommerce();
      const account = await seedCustomerAccount();
      const first = await placeOrder(account, product._id.toString(), { key: "idem-2" });
      expect(first.status).toBe(201);
      const second = await placeOrder(account, product._id.toString(), { key: "idem-2", qty: 2 });
      expect(second.status).toBe(400);
      expect(await OrderModel.countDocuments()).toBe(1);
    });

    it("creates a single order under concurrent duplicate requests", async () => {
      const { product } = await seedCommerce();
      const account = await seedCustomerAccount();
      const results = await Promise.all([
        placeOrder(account, product._id.toString(), { key: "race-1" }),
        placeOrder(account, product._id.toString(), { key: "race-1" }),
        placeOrder(account, product._id.toString(), { key: "race-1" }),
      ]);
      const ids = new Set(results.map((r) => r.body.data?.id).filter(Boolean));
      expect(ids.size).toBe(1);
      expect(await OrderModel.countDocuments()).toBe(1);
      const inv = await invFor(product._id.toString());
      expect(inv?.reserved).toBe(1);
    });

    it("scopes the key per customer (same key, different customers)", async () => {
      const { product } = await seedCommerce();
      const a = await seedCustomerAccount({ email: "a@test.com" });
      const b = await seedCustomerAccount({ email: "b@test.com" });
      const ra = await placeOrder(a, product._id.toString(), { key: "shared" });
      const rb = await placeOrder(b, product._id.toString(), { key: "shared" });
      expect(ra.body.data.id).not.toBe(rb.body.data.id);
      expect(await OrderModel.countDocuments()).toBe(2);
    });

    it("does not permanently consume the key when creation fails", async () => {
      const { product } = await seedCommerce();
      const account = await seedCustomerAccount();
      // Oversized qty fails inventory validation, so no order is created.
      const failed = await placeOrder(account, product._id.toString(), {
        key: "fail-key",
        qty: 999,
      });
      expect(failed.status).toBe(400);
      const ok = await placeOrder(account, product._id.toString(), { key: "fail-key" });
      expect(ok.status).toBe(201);
    });
  });

  describe("16C payment/order expiry + inventory release", () => {
    async function expiredOrder(productId: string) {
      const account = await seedCustomerAccount();
      const res = await placeOrder(account, productId);
      const orderId = res.body.data.id;
      await OrderModel.updateOne(
        { _id: orderId },
        { $set: { expiresAt: new Date(Date.now() - 60_000) } },
      );
      return orderId;
    }

    it("expires a past-deadline pending order and releases its reservation", async () => {
      const { product } = await seedCommerce();
      const orderId = await expiredOrder(product._id.toString());
      const { expired } = await orderService.expirePendingOrders();
      expect(expired).toContain(orderId);
      const order = await OrderModel.findById(orderId).lean();
      expect(order?.status).toBe("Expired");
      expect(order?.payment.status).toBe("Expired");
      const inv = await invFor(product._id.toString());
      expect(inv?.reserved).toBe(0);
      expect(inv?.stock).toBe(100);
    });

    it("leaves non-expired orders untouched", async () => {
      const { product } = await seedCommerce();
      const account = await seedCustomerAccount();
      const res = await placeOrder(account, product._id.toString());
      const { expired } = await orderService.expirePendingOrders();
      expect(expired).toHaveLength(0);
      const order = await OrderModel.findById(res.body.data.id).lean();
      expect(order?.status).toBe("Pending");
    });

    it("never expires a paid order", async () => {
      const { product } = await seedCommerce();
      const orderId = await expiredOrder(product._id.toString());
      await markPaid(orderId);
      const { expired } = await orderService.expirePendingOrders();
      expect(expired).toHaveLength(0);
      const order = await OrderModel.findById(orderId).lean();
      expect(order?.status).toBe("Pending");
      expect(order?.payment.status).toBe("Paid");
    });

    it("is idempotent on repeated expiry runs", async () => {
      const { product } = await seedCommerce();
      await expiredOrder(product._id.toString());
      const first = await orderService.expirePendingOrders();
      expect(first.expired).toHaveLength(1);
      const second = await orderService.expirePendingOrders();
      expect(second.expired).toHaveLength(0);
      const inv = await invFor(product._id.toString());
      expect(inv?.reserved).toBe(0);
    });

    it("does not allow an expired order to become Paid afterwards", async () => {
      const { product } = await seedCommerce();
      const orderId = await expiredOrder(product._id.toString());
      await orderService.expirePendingOrders();
      const result = await orderRepository.markPaidIfPayable(orderId);
      expect(result).toBeNull();
      const order = await OrderModel.findById(orderId).lean();
      expect(order?.payment.status).toBe("Expired");
    });
  });

  it("keeps reserved <= stock under concurrent expiry and payment verification", async () => {
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount();
    const res = await placeOrder(account, product._id.toString());
    const orderId = res.body.data.id;
    const total = res.body.data.amounts.total;
    await OrderModel.updateOne(
      { _id: orderId },
      {
        $set: {
          expiresAt: new Date(Date.now() - 60_000),
          "payment.status": "Initiated",
          "payment.provider": "FONEPAY",
          "payment.providerTransactionId": "pb-race",
        },
      },
    );

    const restore = withMockProvider("FONEPAY", paidVerification(total));
    try {
      const { header } = customerAccessTokenFor(account);
      const [, verifyRes] = await Promise.all([
        orderService.expirePendingOrders(),
        request(app)
          .post(`/api/v1/customer/payments/${orderId}/verify`)
          .set(header)
          .send({ gateway: "FONEPAY", providerTransactionId: "pb-race" }),
      ]);

      const order = await OrderModel.findById(orderId).lean();
      const inv = await invFor(product._id.toString());
      expect(inv && inv.reserved <= inv.stock).toBe(true);
      // Mutually exclusive resolution: either expiry won or verification won.
      if (order?.status === "Expired") {
        expect(order.payment.status).toBe("Expired");
        expect(verifyRes.status).toBe(400);
        expect(inv?.reserved).toBe(0);
      } else {
        expect(order?.payment.status).toBe("Paid");
      }
    } finally {
      restore();
    }
  });

  describe("16D/16G cancellation consistency + notifications", () => {
    it("cancels an unpaid pending order, releases stock, and notifies once", async () => {
      const { product } = await seedCommerce();
      const account = await seedCustomerAccount();
      const res = await placeOrder(account, product._id.toString());
      const orderId = res.body.data.id;
      const { header } = await userTokenFor();

      const cancel = await request(app)
        .post(`/api/v1/orders/${orderId}/cancel`)
        .set(header)
        .send({ reason: "customer request" });
      expect(cancel.status).toBe(200);
      expect(cancel.body.data.status).toBe("Cancelled");

      const inv = await invFor(product._id.toString());
      expect(inv?.reserved).toBe(0);

      const notes = await NotificationModel.find({ type: "order_cancelled" }).lean();
      expect(notes).toHaveLength(1);
      expect(notes[0].recipientId.toString()).toBe(account._id.toString());
      expect(notes[0].entityId).toBe(orderId);
    });

    it("refuses to cancel a paid order (money must move via refund)", async () => {
      const { product } = await seedCommerce();
      const account = await seedCustomerAccount();
      const res = await placeOrder(account, product._id.toString());
      await markPaid(res.body.data.id);
      const { header } = await userTokenFor();
      const cancel = await request(app)
        .post(`/api/v1/orders/${res.body.data.id}/cancel`)
        .set(header)
        .send({});
      expect(cancel.status).toBe(400);
      const order = await OrderModel.findById(res.body.data.id).lean();
      expect(order?.status).toBe("Pending");
    });

    it("keeps invalid state transitions impossible", async () => {
      const { product } = await seedCommerce();
      const account = await seedCustomerAccount();
      const res = await placeOrder(account, product._id.toString());
      const { header } = await userTokenFor();
      const jump = await request(app)
        .patch(`/api/v1/orders/${res.body.data.id}/status`)
        .set(header)
        .send({ status: "Delivered" });
      expect(jump.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------- 16E
  describe("16E refund through the provider abstraction", () => {
    async function shippedPaidOrder(productId: string) {
      const account = await seedCustomerAccount();
      const res = await placeOrder(account, productId);
      const orderId = res.body.data.id as string;
      await markPaid(orderId);
      await OrderModel.updateOne({ _id: orderId }, { $set: { status: "Shipped" } });
      return orderId;
    }

    it("refunds a paid shipped order via the gateway and records the provider ref", async () => {
      const { product } = await seedCommerce();
      const orderId = await shippedPaidOrder(product._id.toString());
      const fake = {
        initiate: vi.fn(),
        verify: vi.fn(),
        getStatus: vi.fn(),
        refundCapability: () => "SUPPORTED" as const,
        refund: vi.fn(async () => ({ status: "SUCCESS", providerRef: "ref-123" })),
      } as unknown as PaymentProviderInterface;
      const restore = withMockProvider("FONEPAY", fake);
      try {
        const { header } = await userTokenFor();
        const res = await request(app)
          .post(`/api/v1/orders/${orderId}/refund`)
          .set(header)
          .send({ reason: "damaged" });
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe("Refunded");
        expect(res.body.data.payment.status).toBe("Refunded");
        expect(res.body.data.refund.status).toBe("SUCCESS");
        expect(res.body.data.refund.providerRef).toBe("ref-123");
        expect(fake.refund).toHaveBeenCalledWith(`pb-${orderId}`, 120);
        const inv = await invFor(product._id.toString());
        expect(inv?.reserved).toBe(0);
      } finally {
        restore();
      }
    });

    it("does NOT mark Refunded when the gateway rejects, and allows retry", async () => {
      const { product } = await seedCommerce();
      const orderId = await shippedPaidOrder(product._id.toString());
      let ok = false;
      const fake = {
        initiate: vi.fn(),
        verify: vi.fn(),
        getStatus: vi.fn(),
        refundCapability: () => "SUPPORTED" as const,
        refund: vi.fn(async () => {
          if (!ok) throw new Error("gateway down");
          return { status: "SUCCESS", providerRef: "ref-2" };
        }),
      } as unknown as PaymentProviderInterface;
      const restore = withMockProvider("FONEPAY", fake);
      try {
        const { header } = await userTokenFor();
        const fail = await request(app)
          .post(`/api/v1/orders/${orderId}/refund`)
          .set(header)
          .send({});
        expect(fail.status).toBe(503);
        const order = await OrderModel.findById(orderId).lean();
        expect(order?.status).toBe("Shipped");
        expect(order?.refund?.status).toBe("FAILED");

        ok = true;
        const retry = await request(app)
          .post(`/api/v1/orders/${orderId}/refund`)
          .set(header)
          .send({});
        expect(retry.status).toBe(200);
        expect(retry.body.data.status).toBe("Refunded");
      } finally {
        restore();
      }
    });

    it("is idempotent: a completed refund is never executed twice", async () => {
      const { product } = await seedCommerce();
      const orderId = await shippedPaidOrder(product._id.toString());
      let calls = 0;
      const fake = {
        initiate: vi.fn(),
        verify: vi.fn(),
        getStatus: vi.fn(),
        refundCapability: () => "SUPPORTED" as const,
        refund: vi.fn(async () => {
          calls += 1;
          return { status: "SUCCESS", providerRef: "r" };
        }),
      } as unknown as PaymentProviderInterface;
      const restore = withMockProvider("FONEPAY", fake);
      try {
        const { header } = await userTokenFor();
        const first = await request(app)
          .post(`/api/v1/orders/${orderId}/refund`)
          .set(header)
          .send({});
        expect(first.status).toBe(200);
        const second = await request(app)
          .post(`/api/v1/orders/${orderId}/refund`)
          .set(header)
          .send({});
        expect(second.status).toBe(200);
        expect(calls).toBe(1);
      } finally {
        restore();
      }
    });

    it("rejects refund amounts above the paid amount and unpaid refunds", async () => {
      const { product } = await seedCommerce();
      const orderId = await shippedPaidOrder(product._id.toString());
      const { header } = await userTokenFor();

      const tooMuch = await request(app)
        .post(`/api/v1/orders/${orderId}/refund`)
        .set(header)
        .send({ amount: 999999 });
      expect(tooMuch.status).toBe(400);

      // Unpaid shipped order.
      const other = await seedCustomerAccount();
      const res2 = await placeOrder(other, product._id.toString());
      await OrderModel.updateOne(
        { _id: res2.body.data.id },
        { $set: { status: "Shipped", "payment.status": "Pending" } },
      );
      const unpaid = await request(app)
        .post(`/api/v1/orders/${res2.body.data.id}/refund`)
        .set(header)
        .send({});
      expect(unpaid.status).toBe(400);
      const order = await OrderModel.findById(res2.body.data.id).lean();
      expect(order?.status).toBe("Shipped");
    });

    it("performs a documented status-only refund when the provider is UNSUPPORTED", async () => {
      const { product } = await seedCommerce();
      const orderId = await shippedPaidOrder(product._id.toString());
      const { header } = await userTokenFor();
      const out = await request(app)
        .post(`/api/v1/orders/${orderId}/refund`)
        .set(header)
        .send({});
      expect(out.status).toBe(200);
      expect(out.body.data.status).toBe("Refunded");
      expect(out.body.data.refund.status).toBe("UNSUPPORTED");
      expect(out.body.data.refund.providerRef ?? null).toBeNull();
    });
  });

  describe("16F payment verification safety", () => {
    it("can never convert a Cancelled order into Paid", async () => {
      const { product } = await seedCommerce();
      const account = await seedCustomerAccount();
      const res = await placeOrder(account, product._id.toString());
      const orderId = res.body.data.id;
      await OrderModel.updateOne(
        { _id: orderId },
        {
          $set: {
            "payment.status": "Initiated",
            "payment.provider": "FONEPAY",
            "payment.providerTransactionId": "pb-c",
          },
        },
      );
      const { header: admin } = await userTokenFor();
      await request(app).post(`/api/v1/orders/${orderId}/cancel`).set(admin).send({});

      const fake = paidVerification(12000);
      const restore = withMockProvider("FONEPAY", fake);
      try {
        const { header } = customerAccessTokenFor(account);
        const verify = await request(app)
          .post(`/api/v1/customer/payments/${orderId}/verify`)
          .set(header)
          .send({ gateway: "FONEPAY", providerTransactionId: "pb-c" });
        expect(verify.status).toBe(400);
        const order = await OrderModel.findById(orderId).lean();
        expect(order?.status).toBe("Cancelled");
        expect(order?.payment.status).not.toBe("Paid");
        expect(fake.verify).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });

    it("rejects verification with a wrong amount and never marks Paid", async () => {
      const { product } = await seedCommerce();
      const account = await seedCustomerAccount();
      const res = await placeOrder(account, product._id.toString());
      const orderId = res.body.data.id;
      await OrderModel.updateOne(
        { _id: orderId },
        {
          $set: {
            "payment.status": "Initiated",
            "payment.provider": "FONEPAY",
            "payment.providerTransactionId": "pb-a",
          },
        },
      );
      const restore = withMockProvider("FONEPAY", paidVerification(1));
      try {
        const { header } = customerAccessTokenFor(account);
        const verify = await request(app)
          .post(`/api/v1/customer/payments/${orderId}/verify`)
          .set(header)
          .send({ gateway: "FONEPAY", providerTransactionId: "pb-a" });
        expect(verify.status).toBe(200); // handled; payment marked Failed
        const order = await OrderModel.findById(orderId).lean();
        expect(order?.payment.status).toBe("Failed");
        expect(order?.status).toBe("Pending");
      } finally {
        restore();
      }
    });

    it("is idempotent for duplicate verification (no double side-effects)", async () => {
      const { product } = await seedCommerce();
      const account = await seedCustomerAccount();
      const res = await placeOrder(account, product._id.toString());
      const orderId = res.body.data.id;
      const total = res.body.data.amounts.total;
      await OrderModel.updateOne(
        { _id: orderId },
        {
          $set: {
            "payment.status": "Initiated",
            "payment.provider": "FONEPAY",
            "payment.providerTransactionId": "pb-d",
          },
        },
      );
      const restore = withMockProvider("FONEPAY", paidVerification(total));
      try {
        const { header } = customerAccessTokenFor(account);
        const body = { gateway: "FONEPAY", providerTransactionId: "pb-d" };
        const first = await request(app)
          .post(`/api/v1/customer/payments/${orderId}/verify`)
          .set(header)
          .send(body);
        expect(first.status).toBe(200);
        expect(first.body.data.payment.status).toBe("Paid");
        const second = await request(app)
          .post(`/api/v1/customer/payments/${orderId}/verify`)
          .set(header)
          .send(body);
        expect(second.body.data.payment.status).toBe("Paid");
        const order = await OrderModel.findById(orderId).lean();
        const paidEntries = (order!.timeline as { label: string }[]).filter((t) =>
          t.label.startsWith("Payment Paid"),
        );
        expect(paidEntries).toHaveLength(1);
        const notes = await NotificationModel.find({ type: "payment_successful" }).lean();
        expect(notes).toHaveLength(1);
      } finally {
        restore();
      }
    });
  });

  describe("16H/16I fulfillment transitions + stock finalization", () => {
    it("walks Pending, Processing, Shipped, Delivered and finalizes stock exactly once", async () => {
      const { product } = await seedCommerce();
      const account = await seedCustomerAccount();
      const res = await placeOrder(account, product._id.toString());
      const orderId = res.body.data.id;
      await markPaid(orderId);
      const { header } = await userTokenFor();

      for (const status of ["Processing", "Shipped", "Delivered"]) {
        const step = await request(app)
          .patch(`/api/v1/orders/${orderId}/status`)
          .set(header)
          .send({ status });
        expect(step.status).toBe(200);
      }

      const inv = await invFor(product._id.toString());
      expect(inv?.stock).toBe(99); // finalized exactly once
      expect(inv?.reserved).toBe(0);
      const { header: cust } = customerAccessTokenFor(account);
      const view = await request(app).get(`/api/v1/customer/orders/${orderId}`).set(cust);
      expect(view.status).toBe(200);
      expect(view.body.data.status).toBe("Delivered");
      expect(view.body.data.timeline.length).toBeGreaterThanOrEqual(4);
    });

    it("sends fulfillment notifications only to the owning customer (IDOR isolation)", async () => {
      const { product } = await seedCommerce();
      const a = await seedCustomerAccount({ email: "owner@test.com" });
      const b = await seedCustomerAccount({ email: "other@test.com" });
      const res = await placeOrder(a, product._id.toString());
      await markPaid(res.body.data.id);
      const { header } = await userTokenFor();
      await request(app)
        .patch(`/api/v1/orders/${res.body.data.id}/status`)
        .set(header)
        .send({ status: "Processing" });

      const notes = await NotificationModel.find({ type: "order_status_changed" }).lean();
      expect(notes).toHaveLength(1);
      expect(notes[0].recipientId.toString()).toBe(a._id.toString());
      expect(notes[0].recipientId.toString()).not.toBe(b._id.toString());
    });

    it("does not create duplicate notifications on retried lifecycle operations", async () => {
      const { product } = await seedCommerce();
      const account = await seedCustomerAccount();
      const res = await placeOrder(account, product._id.toString());
      await OrderModel.updateOne(
        { _id: res.body.data.id },
        { $set: { expiresAt: new Date(Date.now() - 60_000) } },
      );
      await orderService.expirePendingOrders();
      await orderService.expirePendingOrders();
      const notes = await NotificationModel.find({ type: "order_expired" }).lean();
      expect(notes).toHaveLength(1);
      expect(notes[0].recipientId.toString()).toBe(account._id.toString());
    });

    it("blocks customer B from reading customer A's order (IDOR)", async () => {
      const { product } = await seedCommerce();
      const a = await seedCustomerAccount({ email: "ida@test.com" });
      const b = await seedCustomerAccount({ email: "idb@test.com" });
      const res = await placeOrder(a, product._id.toString());
      const { header } = customerAccessTokenFor(b);
      const peek = await request(app)
        .get(`/api/v1/customer/orders/${res.body.data.id}`)
        .set(header);
      expect(peek.status).toBe(404);
      const track = await request(app)
        .get(`/api/v1/customer/orders/${res.body.data.id}/tracking`)
        .set(header);
      expect(track.status).toBe(404);
    });

    it("requires authentication for admin lifecycle routes", async () => {
      const { product } = await seedCommerce();
      const account = await seedCustomerAccount();
      const res = await placeOrder(account, product._id.toString());
      const noAuth = await request(app)
        .post(`/api/v1/orders/${res.body.data.id}/cancel`)
        .send({});
      expect(noAuth.status).toBe(401);
      const noAuthStatus = await request(app)
        .patch(`/api/v1/orders/${res.body.data.id}/status`)
        .send({ status: "Shipped" });
      expect(noAuthStatus.status).toBe(401);
    });
  });
});

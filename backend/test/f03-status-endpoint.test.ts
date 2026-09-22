import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import {
  getApp,
  seedCatalog,
  seedProduct,
  seedInventory,
  seedCoupon,
  seedCustomerAccount,
  customerAccessTokenFor,
  userTokenFor,
} from "./helpers/fixtures.js";
import { InventoryModel } from "../src/modules/inventory/inventory.model.js";
import { CouponModel } from "../src/modules/coupons/coupon.model.js";
import { OrderModel } from "../src/modules/orders/order.model.js";
import { NotificationModel } from "../src/modules/notifications/notification.model.js";
import { orderService } from "../src/modules/orders/order.service.js";
import { paymentProviderMap } from "../src/modules/payments/payment.providers.js";
import type { PaymentProviderInterface } from "../src/modules/payments/payment.provider.js";


const app = getApp();

async function seedCommerce(price = 100) {
  const { category, brand } = await seedCatalog();
  const product = await seedProduct(category._id, brand._id, { sku: `F03-${price}`, price });
  await seedInventory(product._id, `F03-${price}`);
  return { product };
}

async function placeOrder(account: { _id: { toString(): string } }, productId: string, qty = 1) {
  const { header } = customerAccessTokenFor(account);
  return request(app)
    .post("/api/v1/customer/orders")
    .set(header)
    .send({ items: [{ productId, quantity: qty }], paymentMethod: "Digital Wallet" });
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

describe("F-03 generic status endpoint payment invariants", () => {
  beforeAll(async () => {
    await connect();
  });
  beforeEach(async () => {
    await clearDatabase();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("rejects Paid → Cancelled via PATCH status (no refund, no release, no mutation)", async () => {
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount();
    const res = await placeOrder(account, product._id.toString());
    const orderId = res.body.data.id as string;
    await markPaid(orderId);

    const { header } = await userTokenFor();
    const patch = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(header)
      .send({ status: "Cancelled" });
    expect(patch.status).toBe(400);

    const order = await OrderModel.findById(orderId).lean();
    expect(order?.status).toBe("Pending");
    expect(order?.payment.status).toBe("Paid");
    expect(order?.refund).toBeUndefined();
    const inv = await invFor(product._id.toString());
    expect(inv?.reserved).toBe(1);
  });

  it("rejects Paid → Refunded via PATCH status on a shipped order (no fake refund)", async () => {
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount();
    const res = await placeOrder(account, product._id.toString());
    const orderId = res.body.data.id as string;
    await markPaid(orderId);
    await OrderModel.updateOne({ _id: orderId }, { $set: { status: "Shipped" } });

    const { header } = await userTokenFor();
    const patch = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(header)
      .send({ status: "Refunded" });
    expect(patch.status).toBe(400);

    const order = await OrderModel.findById(orderId).lean();
    expect(order?.status).toBe("Shipped");
    expect(order?.payment.status).toBe("Paid");
    expect(order?.refund).toBeUndefined();
  });

  it("routes unpaid cancellation through the guarded workflow and releases the reservation", async () => {
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount();
    const res = await placeOrder(account, product._id.toString());
    const orderId = res.body.data.id as string;

    const { header } = await userTokenFor();
    const patch = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(header)
      .send({ status: "Cancelled" });
    expect(patch.status).toBe(200);
    expect(patch.body.data.status).toBe("Cancelled");

    const order = await OrderModel.findById(orderId).lean();
    expect(order?.payment.status).toBe("Pending");
    const inv = await invFor(product._id.toString());
    expect(inv?.reserved).toBe(0);
  });
it("decrements coupon usage when an unpaid order is cancelled via status update", async () => {
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount();
    await seedCoupon({ code: "F03-TEST10", value: 10 });

    const { header: cust } = customerAccessTokenFor(account);
    const place = await request(app)
      .post("/api/v1/customer/orders")
      .set(cust)
      .send({
        items: [{ productId: product._id.toString(), quantity: 1 }],
        paymentMethod: "Digital Wallet",
        couponCode: "F03-TEST10",
      });
    expect(place.status).toBe(201);
    const afterPlace = await CouponModel.findOne({ code: "F03-TEST10" }).lean();
    expect(afterPlace?.used).toBe(1);

    const orderId = place.body.data.id as string;
    const { header } = await userTokenFor();
    const patch = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(header)
      .send({ status: "Cancelled" });
    expect(patch.status).toBe(200);

    const afterCancel = await CouponModel.findOne({ code: "F03-TEST10" }).lean();
    expect(afterCancel?.used).toBe(0);
  });

  it("is idempotent for repeated cancellation via status update", async () => {
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount();
    const res = await placeOrder(account, product._id.toString());
    const orderId = res.body.data.id as string;

    const { header } = await userTokenFor();
    const first = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(header)
      .send({ status: "Cancelled" });
    expect(first.status).toBe(200);
    const second = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(header)
      .send({ status: "Cancelled" });
    expect(second.status).toBe(200);

    const inv = await invFor(product._id.toString());
    expect(inv?.reserved).toBe(0);
    const notes = await NotificationModel.find({ type: "order_cancelled" }).lean();
    expect(notes).toHaveLength(1);
  });

  it("still refunds a paid shipped order through the refund workflow (provider + record)", async () => {
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount();
    const res = await placeOrder(account, product._id.toString());
    const orderId = res.body.data.id as string;
    await markPaid(orderId);
    await OrderModel.updateOne({ _id: orderId }, { $set: { status: "Shipped" } });

    const fake = {
      initiate: vi.fn(),
      verify: vi.fn(),
      getStatus: vi.fn(),
      refundCapability: () => "SUPPORTED" as const,
      refund: vi.fn(async () => ({ status: "SUCCESS", providerRef: "f03-ref" })),
    } as unknown as PaymentProviderInterface;
    const restore = withMockProvider("FONEPAY", fake);
    try {
      const { header } = await userTokenFor();
      const refund = await request(app)
        .post(`/api/v1/orders/${orderId}/refund`)
        .set(header)
        .send({ reason: "F-03 regression" });
      expect(refund.status).toBe(200);
      expect(refund.body.data.status).toBe("Refunded");
      expect(refund.body.data.payment.status).toBe("Refunded");
      expect(refund.body.data.refund.status).toBe("SUCCESS");
      expect(fake.refund).toHaveBeenCalledWith(`pb-${orderId}`, 120);
      const inv = await invFor(product._id.toString());
      expect(inv?.reserved).toBe(0);
    } finally {
      restore();
    }
  });

  it("never executes a completed refund twice (already-refunded order)", async () => {
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount();
    const res = await placeOrder(account, product._id.toString());
    const orderId = res.body.data.id as string;
    await markPaid(orderId);
    await OrderModel.updateOne({ _id: orderId }, { $set: { status: "Shipped" } });

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
it("does not allow an Expired order to flip to another status", async () => {
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount();
    const res = await placeOrder(account, product._id.toString());
    const orderId = res.body.data.id as string;
    await OrderModel.updateOne(
      { _id: orderId },
      { $set: { expiresAt: new Date(Date.now() - 60_000) } },
    );
    await orderService.expirePendingOrders();

    const { header } = await userTokenFor();
    const patch = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(header)
      .send({ status: "Processing" });
    expect(patch.status).toBe(400);
    const order = await OrderModel.findById(orderId).lean();
    expect(order?.status).toBe("Expired");
  });

  it("keeps Delivered finalization and post-delivery refund intact", async () => {
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount();
    const res = await placeOrder(account, product._id.toString());
    const orderId = res.body.data.id as string;
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
    expect(inv?.reserved).toBe(0);
    expect(inv?.stock).toBe(99);

    const fake = {
      initiate: vi.fn(),
      verify: vi.fn(),
      getStatus: vi.fn(),
      refundCapability: () => "SUPPORTED" as const,
      refund: vi.fn(async () => ({ status: "SUCCESS", providerRef: "deliv-ref" })),
    } as unknown as PaymentProviderInterface;
    const restore = withMockProvider("FONEPAY", fake);
    try {
      const refund = await request(app)
        .post(`/api/v1/orders/${orderId}/refund`)
        .set(header)
        .send({});
      expect(refund.status).toBe(200);
      expect(refund.body.data.status).toBe("Refunded");
      const after = await invFor(product._id.toString());
      expect(after?.reserved).toBe(0);
    } finally {
      restore();
    }
  });

  it("requires orders:edit permission on the generic status endpoint", async () => {
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount();
    const res = await placeOrder(account, product._id.toString());
    const orderId = res.body.data.id as string;
    const { header } = await userTokenFor("Marketing Manager");
    const patch = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(header)
      .send({ status: "Cancelled" });
    expect(patch.status).toBe(403);
    expect(patch.body.error.code).toBe("FORBIDDEN");
  });
});

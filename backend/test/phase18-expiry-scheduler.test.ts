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
} from "./helpers/fixtures.js";
import { OrderModel } from "../src/modules/orders/order.model.js";
import { InventoryModel } from "../src/modules/inventory/inventory.model.js";
import { orderService } from "../src/modules/orders/order.service.js";
import {
  runOrderExpirySweep,
  startOrderExpiryScheduler,
  stopOrderExpiryScheduler,
} from "../src/modules/orders/expiry-scheduler.js";

/**
 * Phase 18 (G18-03) — expiration-job robustness.
 *
 * The scheduler is deliberately NOT the source of truth: the DB `expiresAt`
 * timestamp and the atomic per-order transition (`expirePendingById`) are.
 * These tests assert the sweep is idempotent, safe on already-finalized orders,
 * safe under overlapping/concurrent execution, and that transient DB failures
 * do not break subsequent ticks.
 */
const app = getApp();

async function seedCommerce(price = 100) {
  const { category, brand } = await seedCatalog();
  const product = await seedProduct(category._id, brand._id, { sku: `P18-${price}`, price });
  await seedInventory(product._id, `P18-${price}`);
  return { product };
}

async function placeOrder(account: { _id: { toString(): string } }, productId: string) {
  const { header } = customerAccessTokenFor(account);
  return request(app).post("/api/v1/customer/orders").set(header).send({
    items: [{ productId, quantity: 1 }],
    paymentMethod: "Digital Wallet",
  });
}

/** Places an order then backdates its expiry deadline into the past. */
async function expiredOrderId(productId: string): Promise<string> {
  const account = await seedCustomerAccount();
  const res = await placeOrder(account, productId);
  const orderId = res.body.data.id;
  await OrderModel.updateOne({ _id: orderId }, { $set: { expiresAt: new Date(Date.now() - 60_000) } });
  return orderId;
}

async function reservedFor(productId: string): Promise<number> {
  const inv = await InventoryModel.findOne({ product: productId, warehouse: "Rotterdam DC" })
    .lean()
    .exec();
  return (inv as { reserved: number } | null)?.reserved ?? -1;
}

describe("Phase 18 G18-03 — expiration-scheduler robustness", () => {
  beforeAll(async () => {
    await connect();
  });
  beforeEach(async () => {
    await clearDatabase();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("discovers the overdue order independently of the last run time (restart catch-up)", async () => {
    const { product } = await seedCommerce();
    const orderId = await expiredOrderId(product._id.toString());
    const { expired } = await orderService.expirePendingOrders();
    expect(expired).toContain(orderId);
  });

  it("does not expire an already-paid order", async () => {
    const { product } = await seedCommerce();
    const orderId = await expiredOrderId(product._id.toString());
    await OrderModel.updateOne({ _id: orderId }, { $set: { "payment.status": "Paid" } });
    const { expired } = await orderService.expirePendingOrders();
    expect(expired).toHaveLength(0);
    const order = await OrderModel.findById(orderId).lean();
    expect(order?.status).toBe("Pending");
    expect(order?.payment.status).toBe("Paid");
  });

  it("does not expire an already-cancelled order", async () => {
    const { product } = await seedCommerce();
    const orderId = await expiredOrderId(product._id.toString());
    await OrderModel.updateOne({ _id: orderId }, { $set: { status: "Cancelled" } });
    const { expired } = await orderService.expirePendingOrders();
    expect(expired).toHaveLength(0);
    const order = await OrderModel.findById(orderId).lean();
    expect(order?.status).toBe("Cancelled");
  });

  it("does not expire an already-Delivered order", async () => {
    const { product } = await seedCommerce();
    const orderId = await expiredOrderId(product._id.toString());
    await OrderModel.updateOne({ _id: orderId }, { $set: { status: "Delivered", "payment.status": "Paid" } });
    const { expired } = await orderService.expirePendingOrders();
    expect(expired).toHaveLength(0);
    const order = await OrderModel.findById(orderId).lean();
    expect(order?.status).toBe("Delivered");
  });
it("an already-expired order is safe to process again (idempotent sweep)", async () => {
    const { product } = await seedCommerce();
    const orderId = await expiredOrderId(product._id.toString());
    const first = await orderService.expirePendingOrders();
    expect(first.expired).toContain(orderId);
    await expect(reservedFor(product._id.toString())).resolves.toBe(0);
    const second = await orderService.expirePendingOrders();
    expect(second.expired).toHaveLength(0);
    await expect(reservedFor(product._id.toString())).resolves.toBe(0);
  });

  it("two overlapping sweeps expire each overdue order exactly once", async () => {
    const { product } = await seedCommerce();
    const a = await expiredOrderId(product._id.toString());
    const b = await expiredOrderId(product._id.toString());
    const [r1, r2] = await Promise.all([
      orderService.expirePendingOrders(),
      orderService.expirePendingOrders(),
    ]);
    const seen = new Set([...r1.expired, ...r2.expired]);
    expect(seen.size).toBe(2);
    expect(seen).toContain(a);
    expect(seen).toContain(b);
    const dupes = r1.expired
      .filter((id) => r2.expired.includes(id))
      .filter((id, i, arr) => arr.indexOf(id) === i);
    expect(dupes).toHaveLength(0);
    for (const id of [a, b]) {
      const order = await OrderModel.findById(id).lean();
      expect(order?.status).toBe("Expired");
    }
  });

  it("runOrderExpirySweep never throws on a transient DB failure and retries next tick", async () => {
    const spy = vi
      .spyOn(orderService, "expirePendingOrders")
      .mockRejectedValueOnce(new Error("db temporarily down"))
      .mockResolvedValue({ expired: [] });
    await expect(runOrderExpirySweep()).resolves.toBeUndefined();
    await expect(runOrderExpirySweep()).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("skips an overlapping sweep while a previous one is still running", async () => {
    const calls: string[] = [];
    let resolveSweep!: (v: { expired: string[] }) => void;
    const spy = vi.spyOn(orderService, "expirePendingOrders").mockImplementation(() => {
      calls.push("run");
      return new Promise((res) => {
        resolveSweep = res;
      });
    });
    const first = runOrderExpirySweep();
    await Promise.resolve();
    await Promise.resolve();
    await runOrderExpirySweep(); // should be skipped (still running)
    expect(calls).toHaveLength(1);
    resolveSweep({ expired: [] });
    await first;
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("starts and stops the scheduler cleanly without leaking timers", () => {
    startOrderExpiryScheduler();
    expect(() => startOrderExpiryScheduler()).not.toThrow(); // idempotent start
    expect(() => stopOrderExpiryScheduler()).not.toThrow();
    expect(() => stopOrderExpiryScheduler()).not.toThrow(); // idempotent stop
  });
});

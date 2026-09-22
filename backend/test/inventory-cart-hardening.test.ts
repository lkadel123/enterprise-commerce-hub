import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
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
import { InventoryModel } from "../src/modules/inventory/inventory.model.js";
import { OrderModel } from "../src/modules/orders/order.model.js";
import { orderService } from "../src/modules/orders/order.service.js";
import { assertSeedAllowed } from "../src/database/seedGuard.js";

/**
 * Phase 15 P2 hardening tests — Product → Inventory → Cart → Checkout.
 *
 * These tests exercise the REAL production paths (customer order API →
 * orderService.create → inventoryRepository.reserveStock) and prove:
 *   1. Concurrent double-buy cannot oversell inventory.
 *   2. Reservations are released when an unpaid order is cancelled, idempotently.
 *   3. Stale client/cart state cannot bypass current inventory.
 *   4. The production seed guard fails closed.
 *
 * No production logic is modified; existing error envelopes are asserted.
 */
const app = getApp();

beforeAll(async () => {
  await connect();
});
beforeEach(async () => {
  await clearDatabase();
});
afterAll(async () => {
  await disconnect();
});

const WAREHOUSE = "Rotterdam DC";

async function seedCommerce(sku: string, stock: number, price = 100) {
  const { category, brand } = await seedCatalog();
  const product = await seedProduct(category._id, brand._id, { sku, price, cost: 50 });
  const inventory = await seedInventory(product._id, sku);
  await InventoryModel.updateOne({ _id: inventory._id }, { $set: { stock } }).exec();
  return { product, inventory };
}

async function customerHeader(email: string) {
  const account = await seedCustomerAccount({ email });
  return customerAccessTokenFor(account);
}

/** Places an order through the real customer API; returns the response. */
function placeOrder(header: Record<string, string>, productId: string, quantity: number) {
  return request(app)
    .post("/api/v1/customer/orders")
    .set(header)
    .send({ items: [{ productId, quantity }], paymentMethod: "Cash on Delivery" });
}

async function readInventory(productId: unknown) {
  return (await InventoryModel.findOne({ product: productId, warehouse: WAREHOUSE })
    .lean()
    .exec()) as unknown as { stock: number; reserved: number } | null;
}

describe("Phase 15: concurrent oversell protection", () => {
  it("never oversells when concurrent orders exceed available stock", async () => {
    // Stock 5; two customers each try to buy 4 (combined 8 > 5).
    const { product } = await seedCommerce("OVERSELL-SKU", 5);
    const productId = product._id.toString();
    const a = await customerHeader("buyer-a@test.com");
    const b = await customerHeader("buyer-b@test.com");

    const [resA, resB] = await Promise.all([
      placeOrder(a.header, productId, 4),
      placeOrder(b.header, productId, 4),
    ]);

    const statuses = [resA.status, resB.status].sort();
    // Exactly one reservation wins (201); the loser gets the existing business error (400).
    expect(statuses).toEqual([201, 400]);
    const loser = resA.status === 201 ? resB : resA;
    expect(loser.body.error?.message).toMatch(/Insufficient stock/i);

    const inv = await readInventory(product._id);
    expect(inv).not.toBeNull();
    // The atomic guard means available (stock - reserved) can never go negative.
    expect(inv!.stock - inv!.reserved).toBeGreaterThanOrEqual(0);
    expect(inv!.reserved).toBe(4);
    // Internally consistent: reserved never exceeds stock.
    expect(inv!.reserved).toBeLessThanOrEqual(inv!.stock);
    // Only the winning order exists in Pending state.
    const pending = await OrderModel.countDocuments({ status: "Pending" }).exec();
    expect(pending).toBe(1);
  });

  it("serial competing orders exhaust stock exactly without going negative", async () => {
    const { product } = await seedCommerce("SERIAL-SKU", 3);
    const productId = product._id.toString();
    const a = await customerHeader("serial-a@test.com");
    const b = await customerHeader("serial-b@test.com");
    const c = await customerHeader("serial-c@test.com");

    const r1 = await placeOrder(a.header, productId, 2); // succeeds (available 3→1)
    const r2 = await placeOrder(b.header, productId, 2); // rejected (1 < 2)
    const r3 = await placeOrder(c.header, productId, 1); // succeeds (available 1→0)

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(400);
    expect(r3.status).toBe(201);

    const inv = await readInventory(product._id);
    expect(inv!.stock).toBe(3);
    expect(inv!.reserved).toBe(3);
    expect(inv!.stock - inv!.reserved).toBe(0);
  });
});

describe("Phase 15: payment expiry / reservation release", () => {
  it("releases inventory when an unpaid order is cancelled, idempotently", async () => {
    const { product } = await seedCommerce("RELEASE-SKU", 10);
    const productId = product._id.toString();
    const header = (await customerHeader("releaser@test.com")).header;

    const res = await placeOrder(header, productId, 6);
    expect(res.status).toBe(201);
    const orderId = res.body.data.id as string;

    let inv = await readInventory(product._id);
    expect(inv!.reserved).toBe(6);
    expect(inv!.stock - inv!.reserved).toBe(4);

    // Release through the existing order service cancellation path
    // (no customer-facing cancel route exists; scheduling/UX is separate).
    await orderService.cancel(orderId, "Phase 15 test cancellation");

    inv = await readInventory(product._id);
    expect(inv!.reserved).toBe(0);
    expect(inv!.stock).toBe(10);

    // Idempotency: a second cancel attempt must not double-release.
    await orderService.cancel(orderId, "Phase 15 repeat").catch(() => undefined);
    inv = await readInventory(product._id);
    expect(inv!.stock).toBe(10);
    expect(inv!.reserved).toBe(0);
    expect(inv!.stock - inv!.reserved).toBe(10);
  });
});

describe("Phase 15: stale-stock cart protection", () => {
  it("rejects checkout when stock was reduced after items were added", async () => {
    const { product } = await seedCommerce("STALE-SKU", 10);
    const productId = product._id.toString();
    const header = (await customerHeader("stale@test.com")).header;

    // Stale view: cart says 8 available.
    const add = await request(app)
      .post("/api/v1/cart/items")
      .set(header)
      .send({ productId, quantity: 8 });
    expect(add.status).toBe(200);

    // Inventory drops externally to 2.
    await InventoryModel.updateOne(
      { product: product._id, warehouse: WAREHOUSE },
      { $set: { stock: 2 } }
    ).exec();

    // Checkout with stale quantity must be rejected by server-side validation.
    const order = await placeOrder(header, productId, 8);
    expect(order.status).toBe(400);
    expect(order.body.error?.message).toMatch(/Insufficient stock/i);

    // No negative stock; no order created.
    const inv = await readInventory(product._id);
    expect(inv!.stock - inv!.reserved).toBeGreaterThanOrEqual(0);
    expect(await OrderModel.countDocuments().exec()).toBe(0);

    // Cart remains recoverable: a smaller quantity still works.
    const retry = await placeOrder(header, productId, 2);
    expect(retry.status).toBe(201);
  });

  it("rejects orders for inactive/deleted products with existing error envelope", async () => {
    const { product } = await seedCommerce("GONE-SKU", 5);
    const productId = product._id.toString();
    const header = (await customerHeader("gone@test.com")).header;

    await request(app)
      .post("/api/v1/cart/items")
      .set(header)
      .send({ productId, quantity: 1 });

    // Simulate product removal/unavailability.
    const ProductModel = (await import("../src/modules/products/product.model.js"))
      .ProductModel as { updateOne: Function };
    await ProductModel.updateOne({ _id: product._id }, { $set: { status: "Archived" } }).exec();

    const order = await placeOrder(header, productId, 1);
    expect([400, 404]).toContain(order.status);
    expect(order.body.error?.message).toBeDefined();
    expect(await OrderModel.countDocuments().exec()).toBe(0);
  });
});

describe("Phase 15: production seed guard", () => {
  it("fails closed in production and allows dev/test", () => {
    const prevEnv = process.env.NODE_ENV;
    const prevFlag = process.env.ALLOW_PROD_SEED;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.ALLOW_PROD_SEED;
      expect(() => assertSeedAllowed()).toThrow(/production|SEED/i);

      // The deliberate, explicit production override is honoured only when set.
      process.env.ALLOW_PROD_SEED = "1";
      expect(() => assertSeedAllowed()).not.toThrow();

      process.env.NODE_ENV = "development";
      delete process.env.ALLOW_PROD_SEED;
      expect(() => assertSeedAllowed()).not.toThrow();
    } finally {
      if (prevEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevEnv;
      if (prevFlag === undefined) delete process.env.ALLOW_PROD_SEED;
      else process.env.ALLOW_PROD_SEED = prevFlag;
    }
  });
});

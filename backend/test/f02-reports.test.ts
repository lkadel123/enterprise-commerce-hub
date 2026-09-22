import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import {
  getApp,
  seedCustomerAccount,
  seedCatalog,
  seedProduct,
  seedInventory,
  customerAccessTokenFor,
  userTokenFor,
} from "./helpers/fixtures.js";
import { OrderModel } from "../src/modules/orders/order.model.js";

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

async function seedCommerce() {
  const { category, brand } = await seedCatalog();
  const product = await seedProduct(category._id, brand._id, {
    sku: "RPT-SKU",
    price: 100,
    cost: 40,
  });
  await seedInventory(product._id, "RPT-SKU");
  return { product };
}

/** Places a real customer order (server-priced) and returns id + total. */
async function placeOrder(productId: string): Promise<{ orderId: string; total: number }> {
  const account = await seedCustomerAccount();
  const { header } = customerAccessTokenFor(account);
  const res = await request(app)
    .post("/api/v1/customer/orders")
    .set(header)
    .send({ items: [{ productId, quantity: 1 }], paymentMethod: "Digital Wallet" });
  expect(res.status).toBe(201);
  const orderId = res.body.data.id as string;
  const doc = await OrderModel.findById(orderId).lean().exec();
  return { orderId, total: doc!.amounts.total };
}

/** Forces a genuinely paid payment directly in the DB (report filter input). */
async function forcePaid(orderId: string) {
  await OrderModel.findByIdAndUpdate(orderId, {
    $set: { "payment.status": "Paid", "payment.paidAt": new Date() },
  });
}

function setRegion(orderId: string, region: string) {
  return OrderModel.findByIdAndUpdate(orderId, { $set: { region } });
}

function setCreatedAt(orderId: string, date: Date) {
  // createdAt is immutable through Mongoose (timestamps option) — use the
  // native collection to force historical dates for date-filter tests.
  return OrderModel.collection.updateOne(
    { _id: new Types.ObjectId(orderId) },
    { $set: { createdAt: date } },
  );
}

async function adminHeader(role: Parameters<typeof userTokenFor>[0] = "Super Admin") {
  const { header } = await userTokenFor(role);
  return header;
}

async function get(path: string, header?: Record<string, string>, query = "") {
  return request(app).get(`/api/v1${path}${query}`).set(header ?? (await adminHeader()));
}
describe("F-02 — reports & analytics (backend)", () => {
  it("R1: rejects unauthenticated access (401)", async () => {
    for (const path of ["/reports/overview", "/reports/regions", "/reports/revenue"]) {
      const res = await request(app).get(`/api/v1${path}`);
      expect(res.status, path).toBe(401);
    }
  });

  it("R2: rejects a role without reports:view (403)", async () => {
    const header = await adminHeader("Customer Support");
    const res = await get("/reports/regions", header);
    expect(res.status).toBe(403);
  });

  it("R3: regions aggregates settled revenue per region only (paid filter)", async () => {
    const { product } = await seedCommerce();
    const a = await placeOrder(product._id.toString());
    const b = await placeOrder(product._id.toString());
    await forcePaid(a.orderId);
    await forcePaid(b.orderId);
    await setRegion(a.orderId, "Europe");
    await setRegion(b.orderId, "Asia Pacific");

    const res = await get("/reports/regions");
    expect(res.status).toBe(200);
    const rows = res.body.data as { region: string; value: number }[];
    expect(rows).toHaveLength(2);
    const europe = rows.find((r) => r.region === "Europe");
    const apac = rows.find((r) => r.region === "Asia Pacific");
    expect(europe?.value).toBe(a.total);
    expect(apac?.value).toBe(b.total);
    // Sorted by value descending.
    expect(rows[0].value).toBeGreaterThanOrEqual(rows[rows.length - 1].value);
  });

  it("R4: regions excludes unpaid orders from revenue", async () => {
    const { product } = await seedCommerce();
    const unpaid = await placeOrder(product._id.toString());
    await setRegion(unpaid.orderId, "Europe");

    const res = await get("/reports/regions");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("R5: regions respects the from date filter and returns empty otherwise", async () => {
    const { product } = await seedCommerce();
    const old = await placeOrder(product._id.toString());
    await forcePaid(old.orderId);
    await setRegion(old.orderId, "Europe");
    await setCreatedAt(old.orderId, new Date(Date.now() - 400 * 86_400_000));

    const inRange = await get("/reports/regions", undefined, "?from=" + new Date().toISOString().slice(0, 10));
    expect(inRange.status).toBe(200);
    expect(inRange.body.data).toEqual([]);

    const allTime = await get("/reports/regions");
    expect(allTime.status).toBe(200);
    expect(allTime.body.data).toHaveLength(1);
  });

  it("R6: regions validates query parameters (422 on invalid granularity)", async () => {
    const res = await get("/reports/regions", undefined, "?granularity=bogus");
    expect(res.status).toBe(422);
  });

  it("R7: overview counts every order but realizes revenue from paid only", async () => {
    const { product } = await seedCommerce();
    const paid = await placeOrder(product._id.toString());
    await placeOrder(product._id.toString()); // stays unpaid
    await forcePaid(paid.orderId);

    const res = await get("/reports/overview");
    expect(res.status).toBe(200);
    const overview = res.body.data as {
      totalRevenue: number;
      totalOrders: number;
      avgOrderValue: number;
      ordersByStatus: Record<string, number>;
    };
    expect(overview.totalRevenue).toBe(paid.total);
    expect(overview.totalOrders).toBe(2);
    expect(overview.avgOrderValue).toBe(paid.total);
    expect(overview.ordersByStatus["Pending"]).toBe(2);
  });

  it("R8: revenue returns paid revenue and snapshot-based profit per bucket", async () => {
    const { product } = await seedCommerce();
    const { orderId, total } = await placeOrder(product._id.toString());
    await forcePaid(orderId);

    const res = await get("/reports/revenue", undefined, "?granularity=monthly");
    expect(res.status).toBe(200);
    const points = res.body.data as { key: string; revenue: number; orders: number; profit: number }[];
    expect(points).toHaveLength(1);
    expect(points[0].revenue).toBe(total);
    expect(points[0].orders).toBe(1);
    expect(points[0].profit).toBe(60);
  });

  it("R9: categories maps category names to settled line totals", async () => {
    const { product } = await seedCommerce();
    const { orderId } = await placeOrder(product._id.toString());
    await forcePaid(orderId);

    const res = await get("/reports/categories");
    expect(res.status).toBe(200);
    const rows = res.body.data as { category: string; value: number }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe("Electronics");
    expect(rows[0].value).toBe(100); // lineTotal snapshot, not order total
  });

  it("R10: payment-methods returns settled value and share per method", async () => {
    const { product } = await seedCommerce();
    const { orderId, total } = await placeOrder(product._id.toString());
    await forcePaid(orderId);

    const res = await get("/reports/payment-methods");
    expect(res.status).toBe(200);
    const rows = res.body.data as { method: string; value: number; share: number }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].method).toBe("Digital Wallet");
    expect(rows[0].value).toBe(total);
    expect(rows[0].share).toBe(100);
  });

  it("R11: top-products ranks by settled revenue from order-item snapshots", async () => {
    const { product } = await seedCommerce();
    const { orderId } = await placeOrder(product._id.toString());
    await forcePaid(orderId);

    const res = await get("/reports/top-products?limit=5");
    expect(res.status).toBe(200);
    const rows = res.body.data as { sku: string; name: string; unitsSold: number; revenue: number }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].sku).toBe("RPT-SKU");
    expect(rows[0].unitsSold).toBe(1);
    expect(rows[0].revenue).toBe(100);
  });
});

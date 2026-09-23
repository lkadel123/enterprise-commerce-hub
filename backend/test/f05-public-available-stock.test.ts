import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import {
  getApp,
  seedProduct,
  seedCustomerAccount,
  customerAccessTokenFor,
  userTokenFor,
} from "./helpers/fixtures.js";
import { InventoryModel, WAREHOUSES } from "../src/modules/inventory/inventory.model.js";
import { CategoryModel } from "../src/modules/categories/category.model.js";
import { BrandModel } from "../src/modules/brands/brand.model.js";

/**
 * F-05 — the public catalog must expose AVAILABLE stock, not gross stock:
 *
 *   available = SUM over inventory records of max(0, stock - reserved)
 *
 * A fully-reserved (or over-reserved) product must appear out of stock even
 * though gross `stock` is still positive. The Inventory collection remains the
 * source of truth; checkout keeps its own atomic reservation guard.
 */

const app = getApp();

interface PublicProduct {
  id: string;
  slug: string;
  stock: number;
}

async function seedWithInventory(
  slug: string,
  sku: string,
  records: { stock: number; reserved: number; warehouse?: string }[],
) {
  // T6 fix: seedCatalog() always creates the same category/brand slugs; reuse
  // the existing documents when two products are seeded inside one test
  // (clearDatabase only runs between tests, so duplicates collide here).
  const category =
    (await CategoryModel.findOne({ slug: "electronics" })) ??
    (await CategoryModel.create({ name: "Electronics", slug: "electronics", status: "Active" }));
  const brand =
    (await BrandModel.findOne({ slug: "northlight" })) ??
    (await BrandModel.create({ name: "Northlight", slug: "northlight", status: "Active" }));
  const product = await seedProduct(category._id, brand._id, { slug, sku });
  for (const [i, rec] of records.entries()) {
    await InventoryModel.create({
      product: product._id,
      sku: `${sku}-${i}`,
      warehouse: rec.warehouse ?? WAREHOUSES[i % WAREHOUSES.length],
      stock: rec.stock,
      reserved: rec.reserved,
      incoming: 0,
      reorderLevel: 5,
      adjustments: [],
    });
  }
  return product;
}

async function listProduct(slug: string): Promise<PublicProduct> {
  const res = await request(app).get("/api/v1/public/products").expect(200);
  const found = (res.body.data as PublicProduct[]).find((p) => p.slug === slug);
  expect(found).toBeDefined();
  return found as PublicProduct;
}

async function detailProduct(slug: string): Promise<PublicProduct> {
  const res = await request(app).get(`/api/v1/public/products/${slug}`).expect(200);
  return res.body.data as PublicProduct;
}

beforeAll(async () => {
  await connect();
});
beforeEach(async () => {
  await clearDatabase();
});
afterAll(async () => {
  await disconnect();
});

describe("F-05 — public available stock (list endpoint)", () => {
  it("T1: no reservations → available = gross stock", async () => {
    await seedWithInventory("t1-product", "T1", [{ stock: 10, reserved: 0 }]);
    expect((await listProduct("t1-product")).stock).toBe(10);
  });

  it("T2: partial reservation (10/4) → available = 6", async () => {
    await seedWithInventory("t2-product", "T2", [{ stock: 10, reserved: 4 }]);
    expect((await listProduct("t2-product")).stock).toBe(6);
  });

  it("T3: fully reserved (10/10) → available = 0, product not presented as available", async () => {
    await seedWithInventory("t3-product", "T3", [{ stock: 10, reserved: 10 }]);
    const listed = await listProduct("t3-product");
    const detail = await detailProduct("t3-product");
    expect(listed.stock).toBe(0);
    expect(detail.stock).toBe(0);
  });

  it("T4: over-reserved defensive case (10/12) → available = 0, never negative", async () => {
    await seedWithInventory("t4-product", "T4", [{ stock: 10, reserved: 12 }]);
    const listed = await listProduct("t4-product");
    const detail = await detailProduct("t4-product");
    expect(listed.stock).toBe(0);
    expect(detail.stock).toBe(0);
  });

  it("T5: multiple inventory records (10/4, 5/5, 3/1) → available = 6+0+2 = 8", async () => {
    await seedWithInventory("t5-product", "T5", [
      { stock: 10, reserved: 4 },
      { stock: 5, reserved: 5 },
      { stock: 3, reserved: 1 },
    ]);
    const listed = await listProduct("t5-product");
    const detail = await detailProduct("t5-product");
    expect(listed.stock).toBe(8);
    expect(detail.stock).toBe(8);
  });

  it("T6: product isolation — product B's inventory never affects product A", async () => {
    await seedWithInventory("t6-a", "T6A", [{ stock: 10, reserved: 8 }]);
    await seedWithInventory("t6-b", "T6B", [{ stock: 50, reserved: 0 }]);
    expect((await listProduct("t6-a")).stock).toBe(2);
    expect((await listProduct("t6-b")).stock).toBe(50);
  });
});

describe("F-05 — availability follows the real reservation lifecycle", () => {
  /** Fresh admin header per test (clearDatabase wipes users between tests). */
  async function adminHeaderFor() {
    return (await userTokenFor()).header;
  }

  /** Sync helper → returns the chainable supertest request so `.expect()` is called before awaiting. */
  function adminTransition(header: Record<string, string>, orderId: string, status: string) {
    return request(app).patch(`/api/v1/orders/${orderId}/status`).set(header).send({ status });
  }

  async function reserveOne(product: { _id: { toString(): string } }) {
    const account = await seedCustomerAccount();
    const { header } = customerAccessTokenFor(account);
    const res = await request(app)
      .post("/api/v1/customer/orders")
      .set(header)
      .send({
        items: [{ productId: product._id.toString(), quantity: 1 }],
        paymentMethod: "Digital Wallet",
      })
      .expect(201);
    return res.body.data.id as string;
  }

  it("T7: checkout from a genuinely reservable state drives availability to zero", async () => {
    const product = await seedWithInventory("t7-product", "T7", [{ stock: 3, reserved: 2 }]);
    // Only 1 unit is actually available (3 stock - 2 reserved), matching the
    // public field; reserving that last unit via a real checkout must take
    // the public availability to 0.
    expect((await listProduct("t7-product")).stock).toBe(1);
    await reserveOne(product);
    expect((await listProduct("t7-product")).stock).toBe(0);
    const inv = await InventoryModel.findOne({ product: product._id }).lean();
    expect(inv?.reserved).toBe(3);
  });

  it("T8: checkout reservation immediately reduces public availability", async () => {
    const product = await seedWithInventory("t8-product", "T8", [{ stock: 10, reserved: 0 }]);
    await reserveOne(product);
    const inv = await InventoryModel.findOne({ product: product._id }).lean();
    expect(inv?.reserved).toBe(1);
    const listed = await listProduct("t8-product");
    expect(listed.stock).toBe(9);
    expect((await detailProduct("t8-product")).stock).toBe(9);
  });

  it("T9: cancellation releases the reservation → public availability increases", async () => {
    const product = await seedWithInventory("t9-product", "T9", [{ stock: 10, reserved: 0 }]);
    const orderId = await reserveOne(product);
    expect((await listProduct("t9-product")).stock).toBe(9);
    await adminTransition(await adminHeaderFor(), orderId, "Cancelled").expect(200);
    const inv = await InventoryModel.findOne({ product: product._id }).lean();
    expect(inv?.reserved).toBe(0);
    const listed = await listProduct("t9-product");
    expect(listed.stock).toBe(10);
  });

  it("T10: delivery finalization commits stock — availability reflects the decrement, reserved returns to 0", async () => {
    const product = await seedWithInventory("t10-product", "T10", [{ stock: 10, reserved: 0 }]);
    const orderId = await reserveOne(product);
    const header = await adminHeaderFor();
    await adminTransition(header, orderId, "Processing").expect(200);
    await adminTransition(header, orderId, "Shipped").expect(200);
    await adminTransition(header, orderId, "Delivered").expect(200);
    const inv = (await InventoryModel.findOne({ product: product._id }).lean()) as {
      stock: number;
      reserved: number;
    } | null;
    expect(inv?.reserved).toBe(0);
    expect(inv?.stock).toBe(9);
    expect((await listProduct("t10-product")).stock).toBe(9);
  });
});

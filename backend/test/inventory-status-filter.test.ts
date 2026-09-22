import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import { getApp, seedCatalog, seedProduct, userTokenFor } from "./helpers/fixtures.js";
import { InventoryModel } from "../src/modules/inventory/inventory.model.js";

/**
 * Inventory list `status` filter (added for the real admin dashboard's
 * low-stock alerts and the inventory page's stock-state filters).
 *
 * The filter definitions must stay identical to the summary aggregation:
 *   In Stock     = stock > reorderLevel
 *   Low Stock    = 0 < stock <= reorderLevel
 *   Out of Stock = stock === 0
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

let header: Record<string, string>;

async function seedStockRow(
  ids: { category: unknown; brand: unknown },
  sku: string,
  stock: number,
  reorderLevel = 10,
) {
  const product = await seedProduct(ids.category, ids.brand, {
    name: `Stock Probe ${sku}`,
    slug: `stock-probe-${sku.toLowerCase()}`,
    sku,
  });
  await InventoryModel.create({
    product: product._id,
    sku,
    warehouse: "Rotterdam DC",
    stock,
    reserved: 0,
    incoming: 0,
    reorderLevel,
    adjustments: [],
  });
}

function listInventory(query: Record<string, string>) {
  return request(app).get("/api/v1/inventory").set(header).query(query);
}

describe("inventory list status filter", () => {
  beforeEach(async () => {
    // clearDatabase wipes users too, so the admin identity is re-seeded per test.
    const seeded = await userTokenFor("Inventory Manager");
    header = seeded.header;
    // One shared catalog (slug-unique) — distinct SKUs per stock state.
    const { category, brand } = await seedCatalog();
    const ids = { category: category._id, brand: brand._id };
    await seedStockRow(ids, "SKU-IN", 50); // In Stock (> reorderLevel)
    await seedStockRow(ids, "SKU-LOW", 5); // Low Stock (0 < 5 <= 10)
    await seedStockRow(ids, "SKU-OUT", 0); // Out of Stock
  });

  it("returns only in-stock rows for status=In Stock", async () => {
    const res = await listInventory({ status: "In Stock" });
    expect(res.status).toBe(200);
    const skus = res.body.data.map((r: { sku: string }) => r.sku);
    expect(skus).toContain("SKU-IN");
    expect(skus).not.toContain("SKU-LOW");
    expect(skus).not.toContain("SKU-OUT");
  });

  it("returns only low-stock rows for status=Low Stock", async () => {
    const res = await listInventory({ status: "Low Stock" });
    expect(res.status).toBe(200);
    const skus = res.body.data.map((r: { sku: string }) => r.sku);
    expect(skus).toEqual(["SKU-LOW"]);
  });

  it("returns only out-of-stock rows for status=Out of Stock", async () => {
    const res = await listInventory({ status: "Out of Stock" });
    expect(res.status).toBe(200);
    const skus = res.body.data.map((r: { sku: string }) => r.sku);
    expect(skus).toEqual(["SKU-OUT"]);
  });

  it("rejects an unknown status value", async () => {
    const res = await listInventory({ status: "Sort Of" });
    expect(res.status).toBe(422);
  });

  it("returns all rows when no status is provided", async () => {
    const res = await listInventory({});
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
  });
});

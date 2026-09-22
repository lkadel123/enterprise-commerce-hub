import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import { getApp, userTokenFor } from "./helpers/fixtures.js";

const app = getApp();

describe("Authorization (RBAC)", () => {
  beforeAll(async () => {
    await connect();
  });
  beforeEach(async () => {
    await clearDatabase();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("returns 401 when no token is supplied", async () => {
    const res = await request(app).get("/api/v1/products");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 401 when a malformed token is supplied", async () => {
    const res = await request(app)
      .get("/api/v1/products")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("rejects an inactive user's token", async () => {
    const { header } = await userTokenFor("Super Admin", "Suspended");
    const res = await request(app).get("/api/v1/products").set(header);
    expect(res.status).toBe(401);
  });

  it("allows a Super Admin to create a product", async () => {
    const { header } = await userTokenFor("Super Admin");
    const res = await request(app)
      .post("/api/v1/products")
      .set(header)
      .send({ name: "Widget", sku: "WID-1", price: 10, cost: 5 });
    expect(res.status).toBe(201);
  });

  it("forbids a role without catalog:create permission", async () => {
    // Accountant has no catalog permissions at all.
    const { header } = await userTokenFor("Accountant");
    const res = await request(app)
      .post("/api/v1/products")
      .set(header)
      .send({ name: "Widget", sku: "WID-2", price: 10, cost: 5 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("forbids viewing orders for a role without orders:view", async () => {
    // Content Manager has no orders module permission.
    const { header } = await userTokenFor("Content Manager");
    const res = await request(app).get("/api/v1/orders").set(header);
    expect(res.status).toBe(403);
  });

  it("allows an Inventory Manager to adjust stock but not delete products", async () => {
    const { header } = await userTokenFor("Inventory Manager");
    const res = await request(app)
      .post("/api/v1/inventory/adjust")
      .set(header)
      .send({ sku: "X", warehouse: "Rotterdam DC", delta: 5, reason: "manual" });
    // product "X" does not exist -> 400, but the permission itself is allowed
    expect(res.status).toBe(400);

    const deleteRes = await request(app)
      .delete("/api/v1/products/000000000000000000000000")
      .set(header);
    // Inventory Manager cannot delete catalog items
    expect(deleteRes.status).toBe(403);
  });
});

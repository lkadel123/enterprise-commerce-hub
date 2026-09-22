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
  TEST_PASSWORD,
} from "./helpers/fixtures.js";

const app = getApp();

/**
 * Phase 11 regression additions: dedicated CART and WISHLIST coverage.
 *
 * These suites were previously exercised only indirectly. They pin:
 * - authentication is required on every route
 * - validation rejects malformed bodies (422)
 * - ownership is server-scoped: customer B can never read or mutate the
 *   cart/wishlist rows of customer A (IDOR regression)
 * - the guest→authenticated cart merge endpoint merges duplicate products
 */
describe("Cart & Wishlist ownership (Phase 11)", () => {
  let productId: string;

  beforeAll(async () => {
    await connect();
  });
  beforeEach(async () => {
    await clearDatabase();
    const { category, brand } = await seedCatalog();
    const product = await seedProduct(category._id, brand._id);
    await seedInventory(product._id, "SKU-001");
    productId = String(product._id);
  });
  afterAll(async () => {
    await disconnect();
  });

  async function customerHeader(emailSuffix: string) {
    const account = await seedCustomerAccount({
      email: `${emailSuffix}@test.com`,
      password: TEST_PASSWORD,
      name: `Customer ${emailSuffix}`,
    });
    return customerAccessTokenFor(account).header;
  }

  it("rejects unauthenticated cart and wishlist access", async () => {
    expect((await request(app).get("/api/v1/cart")).status).toBe(401);
    expect((await request(app).get("/api/v1/wishlist")).status).toBe(401);
    expect((await request(app).post("/api/v1/cart/items").send({ productId })).status).toBe(401);
  });

  it("adds a cart item and returns it scoped to the owner", async () => {
    const a = await customerHeader("cart-a");
    const res = await request(app)
      .post("/api/v1/cart/items")
      .set(a)
      .send({ productId, quantity: 2 });
    expect([200, 201]).toContain(res.status);
    expect(JSON.stringify(res.body)).toContain(productId);
  });

  it("validates cart payloads (invalid quantity / bad id)", async () => {
    const a = await customerHeader("cart-val");
    const badQty = await request(app)
      .post("/api/v1/cart/items")
      .set(a)
      .send({ productId, quantity: 0 });
    expect(badQty.status).toBe(422);
    const badId = await request(app)
      .post("/api/v1/cart/items")
      .set(a)
      .send({ productId: "not-an-objectid" });
    expect(badId.status).toBe(422);
  });

  it("isolates carts between customers (IDOR)", async () => {
    const a = await customerHeader("iso-a");
    const b = await customerHeader("iso-b");
    await request(app).post("/api/v1/cart/items").set(a).send({ productId, quantity: 3 });

    const bCart = await request(app).get("/api/v1/cart").set(b);
    expect(bCart.status).toBeLessThan(400);
    expect(JSON.stringify(bCart.body)).not.toContain(productId);

    // B cannot mutate A's line item: deleting the same productId must not
    // remove it from A's cart.
    await request(app).delete(`/api/v1/cart/items/${productId}`).set(b);
    const aCart = await request(app).get("/api/v1/cart").set(a);
    expect(JSON.stringify(aCart.body)).toContain(productId);
    const qtyMatch = JSON.stringify(aCart.body).match(/"quantity":3/);
    expect(qtyMatch).toBeTruthy();
  });

  it("merges a guest cart into the authenticated cart, summing duplicates", async () => {
    const a = await customerHeader("merge-a");
    await request(app).post("/api/v1/cart/items").set(a).send({ productId, quantity: 1 });
    const res = await request(app)
      .post("/api/v1/cart/merge")
      .set(a)
      .send({ items: [{ productId, quantity: 2 }] });
    expect([200, 201]).toContain(res.status);
    const cart = await request(app).get("/api/v1/cart").set(a);
    expect(cart.status).toBeLessThan(400);
    const items = extractItems(cart.body);
    expect(items.find((i) => String(i.productId) === productId)?.quantity).toBe(3);
  });

  function extractItems(body: unknown): Array<{ productId: unknown; quantity: number }> {
    const data = (body as { data?: { items?: unknown[] } }).data ?? {};
    return (data.items as Array<{ productId: unknown; quantity: number }>) ?? [];
  }

  it("adds, lists and removes wishlist items scoped per customer", async () => {
    const a = await customerHeader("wl-a");
    const b = await customerHeader("wl-b");

    const add = await request(app).post("/api/v1/wishlist").set(a).send({ productId });
    expect([200, 201]).toContain(add.status);

    const aList = await request(app).get("/api/v1/wishlist").set(a);
    expect(JSON.stringify(aList.body)).toContain(productId);

    const bList = await request(app).get("/api/v1/wishlist").set(b);
    expect(JSON.stringify(bList.body)).not.toContain(productId);

    // B cannot delete A's wishlist entry (owner-scoped delete).
    await request(app).delete(`/api/v1/wishlist/${productId}`).set(b);
    const stillThere = await request(app).get("/api/v1/wishlist").set(a);
    expect(JSON.stringify(stillThere.body)).toContain(productId);

    const removed = await request(app).delete(`/api/v1/wishlist/${productId}`).set(a);
    expect(removed.status).toBeLessThan(400);
    const afterRemove = await request(app).get("/api/v1/wishlist").set(a);
    expect(JSON.stringify(afterRemove.body)).not.toContain(productId);
  });

  it("rejects wishlist payloads with invalid ids", async () => {
    const a = await customerHeader("wl-val");
    const res = await request(app).post("/api/v1/wishlist").set(a).send({ productId: "xyz" });
    expect(res.status).toBe(422);
  });
});

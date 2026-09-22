import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import {
  getApp,
  seedCustomerAccount,
  seedCatalog,
  seedProduct,
  seedInventory,
  seedCoupon,
  customerAccessTokenFor,
  userTokenFor,
} from "./helpers/fixtures.js";
import { CouponModel } from "../src/modules/coupons/coupon.model.js";
import { CouponRedemptionModel } from "../src/modules/coupons/couponRedemption.model.js";
import { InventoryModel } from "../src/modules/inventory/inventory.model.js";
import { CategoryModel } from "../src/modules/categories/category.model.js";

const app = getApp();
const isSuccess = (r: { status: number }) => r.status === 200 || r.status === 201;
const DAY = 86_400_000;

async function seedCommerce() {
  const { category, brand } = await seedCatalog();
  const product = await seedProduct(category._id, brand._id, {
    sku: "CPN-SKU",
    price: 100,
    cost: 50,
  });
  await seedInventory(product._id, "CPN-SKU");
  return { category, product };
}

async function placeOrderWithCoupon(
  account: { _id: { toString(): string } },
  productId: string,
  couponCode: string,
  quantity = 1,
) {
  const { header } = customerAccessTokenFor(account);
  return request(app)
    .post("/api/v1/customer/orders")
    .set(header)
    .send({ items: [{ productId, quantity }], couponCode });
}

async function validateCoupon(
  account: { _id: { toString(): string } },
  body: Record<string, unknown>,
) {
  const { header } = customerAccessTokenFor(account);
  return request(app).post("/api/v1/customer/coupons/validate").set(header).send(body);
}

describe("Customer coupons (Phase 7)", () => {
  beforeAll(async () => {
    await connect();
  });
  beforeEach(async () => {
    await clearDatabase();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("validates an active percentage coupon and computes the discount", async () => {
    const { product } = await seedCommerce();
    await seedCoupon({ code: "PERCENT10", type: "Percentage", value: 10 });
    const account = await seedCustomerAccount({ email: "c1@test.com" });

    const res = await validateCoupon(account, {
      code: "PERCENT10",
      items: [{ productId: product._id.toString(), quantity: 1 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.coupon.complete).toBe(true);
    expect(res.body.data.coupon.discount).toBe(10);
  });

  it("validates an active fixed coupon", async () => {
    const { product } = await seedCommerce();
    await seedCoupon({ code: "FIX15", type: "Fixed", value: 15 });
    const account = await seedCustomerAccount({ email: "c2@test.com" });

    const res = await validateCoupon(account, {
      code: "FIX15",
      items: [{ productId: product._id.toString(), quantity: 1 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.coupon.discount).toBe(15);
  });

  it("validates a free-shipping coupon", async () => {
    const { product } = await seedCommerce();
    await seedCoupon({ code: "FREESHIP", type: "Free Shipping", value: 0 });
    const account = await seedCustomerAccount({ email: "c3@test.com" });

    const res = await validateCoupon(account, {
      code: "FREESHIP",
      items: [{ productId: product._id.toString(), quantity: 1 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.coupon.type).toBe("Free Shipping");
    expect(res.body.data.coupon.discount).toBe(0);
  });

  it("rejects an expired coupon", async () => {
    const account = await seedCustomerAccount({ email: "c4@test.com" });
    await seedCoupon({ code: "EXPIRED", endAt: new Date(Date.now() - DAY) });

    const res = await validateCoupon(account, { code: "EXPIRED" });
    expect(res.body.data.valid).toBe(false);
    expect(res.body.data.reason).toBe("expired");
  });

  it("rejects a future (scheduled) coupon", async () => {
    const account = await seedCustomerAccount({ email: "c5@test.com" });
    await seedCoupon({
      code: "FUTURE",
      startAt: new Date(Date.now() + DAY),
      endAt: new Date(Date.now() + 3 * DAY),
    });

    const res = await validateCoupon(account, { code: "FUTURE" });
    expect(res.body.data.valid).toBe(false);
    expect(res.body.data.reason).toBe("scheduled");
  });

  it("rejects an unknown coupon", async () => {
    const account = await seedCustomerAccount({ email: "c6@test.com" });
    const res = await validateCoupon(account, { code: "NOPE" });
    expect(res.body.data.valid).toBe(false);
    expect(res.body.data.reason).toBe("not_found");
  });

  it("rejects when the order is below minOrder", async () => {
    const { product } = await seedCommerce();
    await seedCoupon({ code: "MIN300", minOrder: 300 });
    const account = await seedCustomerAccount({ email: "c7@test.com" });

    const res = await validateCoupon(account, {
      code: "MIN300",
      items: [{ productId: product._id.toString(), quantity: 1 }], // subtotal 100
    });
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(false);
    expect(res.body.data.reason).toBe("minimum_order");
  });

  it("enforces maxDiscount on a percentage coupon", async () => {
    const { product } = await seedCommerce();
    await seedCoupon({ code: "MAX5", type: "Percentage", value: 50, maxDiscount: 5 });
    const account = await seedCustomerAccount({ email: "c8@test.com" });

    const res = await validateCoupon(account, {
      code: "MAX5",
      items: [{ productId: product._id.toString(), quantity: 1 }], // 50% of 100 = 50, capped at 5
    });
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.coupon.discount).toBe(5);
  });

  it("accepts a coupon whose applicableCategories include the order product's category", async () => {
    const { category, product } = await seedCommerce();
    await seedCoupon({ code: "CATOK", applicableCategoryIds: [category._id.toString()] });
    const account = await seedCustomerAccount({ email: "c9@test.com" });

    const res = await validateCoupon(account, {
      code: "CATOK",
      items: [{ productId: product._id.toString(), quantity: 1 }],
    });
    expect(res.body.data.valid).toBe(true);
  });

  it("rejects a coupon whose applicableCategories do not include the order products", async () => {
    const { product } = await seedCommerce();
    const other = await CategoryModel.create({
      name: "Other",
      slug: "other-cat",
      status: "Active",
    });
    await seedCoupon({ code: "CATNO", applicableCategoryIds: [other._id.toString()] });
    const account = await seedCustomerAccount({ email: "c10@test.com" });

    const res = await validateCoupon(account, {
      code: "CATNO",
      items: [{ productId: product._id.toString(), quantity: 1 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(false);
    expect(res.body.data.reason).toBe("category");
  });

  it("rejects a client-supplied subtotal", async () => {
    const account = await seedCustomerAccount({ email: "c11@test.com" });
    const res = await validateCoupon(account, { code: "PERCENT10", subtotal: 1 });
    expect(res.status).toBe(422);
  });

  it("rejects a client-supplied discount", async () => {
    const account = await seedCustomerAccount({ email: "c12@test.com" });
    const res = await validateCoupon(account, { code: "PERCENT10", discount: 1 });
    expect(res.status).toBe(422);
  });

  it("rejects a client-supplied total", async () => {
    const account = await seedCustomerAccount({ email: "c13@test.com" });
    const res = await validateCoupon(account, { code: "PERCENT10", total: 1 });
    expect(res.status).toBe(422);
  });

  it("rejects a client-supplied customerId", async () => {
    const account = await seedCustomerAccount({ email: "c14@test.com" });
    const res = await validateCoupon(account, {
      code: "PERCENT10",
      customerId: account._id.toString(),
    });
    expect(res.status).toBe(422);
  });

  it("rejects a malformed product ObjectId", async () => {
    const account = await seedCustomerAccount({ email: "c15@test.com" });
    const res = await validateCoupon(account, {
      code: "PERCENT10",
      items: [{ productId: "not-an-object-id", quantity: 1 }],
    });
    expect(res.status).toBe(422);
  });

  it("rejects a malformed coupon code", async () => {
    const account = await seedCustomerAccount({ email: "c16@test.com" });
    const res = await validateCoupon(account, { code: "A!" });
    expect(res.status).toBe(422);
  });

  it("rejects unauthenticated coupon requests with 401", async () => {
    const resValidate = await request(app)
      .post("/api/v1/customer/coupons/validate")
      .send({ code: "PERCENT10" });
    expect(resValidate.status).toBe(401);
    const resList = await request(app).get("/api/v1/customer/coupons");
    expect(resList.status).toBe(401);
  });

  it("rejects an admin token on customer coupon endpoints", async () => {
    const { header } = await userTokenFor();
    const res = await request(app)
      .post("/api/v1/customer/coupons/validate")
      .set(header)
      .send({ code: "PERCENT10" });
    expect(res.status).toBe(401);
  });

  it("rejects a second order once perCustomerLimit is reached", async () => {
    const { product } = await seedCommerce();
    await seedCoupon({ code: "LIMIT1", perCustomerLimit: 1, usageLimit: 0 });
    const account = await seedCustomerAccount({ email: "c17@test.com" });

    const first = await placeOrderWithCoupon(account, product._id.toString(), "LIMIT1");
    expect(isSuccess(first)).toBe(true);
    expect(first.body.data.coupon.code).toBe("LIMIT1");

    const second = await placeOrderWithCoupon(account, product._id.toString(), "LIMIT1");
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe("BAD_REQUEST");
  });

  it("enforces the global usageLimit across different customers", async () => {
    const { product } = await seedCommerce();
    await seedCoupon({ code: "GLOBAL1", usageLimit: 1, perCustomerLimit: 0 });
    const accountA = await seedCustomerAccount({ email: "ga@test.com" });
    const accountB = await seedCustomerAccount({ email: "gb@test.com" });

    const first = await placeOrderWithCoupon(accountA, product._id.toString(), "GLOBAL1");
    expect(isSuccess(first)).toBe(true);

    const second = await placeOrderWithCoupon(accountB, product._id.toString(), "GLOBAL1");
    expect(second.status).toBe(400);
  });

  it("records redemption and stores coupon info with a server-authoritative discount", async () => {
    const { product } = await seedCommerce();
    const coupon = await seedCoupon({ code: "FIX10", type: "Fixed", value: 10 });
    const account = await seedCustomerAccount({ email: "c18@test.com" });

    const res = await placeOrderWithCoupon(account, product._id.toString(), "FIX10");
    expect(res.status).toBe(201);

    const order = res.body.data;
    expect(order.coupon.code).toBe("FIX10");
    expect(order.amounts.discount).toBe(10);

    const updated = await CouponModel.findById(coupon._id).lean().exec();
    expect(updated!.used).toBe(1);

    const redemption = await CouponRedemptionModel.findOne({ couponId: coupon._id }).lean().exec();
    expect(redemption).toBeTruthy();
    expect(redemption!.count).toBe(1);
  });

  it("my-coupons returns customer-safe data and reflects per-customer usage", async () => {
    const { product } = await seedCommerce();
    await seedCoupon({ code: "MINE1", perCustomerLimit: 1 });
    const account = await seedCustomerAccount({ email: "c19@test.com" });
    const { header } = customerAccessTokenFor(account);

    const before = await request(app).get("/api/v1/customer/coupons").set(header);
    expect(before.status).toBe(200);
    expect(before.body.data.map((c: { code: string }) => c.code)).toContain("MINE1");
    const mine = before.body.data.find((c: { code: string }) => c.code === "MINE1");
    expect(mine.usable).toBe(true);
    expect(mine.perCustomerRemaining).toBe(1);
    expect(mine).not.toHaveProperty("used");
    expect(mine).not.toHaveProperty("usageLimit");

    await placeOrderWithCoupon(account, product._id.toString(), "MINE1");

    const after = await request(app).get("/api/v1/customer/coupons").set(header);
    const mineAfter = after.body.data.find((c: { code: string }) => c.code === "MINE1");
    expect(mineAfter.usable).toBe(false);
    expect(mineAfter.perCustomerRemaining).toBe(0);
  });

  it("customer A cannot see customer B's coupon usage", async () => {
    const { product } = await seedCommerce();
    await seedCoupon({ code: "ISOLATE", perCustomerLimit: 1 });
    const accountA = await seedCustomerAccount({ email: "ia@test.com" });
    const accountB = await seedCustomerAccount({ email: "ib@test.com" });

    await placeOrderWithCoupon(accountB, product._id.toString(), "ISOLATE");

    // A is unaffected by B's usage.
    const res = await validateCoupon(accountA, { code: "ISOLATE" });
    expect(res.body.data.valid).toBe(true);

    const headerA = customerAccessTokenFor(accountA).header;
    const list = await request(app).get("/api/v1/customer/coupons").set(headerA);
    const mine = list.body.data.find((c: { code: string }) => c.code === "ISOLATE");
    expect(mine.usable).toBe(true);
  });

  it("concurrent redemption cannot exceed the global usageLimit", async () => {
    const { product } = await seedCommerce();
    await seedCoupon({ code: "CONCG", usageLimit: 1, perCustomerLimit: 0 });
    const accountA = await seedCustomerAccount({ email: "cg-a@test.com" });
    const accountB = await seedCustomerAccount({ email: "cg-b@test.com" });

    const results = await Promise.all([
      placeOrderWithCoupon(accountA, product._id.toString(), "CONCG"),
      placeOrderWithCoupon(accountB, product._id.toString(), "CONCG"),
    ]);
    const successes = results.filter(isSuccess).length;
    expect(successes).toBe(1);
  });

  it("concurrent redemption cannot exceed perCustomerLimit", async () => {
    const { product } = await seedCommerce();
    await seedCoupon({ code: "CONCP", perCustomerLimit: 1, usageLimit: 0 });
    const account = await seedCustomerAccount({ email: "cp@test.com" });

    const results = await Promise.all([
      placeOrderWithCoupon(account, product._id.toString(), "CONCP"),
      placeOrderWithCoupon(account, product._id.toString(), "CONCP"),
    ]);
    const successes = results.filter(isSuccess).length;
    expect(successes).toBe(1);
  });

  it("releases reserved coupon usage when order creation fails", async () => {
    const { product } = await seedCommerce();
    const coupon = await seedCoupon({ code: "ROLLBACK", perCustomerLimit: 1, usageLimit: 0 });
    const account = await seedCustomerAccount({ email: "rb@test.com" });

    // Force a stock failure after the coupon is reserved: only 1 unit is on hand.
    await InventoryModel.updateOne({ product: product._id }, { $set: { stock: 1 } }).exec();

    const res = await placeOrderWithCoupon(account, product._id.toString(), "ROLLBACK", 2);
    expect(res.status).toBe(400);

    const updated = await CouponModel.findById(coupon._id).lean().exec();
    expect(updated!.used).toBe(0);
    const redemption = await CouponRedemptionModel.findOne({ couponId: coupon._id }).lean().exec();
    expect(redemption).toBeTruthy();
    expect(redemption!.count).toBe(0);
  });
});

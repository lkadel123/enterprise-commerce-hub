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
import { ReviewModel } from "../src/modules/reviews/review.model.js";
import { ProductModel } from "../src/modules/products/product.model.js";
import { CustomerAccountModel } from "../src/modules/customer-auth/customerAccount.model.js";
import { OrderModel } from "../src/modules/orders/order.model.js";
import { ensureCrmCustomer } from "../src/modules/customer-orders/customer-order.service.js";

/**
 * Backend Phase 7 + Phase 18 (G18-02) - customer review security & functional tests.
 *
 * Phase 18 (G18-02): review creation is gated on a DELIVERED, owned order that
 * actually contained the product. Positive cases seed a real delivered order;
 * negative cases assert the backend rejects every ineligible scenario.
 */
const app = getApp();

/** A valid ObjectId that is never persisted - used for schema-validity tests. */
const FAKE_ORDER_ID = new Types.ObjectId("000000000000000000000001").toString();

async function seedProductForReview(status = "Active") {
  const { category, brand } = await seedCatalog();
  const product = await seedProduct(category._id, brand._id, {
    sku: "REV-SKU",
    price: 100,
    cost: 50,
    status,
  });
  await seedInventory(product._id, "REV-SKU");
  return product;
}

/** Seeds a real order owned by the customer containing the product. */
async function seedDeliveredOrder(
  account: { _id: { toString(): string }; email: string },
  productId: string,
  opts: { status?: string; withProduct?: boolean } = {},
) {
  const crmCustomerId = await ensureCrmCustomer(account._id.toString());
  const order = await OrderModel.create({
    orderNumber: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    customer: new Types.ObjectId(crmCustomerId),
    email: account.email,
    region: "North America",
    warehouse: "Rotterdam DC",
    items: ((opts.withProduct ?? true) ? [
      {
        product: new Types.ObjectId(productId),
        sku: "REV-SKU",
        name: "Aurora Monitor",
        qty: 1,
        unitPrice: 100,
        lineTotal: 100,
      },
    ] : []),
    amounts: { subtotal: 100, discount: 0, shipping: 12.5, tax: 7.5, total: 120 },
    payment: { method: "Digital Wallet", status: "Paid", provider: "KHALTI" },
    status: opts.status ?? "Delivered",
    addresses: { shipping: null, billing: null },
    timeline: [],
    coupon: null,
  });
  return order;
}

function validReview(productId: string, orderId: string = FAKE_ORDER_ID) {
  return { orderId, productId, rating: 5, title: "Great", body: "Really good product." };
}

async function submitReview(header: Record<string, string>, body: Record<string, unknown>) {
  return request(app).post("/api/v1/customer/reviews").set(header).send(body);
}
describe("Customer reviews (Phase 7 + G18-02)", () => {
  beforeAll(async () => {
    await connect();
  });
  beforeEach(async () => {
    await clearDatabase();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("authenticated customer can review a product from a delivered order (Pending)", async () => {
    const product = await seedProductForReview();
    const account = await seedCustomerAccount({ email: "reviewer@test.com" });
    const order = await seedDeliveredOrder(account, product._id.toString());
    const { header } = customerAccessTokenFor(account);
    const res = await submitReview(header, validReview(product._id.toString(), order._id.toString()));
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("Pending");
    expect(res.body.data.product.id).toBe(product._id.toString());
    const review = await ReviewModel.findById(res.body.data.id).lean().exec();
    const refreshedAccount = await CustomerAccountModel.findById(account._id).lean().exec();
    expect(review).toBeTruthy();
    expect(review!.status).toBe("Pending");
    expect(review!.customer.toString()).toBe(refreshedAccount!.customer!.toString());
  });

  it("rejects rating < 1", async () => {
    const product = await seedProductForReview();
    const account = await seedCustomerAccount();
    const { header } = customerAccessTokenFor(account);
    const res = await submitReview(header, { ...validReview(product._id.toString()), rating: 0 });
    expect(res.status).toBe(422);
  });

  it("rejects rating > 5", async () => {
    const product = await seedProductForReview();
    const account = await seedCustomerAccount();
    const { header } = customerAccessTokenFor(account);
    const res = await submitReview(header, { ...validReview(product._id.toString()), rating: 6 });
    expect(res.status).toBe(422);
  });

  it("rejects an overlong title", async () => {
    const product = await seedProductForReview();
    const account = await seedCustomerAccount();
    const { header } = customerAccessTokenFor(account);
    const res = await submitReview(header, { ...validReview(product._id.toString()), title: "x".repeat(201) });
    expect(res.status).toBe(422);
  });

  it("rejects an overlong body", async () => {
    const product = await seedProductForReview();
    const account = await seedCustomerAccount();
    const { header } = customerAccessTokenFor(account);
    const res = await submitReview(header, { ...validReview(product._id.toString()), body: "x".repeat(2001) });
    expect(res.status).toBe(422);
  });

  it("rejects a missing body", async () => {
    const product = await seedProductForReview();
    const account = await seedCustomerAccount();
    const { header } = customerAccessTokenFor(account);
    const { body: _b, ...noBody } = validReview(product._id.toString());
    const res = await submitReview(header, noBody);
    expect(res.status).toBe(422);
  });

  it("rejects a missing orderId (no eligibility context)", async () => {
    const product = await seedProductForReview();
    const account = await seedCustomerAccount();
    const { header } = customerAccessTokenFor(account);
    const { orderId: _o, ...noOrder } = validReview(product._id.toString());
    const res = await submitReview(header, noOrder);
    expect(res.status).toBe(422);
  });

  it("rejects an invalid product ObjectId", async () => {
    const account = await seedCustomerAccount();
    const { header } = customerAccessTokenFor(account);
    const res = await submitReview(header, validReview("not-an-object-id"));
    expect(res.status).toBe(422);
  });

  it("rejects a non-visible (inactive) product", async () => {
    const product = await seedProductForReview("Archived");
    const account = await seedCustomerAccount();
    const { header } = customerAccessTokenFor(account);
    const res = await submitReview(header, validReview(product._id.toString()));
    expect(res.status).toBe(400);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const product = await seedProductForReview();
    const res = await request(app).post("/api/v1/customer/reviews").send(validReview(product._id.toString()));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects an admin token on customer endpoints", async () => {
    const product = await seedProductForReview();
    const { header } = await userTokenFor();
    const res = await submitReview(header, validReview(product._id.toString()));
    expect(res.status).toBe(401);
  });

  it("rejects a client-supplied customerId", async () => {
    const product = await seedProductForReview();
    const account = await seedCustomerAccount();
    const { header } = customerAccessTokenFor(account);
    const res = await submitReview(header, { ...validReview(product._id.toString()), customerId: account._id.toString() });
    expect(res.status).toBe(422);
  });

  it("rejects a client-supplied status", async () => {
    const product = await seedProductForReview();
    const account = await seedCustomerAccount();
    const { header } = customerAccessTokenFor(account);
    const res = await submitReview(header, { ...validReview(product._id.toString()), status: "Approved" });
    expect(res.status).toBe(422);
  });

  it("rejects client-supplied financial fields", async () => {
    const product = await seedProductForReview();
    const account = await seedCustomerAccount();
    const { header } = customerAccessTokenFor(account);
    const res = await submitReview(header, { ...validReview(product._id.toString()), total: 5, subtotal: 5 });
    expect(res.status).toBe(422);
  });
  /* ----------------------------- G18-02 gating ----------------------------- */

  it("customer cannot review a Pending order", async () => {
    const product = await seedProductForReview();
    const account = await seedCustomerAccount();
    const order = await seedDeliveredOrder(account, product._id.toString(), { status: "Pending" });
    const { header } = customerAccessTokenFor(account);
    const res = await submitReview(header, validReview(product._id.toString(), order._id.toString()));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("delivered");
  });

  it("customer cannot review a Processing order", async () => {
    const product = await seedProductForReview();
    const account = await seedCustomerAccount();
    const order = await seedDeliveredOrder(account, product._id.toString(), { status: "Processing" });
    const { header } = customerAccessTokenFor(account);
    const res = await submitReview(header, validReview(product._id.toString(), order._id.toString()));
    expect(res.status).toBe(400);
  });

  it("customer cannot review a Shipped-but-not-delivered order", async () => {
    const product = await seedProductForReview();
    const account = await seedCustomerAccount();
    const order = await seedDeliveredOrder(account, product._id.toString(), { status: "Shipped" });
    const { header } = customerAccessTokenFor(account);
    const res = await submitReview(header, validReview(product._id.toString(), order._id.toString()));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("delivered");
  });

  it("customer cannot review another customer's order (generic 404, no leak)", async () => {
    const product = await seedProductForReview();
    const owner = await seedCustomerAccount({ email: "owner-g18@test.com" });
    const other = await seedCustomerAccount({ email: "other-g18@test.com" });
    const order = await seedDeliveredOrder(owner, product._id.toString());
    const { header } = customerAccessTokenFor(other);
    const res = await submitReview(header, validReview(product._id.toString(), order._id.toString()));
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Order not found.");
  });

  it("customer cannot review against a non-existent order", async () => {
    const product = await seedProductForReview();
    const account = await seedCustomerAccount();
    const { header } = customerAccessTokenFor(account);
    const res = await submitReview(header, validReview(product._id.toString(), new Types.ObjectId().toString()));
    expect(res.status).toBe(404);
  });

  it("customer cannot review a product not contained in the delivered order", async () => {
    const { category, brand } = await seedCatalog();
    const productA = await seedProduct(category._id, brand._id, { sku: "REV-SKU", price: 100, cost: 50, status: "Active" });
    const productB = await ProductModel.create({
      name: "Meridian Lamp",
      slug: "meridian-lamp",
      sku: "REV-SKU-B",
      category: category._id,
      brand: brand._id,
      price: 200,
      cost: 100,
      status: "Active",
    });
    await seedInventory(productA._id, "REV-SKU");
    const account = await seedCustomerAccount();
    const order = await seedDeliveredOrder(account, productA._id.toString());
    const { header } = customerAccessTokenFor(account);
    const res = await submitReview(header, validReview(productB._id.toString(), order._id.toString()));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("not part");
  });

  it("rejects a duplicate review for the same customer/product with 409", async () => {
    const product = await seedProductForReview();
    const account = await seedCustomerAccount({ email: "dup@test.com" });
    const order = await seedDeliveredOrder(account, product._id.toString());
    const { header } = customerAccessTokenFor(account);
    const first = await submitReview(header, validReview(product._id.toString(), order._id.toString()));
    expect(first.status).toBe(201);
    const second = await submitReview(header, validReview(product._id.toString(), order._id.toString()));
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("CONFLICT");
    const count = await ReviewModel.countDocuments({ product: product._id });
    expect(count).toBe(1);
  });

  it("cannot create two duplicate reviews under concurrency", async () => {
    const product = await seedProductForReview();
    const account = await seedCustomerAccount({ email: "conc-dup@test.com" });
    const order = await seedDeliveredOrder(account, product._id.toString());
    const { header } = customerAccessTokenFor(account);
    await submitReview(header, validReview(product._id.toString(), order._id.toString()));
    const results = await Promise.all([
      submitReview(header, validReview(product._id.toString(), order._id.toString())),
      submitReview(header, validReview(product._id.toString(), order._id.toString())),
    ]);
    expect(results.every((r) => r.status === 201 || r.status === 409)).toBe(true);
    const count = await ReviewModel.countDocuments({ product: product._id });
    expect(count).toBe(1);
  });

  it("does not expose a Pending review publicly until it is Approved", async () => {
    const product = await seedProductForReview();
    const account = await seedCustomerAccount({ email: "pending@test.com" });
    const order = await seedDeliveredOrder(account, product._id.toString());
    const { header } = customerAccessTokenFor(account);
    await submitReview(header, validReview(product._id.toString(), order._id.toString()));
    const before = await request(app).get(`/api/v1/public/reviews?productId=${product._id}`);
    expect(before.status).toBe(200);
    expect(before.body.data).toHaveLength(0);
    await ReviewModel.updateOne({ product: product._id, status: "Pending" }, { $set: { status: "Approved" } }).exec();
    const after = await request(app).get(`/api/v1/public/reviews?productId=${product._id}`);
    expect(after.status).toBe(200);
    expect(after.body.data).toHaveLength(1);
    expect(after.body.data[0].rating).toBe(5);
  });

  it("customer review list returns only the authenticated customer's reviews", async () => {
    const product = await seedProductForReview();
    const accountA = await seedCustomerAccount({ email: "list-a@test.com" });
    const accountB = await seedCustomerAccount({ email: "list-b@test.com" });
    const orderA = await seedDeliveredOrder(accountA, product._id.toString());
    const orderB = await seedDeliveredOrder(accountB, product._id.toString());
    const headerA = customerAccessTokenFor(accountA).header;
    const headerB = customerAccessTokenFor(accountB).header;
    await submitReview(headerA, { ...validReview(product._id.toString(), orderA._id.toString()), title: "A" });
    await submitReview(headerB, { ...validReview(product._id.toString(), orderB._id.toString()), title: "B" });
    const res = await request(app).get("/api/v1/customer/reviews").set(headerA);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("A");
    expect(res.body.data[0].product.id).toBe(product._id.toString());
  });
});

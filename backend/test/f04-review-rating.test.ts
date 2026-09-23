import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import {
  getApp,
  seedCatalog,
  seedProduct,
  seedInventory,
  userTokenFor,
} from "./helpers/fixtures.js";
import { ReviewModel } from "../src/modules/reviews/review.model.js";
import { ProductModel } from "../src/modules/products/product.model.js";
import { CustomerModel } from "../src/modules/customers/customer.model.js";

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

async function seedProductWithInventory() {
  const { category, brand } = await seedCatalog();
  const product = await seedProduct(category._id, brand._id, { sku: "F04-SKU" });
  await seedInventory(product._id, "F04-SKU");
  return product;
}

async function seedReview(productId: unknown, rating: number, status = "Pending") {
  const customer = await CustomerModel.create({
    name: "F04 Customer",
    email: `f04-${Math.random().toString(36).slice(2)}@test.com`,
    group: "Retail",
    status: "Active",
  });
  const review = await ReviewModel.create({
    customer: customer._id,
    product: productId,
    rating,
    title: "F04 title",
    body: "F04 body",
    helpfulCount: 0,
    status: "Pending",
  });
  if (status === "Approved") {
    const res = await moderate(review._id, "Approved");
    if (res.status !== 200) throw new Error(`seed approve failed: ${res.status}`);
  }
  return review;
}

async function productAggregates(productId: unknown) {
  const product = await ProductModel.findById(productId).lean().exec();
  return { rating: product?.rating ?? null, reviewsCount: product?.reviewsCount ?? null };
}

async function moderate(reviewId: unknown, status: string) {
  const { header } = await userTokenFor();
  return request(app)
    .patch(`/api/v1/reviews/${reviewId as string}/status`)
    .set(header)
    .send({ status });
}

describe("F-04 review rating aggregation", () => {
  it("Test 1: a Pending review does not contribute to the aggregate", async () => {
    const product = await seedProductWithInventory();
    await seedReview(product._id, 5, "Pending");

    const { rating, reviewsCount } = await productAggregates(product._id);
    expect(reviewsCount).toBe(0);
    expect(rating).toBe(0);
  });

  it("Test 2: approving a review recalculates the aggregate", async () => {
    const product = await seedProductWithInventory();
    const review = await seedReview(product._id, 4, "Pending");

    const res = await moderate(review._id, "Approved");
    expect(res.status).toBe(200);

    const { rating, reviewsCount } = await productAggregates(product._id);
    expect(reviewsCount).toBe(1);
    expect(rating).toBeCloseTo(4, 6);
  });

  it("Test 3: rejecting an approved review removes it from the aggregate", async () => {
    const product = await seedProductWithInventory();
    await seedReview(product._id, 5, "Approved");
    const review = await seedReview(product._id, 3, "Approved");
    expect((await productAggregates(product._id)).reviewsCount).toBe(2);

    const res = await moderate(review._id, "Rejected");
    expect(res.status).toBe(200);

    const { rating, reviewsCount } = await productAggregates(product._id);
    expect(reviewsCount).toBe(1);
    expect(rating).toBeCloseTo(5, 6);
  });

  it("Test 4: hiding an approved review excludes it from the aggregate", async () => {
    const product = await seedProductWithInventory();
    const review = await seedReview(product._id, 2, "Approved");

    const res = await moderate(review._id, "Hidden");
    expect(res.status).toBe(200);

    const { rating, reviewsCount } = await productAggregates(product._id);
    expect(reviewsCount).toBe(0);
    expect(rating).toBe(0);
  });
  it("Test 5: deleting an approved review removes it from the aggregate", async () => {
    const product = await seedProductWithInventory();
    const review = await seedReview(product._id, 4, "Approved");
    expect((await productAggregates(product._id)).reviewsCount).toBe(1);

    const { header } = await userTokenFor();
    const res = await request(app)
      .delete(`/api/v1/reviews/${String(review._id)}`)
      .set(header);
    expect(res.status).toBe(200);

    const { rating, reviewsCount } = await productAggregates(product._id);
    expect(reviewsCount).toBe(0);
    expect(rating).toBe(0);
  });

  it("Test 6: full 5/4/3/2/1 distribution aggregates to rating 3, count 5", async () => {
    const product = await seedProductWithInventory();
    for (const rating of [5, 4, 3, 2, 1]) {
      await seedReview(product._id, rating, "Approved");
    }

    const { rating, reviewsCount } = await productAggregates(product._id);
    expect(reviewsCount).toBe(5);
    expect(rating).toBeCloseTo(3, 6);
  });

  it("Test 7: rejecting the final approved review resets the aggregate to 0/0", async () => {
    const product = await seedProductWithInventory();
    const review = await seedReview(product._id, 5, "Approved");
    expect((await productAggregates(product._id)).reviewsCount).toBe(1);

    const res = await moderate(review._id, "Rejected");
    expect(res.status).toBe(200);

    const { rating, reviewsCount } = await productAggregates(product._id);
    expect(reviewsCount).toBe(0);
    expect(rating).toBe(0);
  });

  it("Test 8: repeated approval is idempotent (no double-counting)", async () => {
    const product = await seedProductWithInventory();
    const review = await seedReview(product._id, 4, "Approved");

    const first = await moderate(review._id, "Approved");
    expect(first.status).toBe(200);
    const second = await moderate(review._id, "Approved");
    expect(second.status).toBe(200);

    const { rating, reviewsCount } = await productAggregates(product._id);
    expect(reviewsCount).toBe(1);
    expect(rating).toBeCloseTo(4, 6);
  });

  it("Test 9: repeated rejection/hide is idempotent", async () => {
    const product = await seedProductWithInventory();
    await seedReview(product._id, 5, "Approved");
    const review = await seedReview(product._id, 2, "Approved");

    for (const status of ["Rejected", "Rejected", "Hidden", "Hidden"]) {
      const res = await moderate(review._id, status);
      expect(res.status).toBe(200);
    }

    const { rating, reviewsCount } = await productAggregates(product._id);
    expect(reviewsCount).toBe(1);
    expect(rating).toBeCloseTo(5, 6);
  });

  it("Test 10: concurrent moderation converges on the actual approved set", async () => {
    const product = await seedProductWithInventory();
    const approved = [
      await seedReview(product._id, 5, "Pending"),
      await seedReview(product._id, 4, "Pending"),
      await seedReview(product._id, 3, "Pending"),
      await seedReview(product._id, 4, "Pending"),
      await seedReview(product._id, 4, "Pending"),
    ];
    const rejected = [
      await seedReview(product._id, 1, "Pending"),
      await seedReview(product._id, 2, "Pending"),
    ];

    const results = await Promise.all([
      ...approved.map((r) => moderate(r._id, "Approved")),
      ...rejected.map((r) => moderate(r._id, "Rejected")),
    ]);
    for (const res of results) expect(res.status).toBe(200);

    const { rating, reviewsCount } = await productAggregates(product._id);
    expect(reviewsCount).toBe(5);
    expect(rating).toBeCloseTo(4, 6); // (5+4+3+4+4)/5 = 4
  });

  it("Test 11: there is no review-edit endpoint that can bypass the aggregate", async () => {
    const product = await seedProductWithInventory();
    const review = await seedReview(product._id, 3, "Approved");

    const { header } = await userTokenFor();
    const res = await request(app)
      .patch(`/api/v1/reviews/${String(review._id)}/status`)
      .set(header)
      .send({ status: "Approved", rating: 5, body: "edited" });
    expect(res.status).toBe(200);

    const doc = await ReviewModel.findById(review._id).lean().exec();
    expect(doc?.rating).toBe(3);
    expect(doc?.body).toBe("F04 body");

    const { rating, reviewsCount } = await productAggregates(product._id);
    expect(reviewsCount).toBe(1);
    expect(rating).toBeCloseTo(3, 6);
  });

  it("Test 12: aggregation stays correct with a realistic number of reviews", async () => {
    const product = await seedProductWithInventory();
    const ratings: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      const rating = (i % 5) + 1;
      ratings.push(rating);
      await seedReview(product._id, rating, "Approved");
    }

    const { rating, reviewsCount } = await productAggregates(product._id);
    expect(reviewsCount).toBe(30);
    expect(rating).toBeCloseTo(ratings.reduce((a, b) => a + b, 0) / ratings.length, 6);

    const docs = await ReviewModel.find({ product: product._id }).limit(10).lean().exec();
    const results = await Promise.all(docs.map((d) => moderate(d._id, "Hidden")));
    for (const res of results) expect(res.status).toBe(200);

    const after = await productAggregates(product._id);
    expect(after.reviewsCount).toBe(20);
  });
});

import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import { getApp, seedCatalog, seedProduct } from "./helpers/fixtures.js";
import { CategoryModel } from "../src/modules/categories/category.model.js";
import { BrandModel } from "../src/modules/brands/brand.model.js";
import { ProductModel } from "../src/modules/products/product.model.js";
import { env } from "../src/config/env.js";

/**
 * Phase 9A â€” public SEO endpoints: sitemap.xml + robots.txt.
 *
 * Both endpoints are public (no auth). The sitemap must contain ONLY real,
 * publicly-visible catalog records (same visibility rules as the public
 * catalog) and must not leak internal/sensitive fields.
 */
const app = getApp();
const base = env.PUBLIC_BASE_URL.replace(/\/+$/, "");

describe("Public SEO: sitemap.xml + robots.txt (Phase 9A)", () => {
  beforeAll(async () => {
    await connect();
  });
  beforeEach(async () => {
    await clearDatabase();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("returns a valid XML sitemap with real public product/category/brand URLs and excludes non-public records", async () => {
    const { category, brand } = await seedCatalog();
    const product = await seedProduct(category._id, brand._id, {
      sku: "SEO-SKU",
      price: 100,
      cost: 50,
    });

    // Non-public records that must be excluded.
    await ProductModel.create({
      name: "Draft Product",
      slug: "draft-product",
      sku: "SEO-DRAFT",
      price: 10,
      cost: 5,
      status: "Draft",
    });
    await CategoryModel.create({ name: "Hidden Category", slug: "hidden-cat", status: "Hidden" });
    await BrandModel.create({ name: "Hidden Brand", slug: "hidden-brand", status: "Hidden" });

    const res = await request(app).get("/api/v1/public/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/xml");

    const body = res.text;
    expect(body.trim().startsWith("<?xml")).toBe(true);
    expect(body).toContain("<urlset");
    expect(body).toContain("</urlset>");

    expect(body).toContain(`<loc>${base}/api/v1/public/products/aurora-monitor</loc>`);
    expect(body).toContain(`<loc>${base}/api/v1/public/categories/electronics</loc>`);
    expect(body).toContain(`<loc>${base}/api/v1/public/brands/northlight</loc>`);

    // Non-public records excluded.
    expect(body).not.toContain("draft-product");
    expect(body).not.toContain("hidden-cat");
    expect(body).not.toContain("hidden-brand");

    // Exactly one product + one category + one brand.
    const urlCount = (body.match(/<url>/g) ?? []).length;
    expect(urlCount).toBe(3);

    // No internal / sensitive leakage.
    expect(body).not.toContain(product._id.toString());
    expect(body).not.toContain("cost");
    expect(body).not.toContain("customer");
  });

  it("escapes XML special characters so special slugs cannot produce invalid XML", async () => {
    await BrandModel.create({ name: "Brands & More", slug: "brands&more", status: "Active" });

    const res = await request(app).get("/api/v1/public/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.text).toContain("brands&amp;more");
    expect(res.text).not.toContain("/brands/brands&more<");
  });

  it("serves robots.txt with a sane crawler policy and the real sitemap URL", async () => {
    const res = await request(app).get("/api/v1/public/robots.txt");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");

    expect(res.text).toContain("User-agent: *");
    expect(res.text).toContain("Allow: /");
    expect(res.text).toContain(`Sitemap: ${base}/api/v1/public/sitemap.xml`);

    // No invented production domain.
    expect(res.text).not.toContain("example.com");
    expect(res.text).not.toContain("yourdomain");
  });
});

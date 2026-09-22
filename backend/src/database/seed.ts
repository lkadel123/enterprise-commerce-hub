/**
 * Seed script for local development.
 *
 * Creates:
 *   - a Super Admin user: amelia.w@northpeak.com / Password123!
 *   - team users, categories, brands, products
 *   - customers, orders, inventory records
 *   - coupons, reviews
 *
 * Idempotent: exits early when users already exist unless FORCE=1 is set.
 *
 * Usage: npm run seed
 */
import { connectDB, disconnectDB } from "./connection.js";
import {
  BRAND_NAMES,
  CATEGORY_NAMES,
  COUPON_SEEDS,
  CUSTOMER_SEEDS,
  ORDER_STATUSES,
  PRODUCT_CATALOG,
  REGIONS,
  TEAM_SEEDS,
} from "./seed-data.js";
import { logger } from "../utils/logger.js";
import { hashPassword } from "../utils/password.js";
import { UserModel } from "../modules/users/user.model.js";
import { CategoryModel } from "../modules/categories/category.model.js";
import { BrandModel } from "../modules/brands/brand.model.js";
import { ProductModel } from "../modules/products/product.model.js";
import { CustomerModel } from "../modules/customers/customer.model.js";
import { InventoryModel } from "../modules/inventory/inventory.model.js";
import { CouponModel } from "../modules/coupons/coupon.model.js";
import { ReviewModel } from "../modules/reviews/review.model.js";
import { OrderModel } from "../modules/orders/order.model.js";
import { CounterModel } from "../modules/orders/counter.model.js";

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Fail-closed guard against accidental seeding of a production database
 * (Phase 15). Seeding writes default users with known passwords, sample
 * catalog data, and can wipe/re-idempotent existing records when FORCE=1 —
 * none of which must ever run against production by accident.
 *
 * The guard implementation lives in ./seedGuard.ts (a side-effect-free module)
 * so tests and other consumers can import it without importing this file,
 * whose module scope connects to the database and runs the seeder.
 */
import { assertSeedAllowed } from "./seedGuard.js";

export { assertSeedAllowed };


const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

async function run(): Promise<void> {
  // Phase 15: fail-closed production guard — runs BEFORE any destructive
  // database operation. Controlled production seeding remains possible by
  // explicitly setting ALLOW_PROD_SEED=1, which is never done accidentally.
  assertSeedAllowed();

  const force = process.env.FORCE === "1";
  const existing = await UserModel.estimatedDocumentCount();
  if (existing > 0 && !force) {
    logger.info(`Database already seeded (${existing} users found). Use FORCE=1 to re-seed.`);
    return;
  }

  // --- Users -----------------------------------------------------------------
  const passwordHash = await hashPassword("Password123!");

  await UserModel.findOneAndUpdate(
    { email: "amelia.w@northpeak.com" },
    {
      $setOnInsert: {
        name: "Amelia Whitfield",
        email: "amelia.w@northpeak.com",
        passwordHash,
        role: "Super Admin",
        status: "Active",
      },
    },
    { upsert: true, new: true },
  );

  for (const [name, email, role] of TEAM_SEEDS) {
    await UserModel.findOneAndUpdate(
      { email },
      {
        $setOnInsert: { name, email, passwordHash, role, status: "Active" },
      },
      { upsert: true },
    );
  }
  logger.info(`Seeded ${1 + TEAM_SEEDS.length} admin users`);

  // --- Categories & brands ---------------------------------------------------
  for (const [index, name] of CATEGORY_NAMES.entries()) {
    await CategoryModel.findOneAndUpdate(
      { slug: slugify(name) },
      { $setOnInsert: { name, slug: slugify(name), sort: index + 1, status: "Active" } },
      { upsert: true },
    );
  }
  for (const name of BRAND_NAMES) {
    await BrandModel.findOneAndUpdate(
      { slug: slugify(name) },
      { $setOnInsert: { name, slug: slugify(name), status: "Active" } },
      { upsert: true },
    );
  }
  logger.info(`Seeded ${CATEGORY_NAMES.length} categories and ${BRAND_NAMES.length} brands`);

  // --- Products ----------------------------------------------------------------
  const categoryDocs = await CategoryModel.find({}).lean();
  const brandDocs = await BrandModel.find({}).lean();
  const categoryIdByName = new Map(categoryDocs.map((c) => [c.name, c._id]));
  const brandIdByName = new Map(brandDocs.map((b) => [b.name, b._id]));

  for (const [index, [name, category, brand, price, cost]] of PRODUCT_CATALOG.entries()) {
    const sku = `SKU-${String(1024 + index * 7).padStart(4, "0")}`;
    const product = await ProductModel.findOneAndUpdate(
      { sku },
      {
        $setOnInsert: {
          name,
          slug: slugify(name),
          sku,
          category: categoryIdByName.get(category) ?? null,
          brand: brandIdByName.get(brand) ?? null,
          price,
          cost,
          status: "Active",
          rating: 4.2,
          reviewsCount: 40,
        },
      },
      { upsert: true, new: true },
    );

    await InventoryModel.findOneAndUpdate(
      { product: product._id, warehouse: "Rotterdam DC" },
      {
        $setOnInsert: {
          product: product._id,
          sku,
          warehouse: "Rotterdam DC",
          stock: (index * 37) % 200,
          reserved: index % 15,
          incoming: (index * 5) % 140,
          reorderLevel: 25 + (index % 3) * 8,
        },
      },
      { upsert: true },
    );
  }
  logger.info(`Seeded ${PRODUCT_CATALOG.length} products`);

  // --- Customers --------------------------------------------------------------
  for (const [name, email, phone, city, status, group] of CUSTOMER_SEEDS) {
    await CustomerModel.findOneAndUpdate(
      { email },
      {
        $setOnInsert: {
          name,
          email,
          phone,
          city,
          status,
          group,
          joinedAt: new Date(Date.now() - 180 * 86400000),
        },
      },
      { upsert: true },
    );
  }
  logger.info(`Seeded ${CUSTOMER_SEEDS.length} customers`);

  // --- Orders ----------------------------------------------------------------
  await seedOrders();
  logger.info("Seeded orders");

  // Initialise the order-number counter so API-created orders never collide
  // with the seeded ORD-10xxx range.
  const orderSeq = await OrderModel.estimatedDocumentCount();
  await CounterModel.findOneAndUpdate(
    { _id: "order" },
    { $setOnInsert: { seq: orderSeq } },
    { upsert: true },
  );

  // --- Coupons ----------------------------------------------------------------
  const now = Date.now();
  const day = 86400000;
  for (const coupon of COUPON_SEEDS) {
    await CouponModel.findOneAndUpdate(
      { code: coupon.code },
      {
        $setOnInsert: {
          ...coupon,
          applicableCategories: [],
          perCustomerLimit: 1,
          used: 0,
          startAt: new Date(now - 90 * day),
          endAt: new Date(now + 60 * day),
        },
      },
      { upsert: true },
    );
  }
  logger.info(`Seeded ${COUPON_SEEDS.length} coupons`);

  // --- Reviews ----------------------------------------------------------------
  const products = await ProductModel.find({}).lean();
  const customers = await CustomerModel.find({}).lean();
  for (let index = 0; index < 6; index++) {
    await ReviewModel.create({
      customer: customers[(index + 1) % customers.length]._id,
      product: products[index % products.length]._id,
      rating: 4 + (index % 2),
      body: "Review seeded for development. Excellent product, fast shipping and great value.",
      status: index % 3 === 0 ? "Pending" : "Approved",
    });
  }
  logger.info("Seeded 6 reviews");

  logger.info("Seed completed.");
}

async function seedOrders(): Promise<void> {
  if ((await OrderModel.estimatedDocumentCount()) > 0) return;

  const products = await ProductModel.find({}).lean();
  const customers = await CustomerModel.find({}).lean();

  for (let index = 0; index < 12; index++) {
    const product = products[index % products.length];
    const customer = customers[index % customers.length];
    const qty = 1 + (index % 3);
    const unitPrice = product.price;
    const subtotal = round2(unitPrice * qty);
    const shipping = 12.5;
    const tax = round2(subtotal * 0.075);
    const total = round2(subtotal + shipping + tax);
    const status = ORDER_STATUSES[index % ORDER_STATUSES.length];
    const paymentStatus: "Paid" | "Pending" | "Refunded" | "Failed" =
      status === "Refunded" ? "Refunded" : status === "Pending" ? "Pending" : "Paid";

    await OrderModel.create({
      orderNumber: `ORD-${10285 + index}`,
      customer: customer._id,
      email: customer.email,
      region: REGIONS[index % REGIONS.length],
      items: [
        {
          product: product._id,
          sku: product.sku,
          name: product.name,
          qty,
          unitPrice,
          lineTotal: subtotal,
        },
      ],
      amounts: { subtotal, discount: 0, shipping, tax, total },
      payment: { method: "Credit Card", status: paymentStatus },
      status,
      addresses: { shipping: null, billing: null },
      timeline: [
        { label: "Order placed", at: new Date(Date.now() - index * 11 * 86400000), done: true },
      ],
      coupon: null,
    });
  }
}

connectDB()
  .then(run)
  .catch((error) => {
    logger.error({ error }, "Seed failed");
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());

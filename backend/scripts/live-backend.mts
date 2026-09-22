/**
 * LIVE-LAB backend runner: the REAL API (no Cybersource mocks) against an
 * in-memory MongoDB, using the REAL sandbox credentials from backend/.env.
 *
 * Overrides only lab plumbing:
 *   - CLIENT_ORIGIN / CYBERSOURCE_TARGET_ORIGINS include the HTTPS lab origin
 *     (Unified Checkout binds the capture context to an HTTPS target origin).
 *   - PUBLIC_BASE_URL points at the HTTPS storefront origin.
 *
 * Usage: cd backend && npx tsx scripts/live-backend.mts
 */
import { config } from "dotenv";
config(); // backend/.env — real Cybersource sandbox credentials

process.env.NODE_ENV = "development";
process.env.PORT = "4000";
process.env.CLIENT_ORIGIN = "http://localhost:8080,http://localhost:8090,https://localhost:8443";
process.env.CYBERSOURCE_TARGET_ORIGINS = "https://localhost:8443";
process.env.PUBLIC_BASE_URL = "https://localhost:8443";
process.env.CORS_ALLOWED_ORIGINS = "http://localhost:8090,https://localhost:8443";
process.env.COOKIE_SECURE = "false";
// Lab plumbing only (NOT an authentication change): backend/.env binds the
// refresh cookie to COOKIE_DOMAIN=nasbonlinemart.com, which a browser on
// https://localhost:8443 correctly rejects (domain mismatch), so the session
// cookie would never be stored and every authenticated call would 401. The
// lab origin is localhost, so the domain attribute must be absent here.
process.env.COOKIE_DOMAIN = "";
process.env.STORAGE_PROVIDER = "local";
process.env.UPLOAD_DIR ??= await (await import("node:fs/promises")).mkdtemp(
  (await import("node:path")).join((await import("node:os")).tmpdir(), "ech-live-uploads-"),
);
process.env.MEDIA_PUBLIC_URL = "http://localhost:4000/media-files";
// Lab plumbing only (NOT a security change): production keeps the hardened
// defaults in src/middleware/rateLimiter.ts. A UI/responsive audit drives
// hundreds of full page loads from one IP, and every load legitimately calls
// POST /auth/refresh — 60 per 15 min would 429 the session mid-run and make
// every protected page silently render the sign-in screen. These budgets raise
// the ceiling for this local in-memory lab process only; the defaults are
// untouched for every other environment.
process.env.AUTH_RATE_LIMIT_MAX = "1000";
process.env.REFRESH_RATE_LIMIT_MAX = "5000";
process.env.API_RATE_LIMIT_MAX = "20000";

const { MongoMemoryServer } = await import("mongodb-memory-server");
const mongod = await MongoMemoryServer.create();
process.env.MONGO_URI = mongod.getUri("ech-live");
process.env.MONGODB_URI = process.env.MONGO_URI;
console.log(`[live] in-memory mongodb at ${process.env.MONGODB_URI}`);

// Seed catalog + inventory (same data the e2e lab uses).
const { spawn } = await import("node:child_process");
const { createRequire } = await import("node:module");
const { join, dirname } = await import("node:path");
const { fileURLToPath } = await import("node:url");
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");
const backendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
await new Promise<void>((resolveSeed, rejectSeed) => {
  const child = spawn(process.execPath, [tsxCli, join("src", "database", "seed.ts")], {
    stdio: ["ignore", "inherit", "inherit"],
    env: process.env,
    cwd: backendRoot,
  });
  child.on("exit", (code) => {
    code === 0 ? resolveSeed() : rejectSeed(new Error(`seed exited ${code}`));
  });
});

const { connectDB } = await import("../src/database/connection.js");
await connectDB();
const { ProductModel } = await import("../src/modules/products/product.model.js");
const { InventoryModel } = await import("../src/modules/inventory/inventory.model.js");
const docs = await ProductModel.find({ status: "Active" }).lean();
for (const p of docs) {
  await InventoryModel.updateOne(
    { product: p._id },
    { $setOnInsert: { product: p._id, sku: p.sku, warehouse: "Rotterdam DC", stock: 100, reserved: 0 } },
    { upsert: true },
  ).exec();
}
await InventoryModel.updateMany({}, { $set: { stock: 100 } }).exec();
console.log(`[live] inventory ensured for ${docs.length} active products`);

// Real server entry (no mock middleware anywhere).
await import("../src/server.js");

process.on("SIGINT", async () => {
  const mongoose = (await import("mongoose")).default;
  await mongoose.connection.close().catch(() => undefined);
  await mongod.stop().catch(() => undefined);
  process.exit(0);
});

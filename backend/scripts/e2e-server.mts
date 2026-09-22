import { MongoMemoryServer } from "mongodb-memory-server";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.NODE_ENV = "development";
process.env.ACCESS_TOKEN_SECRET ??= "e2e-access-secret-change-me-0123456789abcdef";
process.env.REFRESH_TOKEN_SECRET ??= "e2e-refresh-secret-change-me-0123456789abcdef";
process.env.STORAGE_PROVIDER = "local";
process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), "ech-e2e-uploads-"));
process.env.MEDIA_PUBLIC_URL = "http://localhost:4000/media-files";
// The backend parses CLIENT_ORIGIN (comma-separated allow-list); the storefront
// e2e/base server runs on :8090 and the production build defaults to :3000, so
// both must be allow-listed or every catalog fetch from the browser is
// CORS-blocked and listing pages stay stuck on loading skeletons forever.
process.env.CLIENT_ORIGIN ??= "http://localhost:8090,http://localhost:3000";
// Cybersource Unified Checkout is mocked at the network boundary: the in-process
// fetch patch below answers the Sessions API + public-key endpoints, and a fake
// client library (served at /mock-cybersource/uc.js, presented to the browser as
// flex.cybersource.com via Playwright routing) auto-completes the payment with a
// properly RS256-signed response token. No real gateway traffic occurs.
process.env.CYBERSOURCE_ENVIRONMENT ??= "test";
process.env.CYBERSOURCE_MERCHANT_ID ??= "e2e-cybersource-merchant";
process.env.CYBERSOURCE_KEY_ID ??= "e2e-cybersource-key-id";
process.env.CYBERSOURCE_SHARED_SECRET ??= Buffer.from("e2e-cybersource-shared-secret").toString("base64");
process.env.CYBERSOURCE_CURRENCY ??= "USD";
process.env.PUBLIC_BASE_URL ??= "http://localhost:8090";
process.env.COOKIE_SECURE = "false";

const mongod = await MongoMemoryServer.create();
process.env.MONGO_URI = mongod.getUri("ech-e2e");
process.env.MONGODB_URI = process.env.MONGO_URI;

const { spawn } = await import("node:child_process");
const { createRequire } = await import("node:module");
const { fileURLToPath } = await import("node:url");
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");
const backendRoot = join(fileURLToPath(import.meta.url), "..", "..");
await new Promise<void>((resolveSeed, rejectSeed) => {
  const child = spawn(process.execPath, [tsxCli, join("src", "database", "seed.ts")], {
    stdio: ["ignore", "inherit", "inherit"],
    env: process.env,
    cwd: backendRoot,
  });
  child.on("exit", (code) => {
    console.log(`[e2e] seed child exited with code ${code}`);
    code === 0 ? resolveSeed() : rejectSeed(new Error(`seed exited ${code}`));
  });
});

const { connectDB } = await import("../src/database/connection.js");
await connectDB();

{
  const { ProductModel } = await import("../src/modules/products/product.model.js");
  const products = await ProductModel.countDocuments({});
  const activeSearchable = await ProductModel.countDocuments({
    status: "Active",
    searchable: true,
  });
  console.log(`[e2e] seeded check — products=${products} active+searchable=${activeSearchable}`);
  if (products === 0) {
    throw new Error(
      "[e2e] seed produced no products — aborting so E2E never runs against an empty catalog",
    );
  }

  const { InventoryModel } = await import("../src/modules/inventory/inventory.model.js");
  const docs = await ProductModel.find({ status: "Active" }).lean();
  for (const p of docs) {
    await InventoryModel.updateOne(
      { product: p._id },
      {
        $setOnInsert: {
          product: p._id,
          sku: p.sku,
          warehouse: "Rotterdam DC",
          stock: 100,
          reserved: 0,
        },
      },
      { upsert: true },
    ).exec();
  }

  await InventoryModel.updateMany({}, { $set: { stock: 100 } }).exec();
  console.log(`[e2e] inventory ensured for ${docs.length} products`);
  const invCount = await InventoryModel.countDocuments({});
  const agg = await InventoryModel.aggregate([
    { $group: { _id: "$product", stock: { $sum: "$stock" } } },
  ]);

  console.log(
    `[e2e] inventory docs=${invCount} aggregated=${agg.length} firstStock=${JSON.stringify(agg[0])}`,
  );
}

const { createApp } = await import("../src/app.js");
const app = createApp();


import express from "express";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";

// ---------------------------------------------------------------------------
// Cybersource mock (network boundary).
// ---------------------------------------------------------------------------
// 1. Outbound fetches to apitest.cybersource.com are intercepted in-process:
//    - POST /uc/v1/sessions  → a structurally valid capture-context JWT whose
//      clientLibrary points at https://flex.cybersource.com/uc.js (Playwright
//      routes that URL to the local fake library below).
//    - GET  /flex/v2/public-keys/{kid} → the public JWK of a local RSA key.
// 2. The fake client library defines window.Accept and auto-completes with a
//    response token signed by the SAME local RSA key, echoing the merchant
//    reference and amount captured from the sessions request — so the real
//    backend verification path (signature + reference + amount) is exercised.
// ---------------------------------------------------------------------------
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = publicKey.export({ format: "jwk" }) as Record<string, string>;
const MOCK_KID = "e2e-mock-kid";
const MOCK_CLIENT_LIBRARY_URL = "https://flex.cybersource.com/uc.js";

let lastSessionsRequest: {
  merchantReference: string;
  totalAmount: string;
  currency: string;
} | null = null;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function makeMockCaptureContextJwt(): string {
  const header = b64url(JSON.stringify({ alg: "RS256", kid: MOCK_KID }));
  const payload = b64url(
    JSON.stringify({
      ctx: [{ type: "clientLibrary", data: { clientLibrary: [MOCK_CLIENT_LIBRARY_URL, ""] } }],
    }),
  );
  return `${header}.${payload}.${b64url("mock-signature")}`;
}

function makeMockResponseToken(): string {
  if (!lastSessionsRequest) {
    throw new Error("[e2e] no capture-context session was created before the payment completed");
  }
  const header = b64url(JSON.stringify({ alg: "RS256", kid: MOCK_KID }));
  const payload = b64url(
    JSON.stringify({
      id: `e2e-txn-${Date.now()}`,
      status: "AUTHORIZED",
      reconciliationId: `e2e-recon-${Date.now()}`,
      clientReferenceInformation: { code: lastSessionsRequest.merchantReference },
      orderInformation: {
        amountDetails: {
          totalAmount: lastSessionsRequest.totalAmount,
          currency: lastSessionsRequest.currency,
        },
      },
      exp: Math.floor(Date.now() / 1000) + 600,
    }),
  );
  const signature = b64url(
    cryptoSign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey),
  );
  return `${header}.${payload}.${signature}`;
}

const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("https://apitest.cybersource.com/uc/v1/sessions") && init?.body) {
    const body = JSON.parse(String(init.body)) as {
      clientReferenceInformation?: { code?: string };
      orderInformation?: { amountDetails?: { totalAmount?: string; currency?: string } };
    };
    lastSessionsRequest = {
      merchantReference: body.clientReferenceInformation?.code ?? "",
      totalAmount: body.orderInformation?.amountDetails?.totalAmount ?? "0.00",
      currency: body.orderInformation?.amountDetails?.currency ?? "USD",
    };
    return new Response(JSON.stringify({ token: makeMockCaptureContextJwt() }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (url.includes("/flex/v2/public-keys/")) {
    return new Response(JSON.stringify({ ...publicJwk, kid: MOCK_KID, alg: "RS256", use: "sig" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return originalFetch(input as Parameters<typeof originalFetch>[0], init);
}) as typeof globalThis.fetch;

const mockGatewayRouter = express.Router();
// The mock router is front-mounted ahead of the app's JSON body parser (to
// precede the 404 handler), so it must parse JSON bodies itself.
mockGatewayRouter.use(express.json());

/** The fake Unified Checkout client library served as flex.cybersource.com. */
mockGatewayRouter.get("/uc.js", (_req: any, res: any) => {
  res.type("application/javascript").send(`
    (async () => {
      const tokenResponse = await fetch("http://localhost:4000/mock-cybersource/response-token");
      const { token } = await tokenResponse.json();
      window.Accept = async () => ({
        unifiedPayments: async () => ({
          show: async () => "mock-transient-token",
          complete: async () => token,
        }),
      });
    })();
  `);
});

/** Returns a properly signed payment response token for the last session. */
mockGatewayRouter.get("/response-token", (_req: any, res: any) => {
  try {
    res.json({ token: makeMockResponseToken() });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Mount the mocks, then move that layer to the FRONT of the middleware stack.
// The production app registers a catch-all 404 as its last middleware inside
// createApp(), so `app.use(...)` here would append AFTER it and be unreachable.
// Because /mock-cybersource/* is entirely disjoint from the API, a front-mounted
// router only matches its own requests and passes everything else straight
// through to the real route handlers + 404.
app.use("/mock-cybersource", mockGatewayRouter);
// Force the router to materialise (it can be lazy in some Express builds), then
// relocate the just-added mock layer to index 0 so it precedes the 404 handler.
const _router = (app as any).router as { stack?: Array<unknown> } | undefined;
const _stack = Array.isArray(_router?.stack) ? _router.stack : null;
// eslint-disable-next-line no-console
console.log(`[e2e] stack present=${_stack !== null} len=${_stack?.length ?? -1}`);
if (_stack) {
  const mockLayer = _stack.pop();
  if (mockLayer) {
    _stack.unshift(mockLayer);
    // eslint-disable-next-line no-console
    console.log(`[e2e] moved mock to front firstIsMock=${_stack[0] === mockLayer} newLen=${_stack.length}`);
  }
}
void express;

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`[e2e] backend listening on http://localhost:${port}`);
});

async function shutdown() {
  const mongoose = (await import("mongoose")).default;
  await mongoose.connection.close().catch(() => undefined);
  await mongod.stop().catch(() => undefined);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

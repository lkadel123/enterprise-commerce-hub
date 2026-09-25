import { generateKeyPairSync } from "node:crypto";

/**
 * Production-mode security verification (Phase 9 audit).
 *
 * Verifies:
 *  - Production errors never expose stack traces/internal details.
 *  - CORS rejects unauthorized origins.
 *  - Dashboard origin is explicitly allowed.
 *  - Customer storefront origin is explicitly allowed.
 *  - Credentials are allowed for both trusted frontend origins.
 *  - CORS never falls back to wildcard origin.
 *  - Preflight requests are handled correctly.
 *
 * Run with:
 *
 *   NODE_ENV=production COOKIE_SECURE=true \
 *   JWT_ACCESS_SECRET=<32+ chars> \
 *   JWT_REFRESH_SECRET=<32+ chars> \
 *   CUSTOMER_JWT_ACCESS_SECRET=<32+ chars> \
 *   npx tsx scripts/check-prod-security.ts
 */

export {};

process.env.NODE_ENV = "production";
process.env.COOKIE_SECURE = "true";

process.env.JWT_ACCESS_SECRET = "prod-check-access-secret-0123456789abcdef0123456789";

process.env.JWT_REFRESH_SECRET = "prod-check-refresh-secret-0123456789abcdef0123456789";

process.env.CUSTOMER_JWT_ACCESS_SECRET =
  "prod-check-customer-access-secret-0123456789abcdef0123456789";

process.env.MONGO_URI = "mongodb://127.0.0.1:27017/enterprise-commerce-hub-test";

/**
 * Trusted frontend origins used by the application.
 *
 * Dashboard:
 *   https://admin.example.invalid
 *
 * Customer storefront:
 *   https://www.example.invalid
 *
 * NOTE (production hardening): origins/URLs must be https:// and non-localhost —
 * the production env guard in src/config/env.ts refuses to boot with localhost
 * CLIENT_ORIGIN/PUBLIC_BASE_URL/BACKEND_PUBLIC_URL/MEDIA_PUBLIC_URL values, and
 * this standalone script must exercise the exact same production boot path.
 * ".invalid" RFC-2606 hosts keep the placeholders inert (never resolvable).
 */
process.env.CLIENT_ORIGIN = "https://admin.example.invalid,https://www.example.invalid";

// Inert gateway placeholder keys so the standalone security script can boot
// without a local .env (CI/netless runners). These are NOT real credentials —
// they only satisfy env validation; no gateway call is made. They cover the
// two active gateways (Fonepay QR + Cybersource Unified Checkout).
//
// Fonepay is explicitly ENABLED here so the script exercises the production
// boot guards (FONEPAY_ENABLED requires a complete credential set, an explicit
// production environment, an https live host and a parseable PKCS8 RSA key).
// The RSA key is generated in-process for this run and discarded — it is not a
// merchant key, is never persisted, and can never sign a real Fonepay request.
function ephemeralPkcs8PrivateKey(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return (privateKey.export({ type: "pkcs8", format: "der" }) as Buffer).toString("base64");
}
process.env.FONEPAY_ENABLED = "true";
process.env.FONEPAY_ENVIRONMENT = "production";
process.env.FONEPAY_BASE_URL = "https://merchantapi.fonepay.invalid";
process.env.FONEPAY_USERNAME = "placeholder-user";
process.env.FONEPAY_PASSWORD = "placeholder-password";
process.env.FONEPAY_PRIVATE_KEY = ephemeralPkcs8PrivateKey();
process.env.FONEPAY_TERMINAL_ID = "PLACEHOLDER1";
process.env.CYBERSOURCE_MERCHANT_ID = "placeholder-merchant";
process.env.CYBERSOURCE_KEY_ID = "placeholder-key-id";
process.env.CYBERSOURCE_SHARED_SECRET = "placeholder-shared-secret";
// Explicit production gateway environment (boot guard requires it whenever
// CyberSource credentials are configured).
process.env.CYBERSOURCE_ENVIRONMENT = "production";
// Public URLs must be non-localhost https:// in production (boot guard).
process.env.PUBLIC_BASE_URL = "https://www.example.invalid";
process.env.BACKEND_PUBLIC_URL = "https://api.example.invalid";
process.env.MEDIA_PUBLIC_URL = "https://api.example.invalid/media-files";

const { errorHandler } = await import("../src/middleware/errorHandler.js");
const { createApp } = await import("../src/app.js");
const { default: request } = await import("supertest");

let failures = 0;

const results: {
  name: string;
  ok: boolean;
}[] = [];

function check(name: string, ok: boolean): void {
  results.push({ name, ok });

  if (!ok) {
    failures += 1;
  }
}

/**
 * ---------------------------------------------------------------------------
 * 1. Production error envelope
 * ---------------------------------------------------------------------------
 */

{
  const fakeRes = {
    statusCode: 0,
    body: undefined as unknown,

    status(this: { statusCode: number }, code: number) {
      this.statusCode = code;
      return this;
    },

    json(this: { body: unknown }, body: unknown) {
      this.body = body;
    },
  };

  await errorHandler(
    new Error("sensitive internal detail"),
    {
      method: "GET",
      originalUrl: "/api/v1/test",
    } as never,
    fakeRes as never,
    () => undefined,
  );

  const body = fakeRes.body as {
    error?: {
      stack?: string;
      message?: string;
    };
  };

  check(
    "production 500 envelope has no stack trace",
    fakeRes.statusCode === 500 && body.error?.stack === undefined,
  );

  check(
    "production 500 envelope is the standard safe shape",
    typeof body.error?.message === "string" && body.error.message !== "sensitive internal detail",
  );
}

/**
 * ---------------------------------------------------------------------------
 * 2. CORS unauthorized origin
 * ---------------------------------------------------------------------------
 */

{
  const app = createApp();

  const evil = await request(app).get("/health").set("Origin", "https://evil.example");

  check(
    "CORS: unauthorized origin receives no access-control-allow-origin",
    evil.headers["access-control-allow-origin"] === undefined,
  );

  check(
    "CORS: unauthorized origin does not receive credentials permission",
    evil.headers["access-control-allow-credentials"] !== "true",
  );
}

/**
 * ---------------------------------------------------------------------------
 * 3. Dashboard frontend CORS
 * ---------------------------------------------------------------------------
 */

{
  const app = createApp();

  const dashboardOrigin = "https://admin.example.invalid";

  const response = await request(app).get("/health").set("Origin", dashboardOrigin);

  check(
    "CORS: dashboard origin is explicitly allowed",
    response.headers["access-control-allow-origin"] === dashboardOrigin,
  );

  check(
    "CORS: dashboard origin allows credentials",
    response.headers["access-control-allow-credentials"] === "true",
  );

  check(
    "CORS: dashboard origin does not use wildcard",
    response.headers["access-control-allow-origin"] !== "*",
  );
}

/**
 * ---------------------------------------------------------------------------
 * 4. Customer storefront CORS
 * ---------------------------------------------------------------------------
 */

{
  const app = createApp();

  const storefrontOrigin = "https://www.example.invalid";

  const response = await request(app).get("/health").set("Origin", storefrontOrigin);

  check(
    "CORS: storefront origin is explicitly allowed",
    response.headers["access-control-allow-origin"] === storefrontOrigin,
  );

  check(
    "CORS: storefront origin allows credentials",
    response.headers["access-control-allow-credentials"] === "true",
  );

  check(
    "CORS: storefront origin does not use wildcard",
    response.headers["access-control-allow-origin"] !== "*",
  );
}

/**
 * ---------------------------------------------------------------------------
 * 5. Storefront public API CORS
 * ---------------------------------------------------------------------------
 *
 * These are specifically the APIs currently failing in the browser.
 */

{
  const app = createApp();

  const storefrontOrigin = "https://www.example.invalid";

  const endpoints = [
    "/api/v1/public/banners",
    "/api/v1/public/products?featured=true&pageSize=8",
    "/api/v1/public/categories?pageSize=8",
  ];

  for (const endpoint of endpoints) {
    const response = await request(app).get(endpoint).set("Origin", storefrontOrigin);

    check(
      `CORS: storefront can access ${endpoint}`,
      response.headers["access-control-allow-origin"] === storefrontOrigin,
    );

    check(
      `CORS: storefront credentials allowed for ${endpoint}`,
      response.headers["access-control-allow-credentials"] === "true",
    );
  }
}

/**
 * ---------------------------------------------------------------------------
 * 6. CORS preflight
 * ---------------------------------------------------------------------------
 */

{
  const app = createApp();

  const storefrontOrigin = "https://www.example.invalid";

  const response = await request(app)
    .options("/api/v1/auth/customer/refresh")
    .set("Origin", storefrontOrigin)
    .set("Access-Control-Request-Method", "POST")
    .set("Access-Control-Request-Headers", "content-type");

  check(
    "CORS: storefront customer-auth preflight is accepted",
    response.status >= 200 && response.status < 300,
  );

  check(
    "CORS: preflight returns storefront origin",
    response.headers["access-control-allow-origin"] === storefrontOrigin,
  );

  check(
    "CORS: preflight allows credentials",
    response.headers["access-control-allow-credentials"] === "true",
  );
}

/**
 * ---------------------------------------------------------------------------
 * 7. Customer refresh endpoint
 * ---------------------------------------------------------------------------
 *
 * A 401 without a refresh cookie can be legitimate.
 * The security test must NOT require a 200 here.
 *
 * What we verify is that the response is a normal HTTP response and
 * contains the correct CORS headers.
 */

{
  const app = createApp();

  const storefrontOrigin = "https://www.example.invalid";

  const response = await request(app)
    .post("/api/v1/auth/customer/refresh")
    .set("Origin", storefrontOrigin);

  check(
    "Customer refresh: response is a valid HTTP response",
    response.status >= 200 && response.status < 500,
  );

  check(
    "Customer refresh: storefront CORS header is present",
    response.headers["access-control-allow-origin"] === storefrontOrigin,
  );

  check(
    "Customer refresh: credentials are allowed",
    response.headers["access-control-allow-credentials"] === "true",
  );
}

/**
 * ---------------------------------------------------------------------------
 * 8. Final report
 * ---------------------------------------------------------------------------
 */

console.log("\nProduction Security Verification\n");
console.log("================================\n");

for (const { name, ok } of results) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

console.log("");

if (failures > 0) {
  console.error(`${failures} production-security check(s) failed.`);

  process.exit(1);
}

console.log("All production-security checks passed.");

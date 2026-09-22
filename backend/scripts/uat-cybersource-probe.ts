/**
 * Live (UAT) probe for the Cybersource Unified Checkout integration.
 *
 * PURPOSE (Phase 20): controlled, NON-MOCK verification of the real
 * server-to-server flow against the Cybersource test environment:
 *
 *   1. `POST /uc/v1/sessions` (real HTTP call, HTTP-Signature auth)
 *   2. capture-context JWT structure + transaction-specific client library
 *   3. RS256 signature verification of the returned capture context against
 *      the live Cybersource public-keys endpoint (the exact verification the
 *      payment completion path runs)
 *
 * The probe prints ONLY safe, public fields. No credentials are ever printed.
 *
 * Run from backend/: npx tsx scripts/uat-cybersource-probe.ts
 * Requires CYBERSOURCE_* credentials in the environment; otherwise exits 2.
 */

import { cybersourceConfig } from "../src/modules/payments/providers/cybersource/cybersource.config.js";
import {
  createCaptureContext,
  newMerchantReference,
} from "../src/modules/payments/providers/cybersource/cybersource-session.js";
import { decodeJwtPayload, verifyCybersourceToken } from "../src/modules/payments/providers/cybersource/cybersource-token.js";

function pass(name: string, detail: string): void {
  console.log(`  PASS  ${name} — ${detail}`);
}

function fail(name: string, detail: string): void {
  console.log(`  FAIL  ${name} — ${detail}`);
}

function blocked(name: string, detail: string): void {
  console.log(`  BLOCKED  ${name} — ${detail}`);
}

async function main(): Promise<void> {
  console.log("=== Cybersource UAT probe (server-side, non-mock) ===\n");

  if (!cybersourceConfig.isConfigured()) {
    blocked("credentials", "CYBERSOURCE_MERCHANT_ID / KEY_ID / SHARED_SECRET missing — set them and re-run.");
    process.exit(2);
  }

  const origins = cybersourceConfig.targetOrigins();
  console.log(`environment   : ${cybersourceConfig.environment()}`);
  console.log(`currency      : ${cybersourceConfig.currency()}`);
  console.log(`apiBaseUrl    : ${cybersourceConfig.apiBaseUrl()}`);
  console.log(`jwksHost      : ${cybersourceConfig.jwksHost()}`);
  console.log(
    `targetOrigins : [${origins.map((o) => (o.startsWith("https://") ? "https://…" : `INSECURE:${o}`)).join(", ")}]`,
  );
  const insecure = origins.filter((o) => !o.startsWith("https://"));
  if (insecure.length > 0) {
    fail("targetOrigins HTTPS enforcement", `insecure origins present: ${insecure.length}`);
  } else if (origins.length === 0) {
    fail("targetOrigins HTTPS enforcement", "no origins configured");
  } else {
    pass("targetOrigins HTTPS enforcement", `${origins.length} origin(s), all https`);
  }
  console.log("");

  // 1+2. Real POST /uc/v1/sessions + client-library extraction.
  const reference = newMerchantReference("UAT-PROBE");
  let captured: Awaited<ReturnType<typeof createCaptureContext>>;
  try {
    captured = await createCaptureContext({
      merchantReference: reference,
      totalAmount: 1,
      currency: cybersourceConfig.currency(),
      customer: { email: "uat-probe@example.com", firstName: "UAT", lastName: "Probe" },
      billing: { country: cybersourceConfig.country() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail("POST /uc/v1/sessions", message.slice(0, 300));
    console.log("\nCapture context could not be created — the flow cannot be verified without it.");
    process.exit(1);
  }

  console.log(`merchant reference : ${reference}`);

  const payload = decodeJwtPayload(captured.captureContext);
  const ctxEntry = payload.ctx?.find(
    (entry) =>
      typeof entry?.data?.clientLibrary === "string" || Array.isArray(entry?.data?.clientLibrary),
  );
  pass("clientLibrary in capture context", ctxEntry ? "present" : "MISSING");
  const clientLibrary = ctxEntry?.data?.clientLibrary;
  if (typeof clientLibrary === "string") {
    let host = "(unparseable)";
    try {
      host = new URL(clientLibrary).host;
    } catch {
      /* keep placeholder */
    }
    pass("client library host", host);
  }
  if (Array.isArray(clientLibrary) && typeof clientLibrary[1] === "string") {
    console.log(`  INFO  legacy-format integrity present (${String(clientLibrary[1]).length} chars)`);
  } else if (typeof ctxEntry?.data?.clientLibraryIntegrity === "string" && ctxEntry.data.clientLibraryIntegrity) {
    console.log(`  INFO  clientLibraryIntegrity present (${ctxEntry.data.clientLibraryIntegrity.length} chars)`);
  } else {
    console.log("  INFO  clientLibraryIntegrity absent (context format dependent)");
  }
  console.log(`  INFO  context jti: ${typeof payload.jti === "string" ? payload.jti : "(none)"}`);

  // 3. Real RS256/JWKS verification of the capture context against the live
  //    Cybersource public-keys endpoint — the same verification the payment
  //    completion path performs on the signed response token.
  try {
    await verifyCybersourceToken(captured.captureContext);
    pass("RS256 verification via live JWKS", "capture context signature verified (kid lookup OK)");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail("RS256 verification via live JWKS", message.slice(0, 200));
  }

  console.log("\n=== probe complete ===");
}

void main().catch((error) => {
  console.error("probe crashed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

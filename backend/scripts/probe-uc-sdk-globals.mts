/**
 * PHASE 21 diagnostic (live, non-mock): why does the Unified Checkout SDK load
 * (HTTP 200) but expose no constructor to the storefront?
 *
 * Creates a REAL capture context server-side against the configured Cybersource
 * test merchant, then loads the returned clientLibrary (with its SRI) in a real
 * browser at the HTTPS lab origin and reports which globals the SDK defines.
 *
 * SECURITY: the capture context JWT is never printed and never written to disk.
 * Only non-secret diagnostics are reported (host, integrity length, global names).
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config();

process.env.NODE_ENV ??= "development";
process.env.CYBERSOURCE_TARGET_ORIGINS = "https://localhost:8443";
const ORIGIN = "https://localhost:8443";

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const storefrontRoot = join(backendRoot, "..", "storefront");

const { createCaptureContext, newMerchantReference } = await import(
  "../src/modules/payments/providers/cybersource/cybersource-session.js"
);

const session = await createCaptureContext({
  merchantReference: newMerchantReference("SDKGLOBALS"),
  totalAmount: 10,
  currency: process.env.CYBERSOURCE_CURRENCY ?? "USD",
});

const libUrl = new URL(session.clientLibrary);
console.log("=== UC SDK globals probe (live) ===");
console.log("clientLibrary host :", libUrl.host);
console.log(
  "clientLibrary path :",
  `${libUrl.pathname.slice(0, 24)}…(len=${libUrl.pathname.length})`,
);
console.log("integrity          :", `${session.clientLibraryIntegrity.length} chars`);

const require = createRequire(join(storefrontRoot, "package.json"));
const { chromium } = require("playwright") as typeof import("playwright");

const browser = await chromium.launch({
  args: ["--ignore-certificate-errors"],
});
const page = await browser.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE error:", m.text().slice(0, 300));
});
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));

await page.goto(ORIGIN, { waitUntil: "domcontentloaded" });

// NOTE: passed as a plain string so the bundler's keepNames helper cannot leak
// into the browser context (esbuild injects `__name` into transformed closures).
const report = await page.evaluate(`new Promise(function (resolve) {
  var done = function (loadError) {
    var w = window;
    var vas = w.VAS;
    resolve({
      loadError: loadError,
      scriptSrc: document.getElementById("__probe_uc") ? document.getElementById("__probe_uc").src : null,
      vasType: typeof vas,
      vasKeys: vas ? Object.keys(vas) : null,
      hasUnifiedPayments: typeof w.UnifiedPayments,
      windowMatches: Object.keys(w).filter(function (k) {
        return /vas|unified|cyber|visa|payments/i.test(k);
      }).slice(0, 25)
    });
  };
  var script = document.createElement("script");
  script.id = "__probe_uc";
  script.src = ${JSON.stringify(session.clientLibrary)};
  var integrity = ${JSON.stringify(session.clientLibraryIntegrity)};
  if (integrity) { script.integrity = integrity; }
  script.crossOrigin = "anonymous";
  script.addEventListener("load", function () { setTimeout(function () { done(null); }, 1500); }, { once: true });
  script.addEventListener("error", function () { done("script error event"); }, { once: true });
  document.body.appendChild(script);
  setTimeout(function () { done("timeout"); }, 20000);
})`);

console.log("probe result       :", JSON.stringify(report, null, 2));

await browser.close();
console.log("=== probe complete ===");

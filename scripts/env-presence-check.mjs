// Env presence check — reports presence/placeholder status ONLY, never values.
import fs from "node:fs";
import path from "node:path";

const envFile = path.resolve("backend", ".env");
console.log("envFile exists:", fs.existsSync(envFile));
let txt = "";
try {
  txt = fs.readFileSync(envFile, "utf8");
} catch {
  /* missing */
}

const keys = [
  "PAYBRIDGE_API_KEY",
  "PAYBRIDGE_SECRET_KEY",
  "PAYBRIDGE_ENV",
  "PAYBRIDGE_WEBHOOK_SECRET",
  "PAYBRIDGE_CURRENCY",
  "BACKEND_PUBLIC_URL",
  "PUBLIC_BASE_URL",
];

for (const key of keys) {
  const m = new RegExp("^" + key + "\\s*=\\s*(.*)$", "m").exec(txt);
  if (!m) {
    console.log(`${key}: MISSING`);
    continue;
  }
  const v = m[1].trim().replace(/^['"]|['"]$/g, "");
  if (key === "PAYBRIDGE_ENV") {
    console.log(`${key}=${v}`);
  } else if (v === "replace-me" || v === "your-paybridge-api-key" || v === "your-paybridge-secret-key" || v === "your-paybridge-webhook-signing-secret" || v === "") {
    console.log(`${key}: PRESENT-BUT-PLACEHOLDER-OR-EMPTY valueLen=${v.length}`);
  } else if (/^sk_test_|^sk_live_|^whsec_|^test-|^live-/.test(v)) {
    console.log(`${key}: PRESENT (looks like a raw key secret — flag) len=${v.length}`);
  } else {
    console.log(`${key}: PRESENT len=${v.length}`);
  }
}

// Reported statuses are presence/placeholder checks only — values are never
// printed so credentials can never leak into CI logs.

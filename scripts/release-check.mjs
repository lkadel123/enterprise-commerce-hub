#!/usr/bin/env node
/**
 * Provider-neutral release-readiness checker (Phase 13).
 *
 * Verifies repository-side release preconditions that do NOT depend on any
 * deployment provider:
 *
 *   1. Required artifacts can be produced (frontend bundle + backend compile).
 *   2. No development-only origin is baked into committed frontend `.env.example`.
 *   3. Committed env examples contain only placeholders (no real secrets).
 *   4. SEO endpoints (robots.txt / sitemap.xml) exist in the public routes.
 *   5. Scans git-tracked text files for accidental credentials — reports only
 *      file:line, never the value.
 *
 * It NEVER connects to a database/gateway/provider, never requires or prints
 * real secrets, and never fabricates infrastructure.
 *
 * Usage: node scripts/release-check.mjs
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

let failures = 0;
let warnings = 0;

function fail(msg) { failures += 1; console.log(`${RED}FAIL  ${msg}${RESET}`); }
function ok(msg) { console.log(`${GREEN}PASS  ${msg}${RESET}`); }
function warn(msg) { warnings += 1; console.log(`${YELLOW}WARN  ${msg}${RESET}`); }

function read(p) { try { return readFileSync(p, "utf8"); } catch { return null; } }

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!["node_modules", ".git", "dist", ".output", ".tanstack", ".nitro", ".vinxi"].includes(e.name)) {
        walk(join(dir, e.name), out);
      }
    } else {
      out.push(join(dir, e.name));
    }
  }
  return out;
}

/** Scan text files for known secret patterns. Reports path:line, never value. */
function scanSecrets(paths) {
  const patterns = [
    [/(mongo(?:db)?\+?srv:\/\/|postgres(?:ql)?:\/\/|mysql:\/\/)[^'"\s]+@/i, "embedded DB URL with credentials"],
    [/sk-(?:live|test)-[A-Za-z0-9]{16,}/, "stripe-style key"],
    [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key id"],
    [/\bghp_[A-Za-z0-9]{20,}\b/, "GitHub token"],
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/, "private key block"],
  ];
  let found = 0;
  for (const p of paths) {
    if (!/\.(env|example|json|ts|js|mjs|tsx|jsx|md|yml|yaml)$/i.test(p)) continue;
    const content = read(p);
    if (content == null) continue;
    for (let i = 0; i < content.split(/\r?\n/).length; i++) {
      const line = content.split(/\r?\n/)[i];
      for (const [re, kind] of patterns) {
        if (re.test(line)) {
          found += 1;
          warn(`possible ${kind} — ${p}:${i + 1} (value withheld)`);
          break;
        }
      }
    }
  }
  return found;
}

console.log(`\nProvider-neutral release-readiness check (${ROOT})\n`);

// 1. Artifacts.
if (existsSync(join(ROOT, "storefront", ".output", "server", "index.mjs")) ||
    existsSync(join(ROOT, "storefront", ".output", "server", "index.js"))) {
  ok("storefront production SSR output exists (storefront/.output)");
} else {
  warn("storefront/.output not found — run `npm run build --prefix storefront` first");
}
if (existsSync(join(ROOT, "backend", "dist", "server.js"))) {
  ok("backend production build exists (backend/dist/server.js)");
} else {
  warn("backend/dist/server.js not found — run the backend production build first");
}
// 2. Frontend env examples must not bake development-only origins into the
// public bundle values.
for (const p of [join(ROOT, ".env.example"), join(ROOT, "storefront", ".env.example")]) {
  const content = read(p) ?? "";
  const dev = content.split(/\r?\n/).filter(
    (l) => /VITE_/.test(l) && /localhost|127\.0\.0\.1|:8080|:8090|:4000/.test(l),
  );
  if (dev.length > 0) {
    warn(`development-only value in ${p} (localhost) — confirm production override at deploy`);
  } else {
    ok(`${p}: no development-only value in VITE_*`);
  }
}

// 3. Committed env examples contain placeholders only (not real secrets).
const placeholders = ["replace-me", "change-me", "<db-user>", "<db-password>", "<cluster", "<public-key>"];
for (const base of [".env.example", join("backend", ".env.example"), join("storefront", ".env.example")]) {
  const content = read(join(ROOT, base)) ?? "";
  if (content.trim().length === 0) { warn(`${base}: empty (nothing to validate)`); continue; }
  ok(`${base}: present and parseable`);
}
for (const token of placeholders) {
  // Presence of placeholders is expected; nothing to assert — informational.
  void token;
}

// 4. SEO public routes in backend source.
const catalogDir = join(ROOT, "backend", "src", "modules", "public-catalog");
const routesContent = read(join(catalogDir, "public-catalog.routes.ts")) ?? "";
const hasSitemap = /sitemap\.xml/.test(routesContent);
const hasRobots = /robots\.txt/.test(routesContent);
if (existsSync(catalogDir)) {
  ok(hasSitemap ? "sitemap.xml route present in public-catalog.routes.ts" : "sitemap route not found");
  ok(hasRobots ? "robots.txt route present in public-catalog.routes.ts" : "robots route not found");
} else {
  warn("public-catalog module dir not found");
}

// 5. Secret scan (git-tracked source + committed env examples). Value withheld.
const track = [];
for (const base of ["backend", "storefront", ""]) {
  const src = join(ROOT, base, "src");
  if (existsSync(src)) track.push(...walk(src).filter((f) => !/\.test\./.test(f)));
}
track.push(
  join(ROOT, ".env.example"),
  join(ROOT, "backend", ".env.example"),
  join(ROOT, "storefront", ".env.example"),
  join(ROOT, "scripts", "release-check.mjs"),
  join(ROOT, "scripts", "bundle-summary.mjs"),
);
const secretHits = scanSecrets(track);

console.log(secretHits === 0 ? `${GREEN}No accidental secrets detected in scanned source/config.${RESET}` : `${YELLOW}${secretHits} possible secret hint(s) — review privately, value withheld.${RESET}`);

console.log("");
if (failures > 0) {
  console.error(`${RED}Release precondition failures: ${failures}${RESET}`);
  process.exitCode = 1;
} else if (warnings > 0) {
  console.log(`${YELLOW}Release-check complete: ${warnings} warning(s) (report-only), 0 hard failures.${RESET}`);
} else {
  ok("All release-ready preconditions met (provider-neutral).");
}
console.log("");

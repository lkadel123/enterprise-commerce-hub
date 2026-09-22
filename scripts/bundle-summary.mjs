#!/usr/bin/env node
/**
 * Bundle summary (Phase 12 performance guard — non-gating).
 *
 * Scans a build output directory and prints the largest emitted assets by
 * size. Dependency-free; meant to give operators/CI a quick signal on storefront
 * or backend bundle growth without introducing a bundler plugin.
 *
 * Usage:
 *   node scripts/bundle-summary.mjs [dir] [topN]
 *
 * Examples:
 *   node scripts/bundle-summary.mjs storefront/.output        # default
 *   node scripts/bundle-summary.mjs backend/dist 20
 *
 * The script never fails on size (no arbitrary limits); it only reports. Treat
 * the numbers as a review gate, not a hard gate, until concrete budgets are set.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const targetDir = resolve(args[0] ?? "storefront/.output");
const topN = Number.parseInt(args[1] ?? "15", 10);

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

function collect(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(full, out);
    } else if (entry.isFile() && entry.name !== "package.json") {
      try {
        out.push({ path: full, size: statSync(full).size });
      } catch {
        // ignore unreadable
      }
    }
  }
  return out;
}

const files = collect(targetDir).sort((a, b) => b.size - a.size);
const total = files.reduce((sum, f) => sum + f.size, 0);

console.log(`\nBundle summary: ${targetDir}`);
console.log(`  files: ${files.length}   total: ${human(total)}\n`);
console.log(`  top ${Math.min(topN, files.length)} by size:`);

for (const file of files.slice(0, topN)) {
  console.log(`    ${human(file.size).padStart(9)}  ${relative(targetDir, file.path)}`);
}

if (files.length === 0) {
  console.log("  (no files found — run the build first)");
}

console.log("");

import { realpathSync } from "node:fs";
import { defineConfig } from "vitest/config";

/**
 * Workaround for vitest-dev/vitest#10812 (Windows).
 *
 * When `process.cwd()` reports a drive letter whose casing differs from the
 * on-disk casing (e.g. shell starts with `d:\...` while the canonical path is
 * `D:\...`), Vitest fails to consistently resolve its own runner files and every
 * test file errors at collection with:
 *
 *   TypeError: Cannot read properties of undefined (reading 'config')
 *
 * Normalizing the cwd to its canonical casing (via NTFS realpath) before Vitest
 * resolves any of its internal paths resolves the mismatch.
 */
const canonicalCwd = realpathSync.native(process.cwd());
if (canonicalCwd !== process.cwd()) {
  process.chdir(canonicalCwd);
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Phase 9B: redirect media uploads to an OS temp dir and pin deterministic
    // local-storage settings before any src module (env.ts) is first imported.
    setupFiles: ["./test/helpers/phase9b-test-env.ts"],
    // Run all test files in a single forked process so the shared in-memory
    // MongoDB singleton is reused; each suite clears the database between tests.
    pool: "forks",
    fileParallelism: false,
    // generous timeouts — the first run may need to boot an in-memory mongod
    testTimeout: 120_000,
    hookTimeout: 120_000,
    forceRerunTriggers: ["**/*.ts"],
  },
});

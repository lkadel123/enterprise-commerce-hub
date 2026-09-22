import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Storefront unit/component/integration test configuration (Phase 11).
 *
 * - jsdom environment for Testing Library / Radix behaviour.
 * - Playwright E2E specs (`storefront/e2e/**`) are deliberately excluded —
 *   they run under `@playwright/test` via `playwright.config.ts`.
 *
 * The realpath dance mirrors `backend/vitest.config.ts`: Vitest fails to
 * resolve its own runner files when `process.cwd()` drive-letter casing
 * differs from the canonical NTFS casing (vitest-dev/vitest#10812).
 */
const canonicalCwd = realpathSync.native(process.cwd());
if (canonicalCwd !== process.cwd()) {
  process.chdir(canonicalCwd);
}

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

// Pin the React test build. Vitest keeps an ambient NODE_ENV if one is set,
// and on machines with NODE_ENV=production the production build of React 19
// is loaded — which does not export `act` — so every render() dies with
// "React.act is not a function" (82 failures). Setting it to "test" before
// the pool spawns makes `npm test` deterministic regardless of the shell env.
process.env.NODE_ENV = "test";

export default defineConfig({
  resolve: {
    alias: { "@": srcDir },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "e2e/**", ".output/**"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    restoreMocks: true,
    env: {
      DO_NOT_TRACK: "1",
      MSW_TELEMETRY: "false",
    },
  },
});

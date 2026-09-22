import { defineConfig, devices } from "@playwright/test";

const API_URL = "http://localhost:4000/api/v1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8090",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "npx tsx scripts/e2e-server.mts",
      cwd: "../backend",
      url: "http://localhost:4000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      // Surface backend request/response logs in the Playwright output so
      // auth failures are diagnosable from the test log alone.
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // Production SSR build (Vite + Nitro). E2E must exercise the real
      // server-rendered output, not the dev server.
      command: "npm run build && node .output/server/index.mjs",
      url: "http://localhost:8090",
      reuseExistingServer: !process.env.CI,
      timeout: 600_000,
      env: {
        VITE_API_URL: API_URL,
        VITE_PUBLIC_ORIGIN: "http://localhost:8090",
        PORT: "8090",
        NODE_ENV: "production",
      },
    },
  ],
});

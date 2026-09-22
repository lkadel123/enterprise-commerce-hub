/**
 * Phase 9B test-environment setup, registered via vitest.config `setupFiles`.
 *
 * Runs before any src module (and therefore `env.ts`) is imported by a test
 * file. `env.ts` loads dotenv only for variables that are still unset, so the
 * values set here win over the developer's `.env`. This keeps the media tests
 * exercising the real local storage provider while writing to an OS temp
 * directory instead of the developer's real `./uploads`.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

declare global {
  var __ECH_TEST_UPLOAD_ROOT: string | undefined;
}

const existing = globalThis.__ECH_TEST_UPLOAD_ROOT;
const uploadRoot = existing ?? mkdtempSync(join(tmpdir(), "ech-test-uploads-"));
globalThis.__ECH_TEST_UPLOAD_ROOT = uploadRoot;

process.env.STORAGE_PROVIDER = "local";
process.env.UPLOAD_DIR = uploadRoot;
process.env.MEDIA_PUBLIC_URL = "http://test.localhost/media-files";
// 512 KB keeps the size-limit fixture small while being safely above realistic test images.
process.env.MEDIA_MAX_FILE_SIZE_BYTES = "524288";

// Online payment gateways — inert test credentials for OFFLINE payment tests.
// No gateway call is ever made unless a test explicitly installs a provider
// stub in the registry. Placeholder values only; the real credentials are
// read from backend/.env (never committed).
process.env.PAYMENT_DEFAULT_CURRENCY = "NPR";
process.env.BACKEND_PUBLIC_URL = "http://localhost:4000";
process.env.PUBLIC_BASE_URL = "http://localhost:8090";

// Raise rate-limit budgets for the integration suite (all tests share one IP).
// The middleware only picks these up when they are set BEFORE it is imported,
// which this setup-file guarantees. Production defaults are unchanged.
process.env.AUTH_ACTION_RATE_LIMIT_MAX = "100000";
process.env.AUTH_ACTION_RATE_LIMIT_WINDOW_MS = "900000";
process.env.API_RATE_LIMIT_MAX = "1000000";
process.env.API_RATE_LIMIT_WINDOW_MS = "60000";
process.env.OAUTH_RATE_LIMIT_MAX = "100000";
process.env.OAUTH_RATE_LIMIT_WINDOW_MS = "900000";

// Customer social sign-in (Google / Facebook). Deterministic inert credentials
// so the OAuth routes are enabled during tests; provider calls are mocked by
// the social-auth test file (no real network is ever touched). These are NOT
// secrets and never reach any frontend build.
process.env.GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
process.env.FACEBOOK_APP_ID = "123456789012345";
process.env.FACEBOOK_APP_SECRET = "test-facebook-app-secret";

export { uploadRoot };

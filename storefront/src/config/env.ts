/**
 * Storefront environment configuration.
 *
 * Reads runtime environment values provided by the Vite server. Falls back to
 * local development defaults so the app runs without a .env file.
 */

const viteEnv = (
  import.meta as {
    env?: Record<string, string | undefined>;
  }
).env;

/** Public backend API base URL. */
export const API_BASE_URL = viteEnv?.["VITE_API_URL"] || "http://localhost:4000/api/v1";

/** Public storefront origin used for canonical URLs and Open Graph. */
export const PUBLIC_ORIGIN = viteEnv?.["VITE_PUBLIC_ORIGIN"] || "http://localhost:8090";

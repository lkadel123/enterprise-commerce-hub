/**
 * Expects the environment module to refuse booting in production with
 * development-grade secrets and COOKIE_SECURE=false.
 *
 * Intended to be launched by check-prod-security.ts with a weak production env;
 * the process must exit non-zero (the env guard fires process.exit(1)).
 */
export {};
await import("../src/config/env.js");
console.log("UNEXPECTED: production booted with weak secrets.");
process.exit(0);

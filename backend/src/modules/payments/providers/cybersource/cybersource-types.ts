/**
 * Cybersource REST API types (subset required for Unified Checkout).
 * Only the fields this integration actually reads are typed — the full API
 * models are much larger.
 */
/** API hosts — centralised; never hardcode an environment URL elsewhere. */
export const CYBERSOURCE_API_HOSTS = {
  test: "https://apitest.cybersource.com",
  production: "https://api.cybersource.com",
};
/** Hosts serving the Cybersource public keys (JWKS) used to verify signed tokens. */
export const CYBERSOURCE_JWKS_HOSTS = {
  test: "apitest.cybersource.com",
  production: "api.cybersource.com",
};
/**
 * Hosts allowed to serve the Flex / Unified Checkout client JS bundle.
 * Defence-in-depth: the client library URL extracted from the capture context
 * JWT can only ever point at a Cybersource origin.
 *
 * - flex.* hosts serve the legacy (clientVersion 0.x) Unified Checkout bundle.
 * - testup./up. hosts serve the current (clientVersion 1.x) bundle.
 */
export const CYBERSOURCE_CLIENT_LIBRARY_HOSTS = new Set([
  "flex.cybersource.com",
  "testflex.cybersource.com",
  "flex.test.cybersource.com",
  "up.cybersource.com",
  "testup.cybersource.com",
]);

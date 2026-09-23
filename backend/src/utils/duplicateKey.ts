/**
 * Detects a MongoDB duplicate-key error (E11000).
 *
 * A unique index is the only atomic guarantee that two concurrent requests
 * cannot both create the same record. Code paths that create idempotent
 * resources (e.g. an order keyed by `Idempotency-Key`) must therefore recognise
 * E11000 and converge on the document the winning request already wrote,
 * instead of surfacing a raw 409/500 to the client.
 */
export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

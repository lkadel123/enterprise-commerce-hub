/**
 * Escapes a user-supplied search string so it is matched literally when passed
 * to a MongoDB `$regex` operator. Without this, `q` is interpreted as a regular
 * expression, which enables regex-abuse / CPU-exhaustion (ReDoS) queries and
 * makes the results dependent on regex metacharacters the user supplied.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

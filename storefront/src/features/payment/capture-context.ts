/**
 * Cybersource Unified Checkout — client-side capture-context decoder.
 *
 * The backend creates the Unified Checkout session (`POST /uc/v1/sessions`,
 * HTTP-Signature authenticated) and returns the resulting capture-context
 * JWT to the storefront inside the payment DTO. The JWT *payload* is public
 * session data (the JWT is signed, not encrypted) and carries the
 * client-library information the storefront needs to load the Unified
 * Checkout SDK:
 *
 *   - clientLibrary          — the SDK script URL (Cybersource-hosted)
 *   - clientLibraryIntegrity — the SRI hash for that script
 *   - clientVersion          — the client library version
 *
 * SECURITY RULES (per the official Cybersource Unified Checkout docs):
 *   - The capture context is created server-side from the authoritative
 *     order total. Nothing in this module ever influences amount/currency.
 *   - The SDK URL is ONLY accepted from `https://` hosts ending in
 *     `.cybersource.com` — a tampered/foreign capture context can never
 *     make this application load a script from anywhere else.
 *   - No card data is ever seen by this application: the SDK captures the
 *     PAN/CVV inside Cybersource's own iframe and returns a signed
 *     transient token, which the backend verifies against Cybersource.
 */

/** Public session data extracted from a capture-context JWT payload. */
export interface CybersourceClientSession {
  /** SDK script URL (must be https, on a *.cybersource.com host). */
  readonly clientLibrary: string;
  /** Subresource-integrity hash for the SDK script, when provided. */
  readonly clientLibraryIntegrity?: string;
  /** Client library version, when provided. */
  readonly clientVersion?: string;
  /**
   * Origins the capture context authorizes to embed the payment UI, when the
   * session declares them. The storefront checks `window.location.origin`
   * against this list before mounting — a capture context minted for a
   * different origin (e.g. production token replayed on staging) fails fast
   * with a clear error instead of a cryptic SDK mount failure.
   */
  readonly targetOrigins?: readonly string[];
}

const CYBERSOURCE_HOST_SUFFIX = ".cybersource.com";

/** True only for `https` URLs on a Cybersource-owned host. */
export function isAllowedCybersourceScriptUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === "https:" &&
      (url.hostname === "cybersource.com" ||
        url.hostname.endsWith(CYBERSOURCE_HOST_SUFFIX))
    );
  } catch {
    return false;
  }
}

/** Decode a base64url JWT segment to a UTF-8 string (browser only). */
function decodeBase64Url(segment: string): string {
  if (typeof atob !== "function") {
    throw new Error("Capture-context decoding requires a browser environment.");
  }
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  // Latin-1 binary string → proper UTF-8 text.
  return decodeURIComponent(
    Array.from(binary)
      .map((char) => "%" + char.charCodeAt(0).toString(16).padStart(2, "0"))
      .join(""),
  );
}

/**
 * Depth-first search for the first value of each wanted key. The
 * capture-context payload nests the client-library data differently
 * depending on the requested payment types, so this reads the documented
 * keys without hardcoding one exact nesting shape. Array-typed values
 * (`targetOrigins` is a JSON array of origin strings) are collected into
 * `foundArrays`.
 */
function findSessionValues(
  node: unknown,
  keys: readonly string[],
  arrayKeys: readonly string[],
  foundArrays: Map<string, string[]>,
): Map<string, string> {
  const found = new Map<string, string>();
  const visit = (current: unknown): void => {
    if (found.size === keys.length && arrayKeys.every((k) => foundArrays.has(k))) return;
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (current !== null && typeof current === "object") {
      for (const [key, value] of Object.entries(
        current as Record<string, unknown>,
      )) {
        if (keys.includes(key) && typeof value === "string" && !found.has(key)) {
          found.set(key, value);
        } else if (
          arrayKeys.includes(key) &&
          Array.isArray(value) &&
          value.every((entry) => typeof entry === "string") &&
          !foundArrays.has(key)
        ) {
          foundArrays.set(key, value as string[]);
        } else {
          visit(value);
        }
      }
    }
  };
  visit(node);
  return found;
}

/**
 * Decode the public payload of a capture-context JWT into the client
 * session data needed to bootstrap Unified Checkout.
 *
 * NOTE: this deliberately does NOT verify the JWT signature. The payload is
 * used only to load Cybersource's own SDK from an allowlisted host; every
 * security-relevant decision (amount, currency, settlement) stays on the
 * backend, which re-verifies the signed transient token server-side after
 * payment and matches it against the stored session reference.
 */
export function decodeCaptureContext(
  captureContext: string,
): CybersourceClientSession {
  const parts = captureContext.trim().split(".");
  if (parts.length !== 3) {
    throw new Error(
      "Malformed capture context: expected a JWT with three segments.",
    );
  }

  let payload: unknown;
  const payloadSegment = parts[1];
  if (!payloadSegment) {
    throw new Error("Malformed capture context: missing payload segment.");
  }
  try {
    payload = JSON.parse(decodeBase64Url(payloadSegment));
  } catch {
    throw new Error("Malformed capture context: payload is not valid JSON.");
  }

  const foundArrays = new Map<string, string[]>();
  const values = findSessionValues(
    payload,
    ["clientLibrary", "clientLibraryIntegrity", "clientVersion"],
    ["targetOrigins"],
    foundArrays,
  );

  const clientLibrary = values.get("clientLibrary");
  if (!clientLibrary) {
    throw new Error(
      "Capture context is missing the Unified Checkout client library URL.",
    );
  }
  if (!isAllowedCybersourceScriptUrl(clientLibrary)) {
    throw new Error(
      "Capture context points at a non-Cybersource client library — refusing to load it.",
    );
  }

  const clientLibraryIntegrity = values.get("clientLibraryIntegrity");
  const clientVersion = values.get("clientVersion");
  const targetOrigins = foundArrays.get("targetOrigins");

  return {
    clientLibrary,
    ...(clientLibraryIntegrity ? { clientLibraryIntegrity } : {}),
    ...(clientVersion ? { clientVersion } : {}),
    ...(targetOrigins && targetOrigins.length > 0 ? { targetOrigins } : {}),
  };
}

/**
 * True when the current browser origin is authorized by the capture context.
 *
 * `targetOrigins` is the list of origins allowed to embed this session's
 * payment UI. If the session declares none, there is nothing to check against
 * (older capture-context shapes omit it) and mounting proceeds — the SDK and
 * the backend still enforce everything security-relevant. A trailing slash in
 * a declared origin is tolerated; any other mismatch fails closed.
 */
export function isCurrentOriginAllowed(
  session: Pick<CybersourceClientSession, "targetOrigins">,
  currentOrigin: string = typeof window === "undefined" ? "" : window.location.origin,
): boolean {
  const allowed = session.targetOrigins;
  if (!allowed || allowed.length === 0) return true;
  const normalized = allowed.map((origin) => origin.replace(/\/+$/, ""));
  return normalized.includes(currentOrigin.replace(/\/+$/, ""));
}

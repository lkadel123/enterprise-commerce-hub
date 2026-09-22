import { createPrivateKey, createSign, type KeyObject } from "node:crypto";

/**
 * Fonepay request signing — SHA256withRSA over the EXACT request body.
 *
 * Semantics reproduced 1:1 from the supplied "Intent API collection" Postman
 * scripts (and the Java sample in the Checkout Intent Flow V1.10 document):
 *
 *  1. The private key is PKCS8, supplied WITHOUT PEM headers, either
 *     Base64- or HEX-encoded. The Postman script normalizes it to DER bytes
 *     (`isHex` → hex decode; else `atob` → DER) — {@link normalizeFonepayPrivateKey}
 *     reproduces the same branches.
 *  2. The signature is computed over the ENTIRE request JSON body — the exact
 *     string that is sent. Callers MUST serialize once, sign that string, and
 *     send the same string (see fonepay.client.ts — the body is built and
 *     serialized a single time per request).
 *  3. The resulting signature bytes are Base64-encoded into the `signature`
 *     header (Fonepay verifies with the merchant's registered public key).
 *
 * SECURITY: the private key never leaves this module; nothing here logs key
 * material, and there is deliberately no accessor that returns it.
 */

/** Fonepay requires alphanumeric-only reference labels (≤ 30 chars). */
export const FONEPAY_REFERENCE_PATTERN = /^[a-zA-Z0-9]{1,30}$/;

/**
 * Normalize a Base64- or HEX-encoded PKCS8 private key (no PEM headers) into a
 * Node `KeyObject`, mirroring the Postman normalization exactly.
 * @throws when the key is missing, ambiguous, or not valid PKCS8 RSA.
 */
export function normalizeFonepayPrivateKey(raw: string): KeyObject {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Fonepay private key is missing (FONEPAY_PRIVATE_KEY).");
  }

  const stripped = trimmed.replace(/[\r\n\s]/g, "");
  let der: Buffer;

  // Same branch order as the Postman script: HEX first, then Base64.
  if (/^[0-9a-fA-F]+$/.test(stripped)) {
    der = Buffer.from(stripped, "hex");
  } else if (/^[A-Za-z0-9+/]+={0,2}$/.test(stripped)) {
    der = Buffer.from(stripped, "base64");
  } else {
    throw new Error("Fonepay private key must be Base64 or hex encoded PKCS8 (no PEM headers).");
  }

  try {
    return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  } catch {
    throw new Error("Fonepay private key is not a valid PKCS8 RSA key.");
  }
}

/**
 * Sign a payload string with SHA256withRSA. The payload MUST be the exact
 * request body string that will be sent to Fonepay.
 * @returns the Base64 signature for the `signature` header.
 */
export function signFonepayPayload(privateKey: KeyObject, payload: string): string {
  const signer = createSign("RSA-SHA256"); // OpenSSL name for SHA256withRSA
  signer.update(payload, "utf8");
  signer.end();
  return signer.sign(privateKey).toString("base64");
}

/** Basic auth header value for the Fonepay login endpoint (`Basic base64(user:pass)`). */
export function fonepayBasicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

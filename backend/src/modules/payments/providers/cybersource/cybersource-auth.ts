import { createHash, createHmac } from "node:crypto";
import { cybersourceConfig } from "./cybersource.config.js";

/** Headers Cybersource requires on every signed REST request. */
export interface CybersourceSignatureHeaders {
  date: string;
  "v-c-merchant-id": string;
  /** Present only when a request body is signed. */
  Digest?: string;
  Signature: string;
}

/**
 * Builds the signed headers for an outgoing Cybersource REST request.
 *
 * HTTP Signature (HMAC-SHA256) per the Cybersource REST API auth spec: the
 * signing string is the listed headers joined with "\n", signed with the
 * Base64-decoded shared secret; the `Signature` header names the signed
 * headers and carries the Base64 HMAC.
 */
export function httpSignatureHeaders(
  method: string,
  pathWithQuery: string,
  rawBody?: string,
): CybersourceSignatureHeaders {
  cybersourceConfig.validate();
  const host = cybersourceConfig.apiBaseUrl().replace(/^https?:\/\//, "");
  // Cybersource REQUIRES the header (and signed header name) `v-c-merchant-id`
  // — the legacy `v-merchant` name is rejected with
  // "missing http required header : v-c-merchant-id" (HTTP 400).
  const merchantHeader = cybersourceConfig.organizationId() ?? cybersourceConfig.merchantId();
  const date = new Date().toUTCString();
  const requestTarget = `${method.toLowerCase()} ${pathWithQuery}`;
  const headerNames = ["host", "date", "(request-target)"];
  const signingLines = [`host: ${host}`, `date: ${date}`, `(request-target): ${requestTarget}`];
  let digest;
  if (rawBody !== undefined) {
    digest = `SHA-256=${createHash("sha256").update(rawBody, "utf8").digest("base64")}`;
    headerNames.push("digest");
    signingLines.push(`digest: ${digest}`);
  }
  headerNames.push("v-c-merchant-id");
  signingLines.push(`v-c-merchant-id: ${merchantHeader}`);
  const signingString = signingLines.join("\n");
  const secret = Buffer.from(cybersourceConfig.sharedSecret(), "base64");
  const signature = createHmac("sha256", secret).update(signingString, "utf8").digest("base64");
  return {
    date,
    "v-c-merchant-id": merchantHeader,
    ...(digest ? { Digest: digest } : {}),
    Signature:
      `keyid="${cybersourceConfig.keyId()}", algorithm="HmacSHA256", ` +
      `headers="${headerNames.join(" ")}", signature="${signature}"`,
  };
}

/**
 * Fonepay test-environment bootstrap.
 *
 * MUST be imported as the FIRST import of any test file that needs the Fonepay
 * gateway to be ENABLED: `config/env.ts` reads `process.env` exactly once, when
 * it is first evaluated, so the values below have to be in place before that.
 *
 * Everything here is INERT and locally generated:
 * - an RSA keypair created in this process (never a merchant key, never
 *   persisted, and unable to sign anything Fonepay would accept);
 * - an `https://` host under the RFC-2606 `.invalid` TLD (never resolvable);
 * - FONEPAY_ENVIRONMENT="uat" so no production guard is being asserted here.
 *
 * The tests themselves stub `globalThis.fetch`, so no request ever leaves the
 * process. Keep this file free of `src/` imports so it can never pull `env.ts`
 * in before the assignments below have run.
 */
import { generateKeyPairSync, type KeyObject } from "node:crypto";

export const FONEPAY_TEST_BASE_URL = "https://uat-new-merchant-api.fonepay.invalid";
export const FONEPAY_TEST_TERMINAL_ID = "TESTTERM1";
export const FONEPAY_TEST_USERNAME = "test-merchant-user";
export const FONEPAY_TEST_PASSWORD = "test-merchant-password";

interface FonepayTestKeys {
  privateKey: KeyObject;
  publicKeyPem: string;
  privateKeyBase64: string;
}

declare global {
  var __ECH_FONEPAY_TEST_KEYS: FonepayTestKeys | undefined;
}

/** One keypair per process (RSA-2048 generation is not free). */
function testKeys(): FonepayTestKeys {
  if (!globalThis.__ECH_FONEPAY_TEST_KEYS) {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    globalThis.__ECH_FONEPAY_TEST_KEYS = {
      privateKey,
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      privateKeyBase64: (privateKey.export({ type: "pkcs8", format: "der" }) as Buffer).toString(
        "base64",
      ),
    };
  }
  return globalThis.__ECH_FONEPAY_TEST_KEYS;
}

const keys = testKeys();

process.env.FONEPAY_ENABLED = "true";
process.env.FONEPAY_ENVIRONMENT = "uat";
process.env.FONEPAY_BASE_URL = FONEPAY_TEST_BASE_URL;
process.env.FONEPAY_USERNAME = FONEPAY_TEST_USERNAME;
process.env.FONEPAY_PASSWORD = FONEPAY_TEST_PASSWORD;
process.env.FONEPAY_PRIVATE_KEY = keys.privateKeyBase64;
process.env.FONEPAY_TERMINAL_ID = FONEPAY_TEST_TERMINAL_ID;
process.env.FONEPAY_REQUEST_TIMEOUT_MS = "5000";

/** Public key used by the tests to prove the outbound signature is real. */
export const FONEPAY_TEST_PUBLIC_KEY_PEM = keys.publicKeyPem;

/** Parsed private key, so tests can sign an identical body independently. */
export const FONEPAY_TEST_PRIVATE_KEY_OBJECT = keys.privateKey;

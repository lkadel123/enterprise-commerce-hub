import { describe, expect, it } from "vitest";

import {
  fonepayConfigProblems,
  isHttpsUrl,
  isNonProductionUrl,
  missingFonepayCredentials,
  type FonepayConfigInput,
} from "../src/modules/payments/providers/fonepay/fonepay.validation.js";

/**
 * Fonepay configuration rules — pure, dependency-free, no env.
 *
 * `config/env.ts` imports this module from the bottom of the import graph, so
 * the rules must not pull in `env`, the logger or `fetch`; these tests are the
 * executable contract for what makes a Fonepay deployment refuse to boot.
 *
 * The failure modes being prevented are silent and expensive:
 * - a live-money gateway left "enabled" with half a credential set (no provider
 *   registers, yet the configuration looks intentional in review);
 * - `FONEPAY_ENVIRONMENT=production` pointed at a UAT/dev host (or the gateway
 *   enabled with the environment unset), which would route real money at a
 *   sandbox host, or sandbox traffic at live credentials.
 *
 * The RSA key MATERIAL is deliberately not judged here — that check needs
 * `node:crypto` and lives in `fonepay.signature.ts` (`normalizeFonepayPrivateKey`,
 * covered by `test/fonepay-client.test.ts`).
 */

/** A complete, internally consistent UAT configuration. */
const uatConfig: FonepayConfigInput = {
  enabled: true,
  environment: "uat",
  baseUrl: "https://uat-new-merchant-api.fonepay.invalid",
  username: "merchant-user",
  password: "merchant-password",
  privateKey: "BASE64_PKCS8_KEY",
  terminalId: "TERM1",
};

/** A complete, internally consistent production configuration. */
const productionConfig: FonepayConfigInput = {
  ...uatConfig,
  environment: "production",
  baseUrl: "https://merchantapi.fonepay.invalid",
};

/** Every credential blank — the default state of a store without Fonepay. */
const emptyConfig: FonepayConfigInput = {
  enabled: false,
  environment: "",
  baseUrl: "",
  username: "",
  password: "",
  privateKey: "",
  terminalId: "",
};

describe("Fonepay URL classification", () => {
  it("accepts absolute https URLs only", () => {
    expect(isHttpsUrl("https://merchantapi.fonepay.invalid")).toBe(true);
    expect(isHttpsUrl("https://merchantapi.fonepay.invalid/api/merchant")).toBe(true);

    expect(isHttpsUrl("http://merchantapi.fonepay.invalid")).toBe(false);
    expect(isHttpsUrl("merchantapi.fonepay.invalid")).toBe(false);
    expect(isHttpsUrl("")).toBe(false);
    expect(isHttpsUrl("not a url")).toBe(false);
  });

  it("recognizes non-production hosts per DNS label", () => {
    expect(isNonProductionUrl("https://uat-new-merchant-api.fonepay.com")).toBe(true);
    expect(
      isNonProductionUrl("https://dev-external-gateway-new.fonepay.com/merchantThirdparty"),
    ).toBe(true);
    expect(isNonProductionUrl("https://sandbox.fonepay.com")).toBe(true);
    expect(isNonProductionUrl("https://staging-merchant.fonepay.com")).toBe(true);

    // A production host is never misread as a sandbox, and an unparseable value
    // is never classified as non-production.
    expect(isNonProductionUrl("https://merchantapi.fonepay.com")).toBe(false);
    expect(isNonProductionUrl("https://new-merchant-api.fonepay.com")).toBe(false);
    expect(isNonProductionUrl("not a url")).toBe(false);
  });
});

describe("Fonepay credential completeness", () => {
  it("lists every missing credential by its environment variable name", () => {
    expect(missingFonepayCredentials(uatConfig)).toEqual([]);
    expect(missingFonepayCredentials(emptyConfig)).toEqual([
      "FONEPAY_BASE_URL",
      "FONEPAY_USERNAME",
      "FONEPAY_PASSWORD",
      "FONEPAY_PRIVATE_KEY",
      "FONEPAY_TERMINAL_ID",
    ]);
    expect(missingFonepayCredentials({ ...uatConfig, password: "", terminalId: "" })).toEqual([
      "FONEPAY_PASSWORD",
      "FONEPAY_TERMINAL_ID",
    ]);
  });
});

describe("Fonepay configuration problems", () => {
  it("says nothing about a disabled, unconfigured gateway", () => {
    expect(fonepayConfigProblems(emptyConfig)).toEqual([]);
    // Credentials present but the gateway deliberately off: nothing to report.
    expect(fonepayConfigProblems({ ...uatConfig, enabled: false, environment: "" })).toEqual([]);
  });

  it("accepts complete, internally consistent configurations", () => {
    expect(fonepayConfigProblems(uatConfig)).toEqual([]);
    expect(fonepayConfigProblems(productionConfig)).toEqual([]);
  });

  it("rejects a partially configured credential set", () => {
    const problems = fonepayConfigProblems({ ...emptyConfig, username: "merchant-user" });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/only partially configured/);
    expect(problems[0]).toMatch(/FONEPAY_BASE_URL/);
  });

  it("refuses to enable the gateway without every credential", () => {
    const problems = fonepayConfigProblems({ ...emptyConfig, enabled: true });

    expect(problems.some((problem) => /FONEPAY_ENABLED=true requires/.test(problem))).toBe(true);
  });

  it("requires an explicit environment once the gateway is enabled", () => {
    const problems = fonepayConfigProblems({ ...uatConfig, environment: "" });

    expect(problems.some((problem) => /FONEPAY_ENVIRONMENT must be set/.test(problem))).toBe(true);
  });

  it("requires an https base URL in every environment", () => {
    const problems = fonepayConfigProblems({
      ...uatConfig,
      baseUrl: "http://uat-new-merchant-api.fonepay.invalid",
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/must be an absolute https:\/\/ URL/);
  });

  it("rejects production pointed at a UAT/dev/sandbox host", () => {
    const problems = fonepayConfigProblems({
      ...uatConfig,
      environment: "production",
      baseUrl: "https://uat-new-merchant-api.fonepay.invalid",
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/must not point FONEPAY_BASE_URL at a UAT\/dev\/sandbox host/);
  });
});

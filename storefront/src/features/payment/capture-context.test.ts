import { describe, expect, it } from "vitest";
import {
  decodeCaptureContext,
  isAllowedCybersourceScriptUrl,
  isCurrentOriginAllowed,
} from "./capture-context";

/** Build a fake JWT (header.payload.signature) with base64url segments. */
function makeJwt(payload: unknown): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode(payload)}.sig`;
}

const SESSION_PAYLOAD = {
  jti: "test-jti",
  ctx: [
    {
      data: {
        clientLibrary: "https://sdk.web-metrics.cybersource.com/uc/1.2.0/unified-checkout.js",
        clientLibraryIntegrity: "sha384-abc123",
        clientVersion: "1.2.0",
      },
    },
  ],
};

describe("isAllowedCybersourceScriptUrl", () => {
  it("accepts https URLs on *.cybersource.com hosts", () => {
    expect(
      isAllowedCybersourceScriptUrl(
        "https://sdk.web-metrics.cybersource.com/uc/unified-checkout.js",
      ),
    ).toBe(true);
    expect(isAllowedCybersourceScriptUrl("https://cybersource.com/x.js")).toBe(true);
  });

  it("rejects non-https, foreign-host and malformed URLs", () => {
    expect(isAllowedCybersourceScriptUrl("http://sdk.cybersource.com/uc.js")).toBe(false);
    expect(isAllowedCybersourceScriptUrl("https://evil.example.com/uc.js")).toBe(false);
    expect(isAllowedCybersourceScriptUrl("https://cybersource.com.evil.example.com/uc.js")).toBe(
      false,
    );
    expect(isAllowedCybersourceScriptUrl("not a url")).toBe(false);
  });
});

describe("decodeCaptureContext", () => {
  it("extracts the client library data from the JWT payload", () => {
    const session = decodeCaptureContext(makeJwt(SESSION_PAYLOAD));
    expect(session.clientLibrary).toBe(
      "https://sdk.web-metrics.cybersource.com/uc/1.2.0/unified-checkout.js",
    );
    expect(session.clientLibraryIntegrity).toBe("sha384-abc123");
    expect(session.clientVersion).toBe("1.2.0");
  });

  it("tolerates a missing integrity hash and version", () => {
    const session = decodeCaptureContext(
      makeJwt({
        ctx: [
          {
            data: {
              clientLibrary: "https://sdk.cybersource.com/uc/unified-checkout.js",
            },
          },
        ],
      }),
    );
    expect(session.clientLibraryIntegrity).toBeUndefined();
    expect(session.clientVersion).toBeUndefined();
  });

  it("rejects a foreign-host client library", () => {
    expect(() =>
      decodeCaptureContext(
        makeJwt({
          ctx: [{ data: { clientLibrary: "https://evil.example.com/uc.js" } }],
        }),
      ),
    ).toThrow(/non-Cybersource/i);
  });

  it("rejects malformed JWTs and missing client-library data", () => {
    expect(() => decodeCaptureContext("not-a-jwt")).toThrow(/three segments/i);
    expect(() => decodeCaptureContext("a.not-base64!.c")).toThrow(/not valid JSON/i);
    expect(() => decodeCaptureContext(makeJwt({ foo: "bar" }))).toThrow(/client library URL/i);
  });

  it("extracts targetOrigins when the capture context declares them", () => {
    const session = decodeCaptureContext(
      makeJwt({
        ctx: [
          {
            data: {
              clientLibrary: "https://sdk.cybersource.com/uc/unified-checkout.js",
            },
            targetOrigins: ["https://nasbonlinemart.com"],
          },
        ],
      }),
    );
    expect(session.targetOrigins).toEqual(["https://nasbonlinemart.com"]);
  });

  it("omits targetOrigins when the capture context declares none", () => {
    const session = decodeCaptureContext(makeJwt(SESSION_PAYLOAD));
    expect(session.targetOrigins).toBeUndefined();
  });
});

describe("isCurrentOriginAllowed", () => {
  it("passes when the current origin is declared in targetOrigins", () => {
    expect(
      isCurrentOriginAllowed(
        { targetOrigins: ["https://nasbonlinemart.com", "http://localhost:5173"] },
        "https://nasbonlinemart.com",
      ),
    ).toBe(true);
  });

  it("tolerates a trailing slash in a declared origin", () => {
    expect(
      isCurrentOriginAllowed(
        { targetOrigins: ["https://nasbonlinemart.com/"] },
        "https://nasbonlinemart.com",
      ),
    ).toBe(true);
  });

  it("fails closed on any other mismatch", () => {
    expect(
      isCurrentOriginAllowed(
        { targetOrigins: ["https://nasbonlinemart.com"] },
        "https://staging.nasbonlinemart.com",
      ),
    ).toBe(false);
    expect(
      isCurrentOriginAllowed(
        { targetOrigins: ["https://nasbonlinemart.com"] },
        "https://nasbonlinemart.com.evil.example.com",
      ),
    ).toBe(false);
  });

  it("passes when the capture context declares no origins (nothing to check)", () => {
    expect(isCurrentOriginAllowed({}, "https://nasbonlinemart.com")).toBe(true);
    expect(isCurrentOriginAllowed({ targetOrigins: [] }, "anywhere")).toBe(true);
  });
});

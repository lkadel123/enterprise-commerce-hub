import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  describeFonepayApplicationFailure,
  summarizeFonepayIssues,
  summarizeFonepayPayload,
} from "../src/modules/payments/providers/fonepay/fonepay.diagnostics.js";

/**
 * Redaction-safe provider diagnostics — pure, no env, no network.
 *
 * These tests exist for two reasons:
 * 1. the diagnostics must be USEFUL (issue path, expected type, received type,
 *    provider field names) so a live HTTP 200 mismatch can be diagnosed from a
 *    log line alone;
 * 2. they must be SAFE — no provider value, no QR payload, no token, no signing
 *    material may ever appear in a summary. The `never leaks` assertions below
 *    pin that by embedding secret-looking values in the fixtures.
 */

/** A realistic-looking (sanitized) EMVCo QR payload — 60+ chars, no real data. */
const QR_PAYLOAD =
  "00020101021229340011fonepay.invalid5204581253035240540650.005802NP5914SANITIZED TEST6007KATHMANDU6304ABCD";

/** Secret-looking value that must never appear in a diagnostic summary. */
const SECRET = "super-secret-access-token-0123456789";

describe("Fonepay payload shape summary", () => {
  it("reports field NAMES and TYPES only, never values", () => {
    const summary = summarizeFonepayPayload({
      qrString: QR_PAYLOAD,
      qrDisplayName: "Sanitized Store",
      status: "SUCCESS",
      terminalId: 123456,
      prn: "PRN-SANITIZED-1",
      websocketId: "wss://sanitized.invalid/ws/1",
    });

    expect(summary.type).toBe("object");
    expect(summary.keys).toEqual([
      "qrString",
      "qrDisplayName",
      "status",
      "terminalId",
      "prn",
      "websocketId",
    ]);
    expect(summary.fieldTypes).toEqual({
      qrString: "string",
      qrDisplayName: "string",
      status: "string",
      terminalId: "number",
      prn: "string",
      websocketId: "string",
    });

    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain(QR_PAYLOAD);
    expect(serialized).not.toContain("Sanitized Store");
    expect(serialized).not.toContain("SUCCESS");
    expect(serialized).not.toContain("PRN-SANITIZED-1");
    expect(serialized).not.toContain("123456");
  });

  it("reveals a WRAPPED payload through keys + nestedKeys (never its values)", () => {
    const summary = summarizeFonepayPayload({ data: { qrString: QR_PAYLOAD, prn: "P1" } });

    expect(summary.keys).toEqual(["data"]);
    expect(summary.fieldTypes).toEqual({ data: "object" });
    expect(summary.nestedKeys).toEqual({ data: ["qrString", "prn"] });
    expect(JSON.stringify(summary)).not.toContain(QR_PAYLOAD);
  });

  it("summarizes non-object bodies without reading their contents", () => {
    expect(summarizeFonepayPayload([{ qrString: QR_PAYLOAD }])).toEqual({
      type: "array",
      items: 1,
    });
    expect(summarizeFonepayPayload(QR_PAYLOAD)).toEqual({ type: "string" });
    expect(summarizeFonepayPayload(null)).toEqual({ type: "null" });
    expect(summarizeFonepayPayload(undefined)).toEqual({ type: "undefined" });
    expect(summarizeFonepayPayload(42)).toEqual({ type: "number" });
    expect(summarizeFonepayPayload(true)).toEqual({ type: "boolean" });
  });

  it("caps the number of reported fields", () => {
    const wide: Record<string, string> = {};
    for (let index = 0; index < 120; index += 1) wide[`field${index}`] = SECRET;

    const summary = summarizeFonepayPayload(wide);
    expect(summary.keys).toHaveLength(50);
    expect(JSON.stringify(summary)).not.toContain(SECRET);
  });
});

describe("Fonepay contract issue summary", () => {
  it("reports the issue path with the expected and received TYPES", () => {
    const schema = z.object({ qrString: z.string().min(1) });
    const result = schema.safeParse({ status: "SUCCESS" });
    if (result.success) throw new Error("fixture must fail validation");

    expect(summarizeFonepayIssues(result.error)).toEqual([
      { path: "qrString", code: "invalid_type", expected: "string", received: "undefined" },
    ]);
  });

  it("reports length bounds for an empty required string", () => {
    const schema = z.object({ qrString: z.string().min(1) });
    const result = schema.safeParse({ qrString: "" });
    if (result.success) throw new Error("fixture must fail validation");

    expect(summarizeFonepayIssues(result.error)).toEqual([
      { path: "qrString", code: "too_small", expected: "string", constraint: ">= 1 (string)" },
    ]);
  });

  it("never copies values for issues that embed the received value", () => {
    // `invalid_enum_value` / `invalid_literal` put the RECEIVED VALUE into the
    // issue (and into `message`) — the summary must stay value-free.
    const enumResult = z.enum(["SUCCESS", "FAILED"]).safeParse(SECRET);
    const literalResult = z.literal("QR").safeParse(SECRET);
    if (enumResult.success || literalResult.success) throw new Error("fixture must fail");

    const summaries = [
      ...summarizeFonepayIssues(enumResult.error),
      ...summarizeFonepayIssues(literalResult.error),
    ];

    expect(summaries.map((summary) => summary.code)).toEqual([
      "invalid_enum_value",
      "invalid_literal",
    ]);
    for (const summary of summaries) {
      expect(summary).toMatchObject({ path: "(root)" });
      expect(summary).not.toHaveProperty("expected");
      expect(summary).not.toHaveProperty("received");
    }
    expect(JSON.stringify(summaries)).not.toContain(SECRET);
  });
});

describe("Fonepay application-level failure detection", () => {
  it("treats a message-only HTTP 200 body as a provider failure, not a schema violation", () => {
    expect(describeFonepayApplicationFailure({ message: "Invalid terminal id" })).toBe(
      "Fonepay rejected the QR request: Invalid terminal id",
    );
  });

  it("falls back to `error`, then `qrMessage`", () => {
    expect(describeFonepayApplicationFailure({ error: "Unauthorized" })).toBe(
      "Fonepay rejected the QR request: Unauthorized",
    );
    expect(describeFonepayApplicationFailure({ qrMessage: "QR could not be generated" })).toBe(
      "Fonepay rejected the QR request: QR could not be generated",
    );
  });

  it("reports a status-only body (documented success always carries a QR payload)", () => {
    expect(describeFonepayApplicationFailure({ status: "FAILED" })).toBe(
      "Fonepay returned a QR response with no QR payload (status: FAILED).",
    );
  });

  it("never classifies a body that carries a usable QR payload as a failure", () => {
    expect(
      describeFonepayApplicationFailure({ qrString: QR_PAYLOAD, status: "SUCCESS", prn: "P1" }),
    ).toBeUndefined();
  });

  it("leaves a whitespace-only payload to contract validation", () => {
    // No provider message/status to report, so this is not an application-level
    // failure: the response schema's trim+min(1) rejects it as `too_small` and it
    // can therefore never become a QR the customer cannot scan.
    expect(describeFonepayApplicationFailure({ qrString: "   " })).toBeUndefined();
  });

  it("keeps a WRONG-TYPED qrString a contract violation, even with a provider message", () => {
    expect(describeFonepayApplicationFailure({ qrString: { raw: QR_PAYLOAD } })).toBeUndefined();
    expect(describeFonepayApplicationFailure({ qrString: 42, message: "boom" })).toBeUndefined();
    expect(describeFonepayApplicationFailure({ qrString: null, message: "boom" })).toBe(
      "Fonepay rejected the QR request: boom",
    );
    expect(describeFonepayApplicationFailure({ qrString: "", message: "boom" })).toBe(
      "Fonepay rejected the QR request: boom",
    );
  });

  it("ignores bodies that are not JSON objects or carry no failure signal", () => {
    expect(describeFonepayApplicationFailure(null)).toBeUndefined();
    expect(describeFonepayApplicationFailure("Invalid terminal id")).toBeUndefined();
    expect(describeFonepayApplicationFailure([{ message: "boom" }])).toBeUndefined();
    expect(describeFonepayApplicationFailure({})).toBeUndefined();
    expect(describeFonepayApplicationFailure({ viewCount: 3 })).toBeUndefined();
    expect(describeFonepayApplicationFailure({ message: "   " })).toBeUndefined();
  });

  it("bounds and flattens provider text so a hostile body cannot flood the log", () => {
    const longMessage = `${"x".repeat(500)}\nsecond line`;
    const described = describeFonepayApplicationFailure({ message: longMessage });

    expect(described).toBe(`Fonepay rejected the QR request: ${"x".repeat(200)}`);
    expect(described).not.toContain("\n");

    const longStatus = "S".repeat(200);
    expect(describeFonepayApplicationFailure({ status: longStatus })).toBe(
      `Fonepay returned a QR response with no QR payload (status: ${"S".repeat(40)}).`,
    );
  });
});

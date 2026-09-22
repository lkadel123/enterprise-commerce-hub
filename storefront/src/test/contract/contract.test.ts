import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  addressFormSchema,
  notesSchema,
  orderAddressSchema,
} from "@/features/checkout/checkout-validation";

/**
 * CONTRACT VERIFICATION (architecture §24: "mirror schemas/types against a
 * snapshot to catch drift early").
 *
 * Strategy: the storefront hand-mirrors backend Zod validators (documented in
 * each schema's header). This test pins the *shape* of every mirrored client
 * schema — field names, optionality and max lengths — against a committed
 * JSON snapshot (`backend-contract.snapshot.json`, generated once from the
 * backend validators). When a backend validator changes, this test fails and
 * the developer must consciously update both the client schema and snapshot.
 */
const snapshotPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "backend-contract.snapshot.json",
);
const snapshot: Record<string, Record<string, string>> = JSON.parse(
  readFileSync(snapshotPath, "utf8"),
);

/** Describe one field of an object schema: `name` for required, `name?` for optional. */
function fieldSignature(schema: z.ZodObject<z.ZodRawShape>): Record<string, string> {
  const out: Record<string, string> = {};
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  for (const [key, rawField] of Object.entries(shape)) {
    // Unwrap `.optional()` FIRST so max-length info survives classification.
    let field = rawField;
    while (field instanceof z.ZodOptional || field instanceof z.ZodNullable) {
      field = field.unwrap();
    }
    out[`${rawField.isOptional() ? `${key}?` : key}`] = classify(field);
  }
  return out;
}

function classify(field: z.ZodTypeAny): string {
  if (field instanceof z.ZodNumber) return "number";
  if (field instanceof z.ZodBoolean) return "boolean";
  if (field instanceof z.ZodString) {
    type StringCheck = { kind?: string; value?: unknown };
    const checks =
      (field as unknown as { _def?: { checks?: StringCheck[] }; def?: { checks?: StringCheck[] } })
        ._def?.checks ?? [];
    let maxLength = Number.POSITIVE_INFINITY;
    for (const check of checks) {
      if (check.kind === "max" && typeof check.value === "number") maxLength = check.value;
    }
    return Number.isFinite(maxLength) ? `string(max=${maxLength})` : "string";
  }
  return "unknown";
}

describe("storefront ↔ backend contract snapshot", () => {
  it("address form matches createCustomerAddressSchema", () => {
    expect(fieldSignature(addressFormSchema)).toEqual(snapshot["createCustomerAddress"]);
  });

  it("order address matches customer-order inline address schema", () => {
    expect(fieldSignature(orderAddressSchema)).toEqual(snapshot["customerOrderAddress"]);
  });

  it("notes length mirrors the backend notes field", () => {
    expect(notesSchema.safeParse("x".repeat(1000)).success).toBe(true);
    expect(notesSchema.safeParse("x".repeat(1001)).success).toBe(false);
  });

  it("snapshot covers all mirrored schemas", () => {
    const keys = Object.keys(snapshot).filter((k) => k !== "_comment");
    expect(keys.sort()).toEqual(
      ["createCustomerAddress", "customerLogin", "customerOrderAddress"].sort(),
    );
  });
});

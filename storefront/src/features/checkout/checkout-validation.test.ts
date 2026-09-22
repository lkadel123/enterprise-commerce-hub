import { describe, expect, it } from "vitest";
import {
  addressFormSchema,
  isValidCouponCode,
  notesSchema,
  orderAddressSchema,
  zodFieldErrors,
} from "@/features/checkout/checkout-validation";

/**
 * Checkout form schemas — these MIRROR backend validators. The assertions
 * double as a client-side regression guard for the contract snapshot.
 */
const validAddress = {
  label: "Home",
  line1: "12 Main St",
  city: "Kathmandu",
  postalCode: "44600",
  country: "Nepal",
};

describe("addressFormSchema", () => {
  it("accepts a complete address", () => {
    expect(addressFormSchema.safeParse(validAddress).success).toBe(true);
  });

  it("rejects missing required fields with messages", () => {
    const result = addressFormSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = zodFieldErrors(result.error);
      // Missing keys surface as field-level errors (message text varies by
      // zod version — "Required" vs the custom min-length copy).
      expect(errors.label).toBeTruthy();
      expect(errors.line1).toBeTruthy();
      expect(errors.city).toBeTruthy();
      expect(errors.postalCode).toBeTruthy();
      expect(errors.country).toBeTruthy();
    }
  });

  it("enforces max lengths at boundaries", () => {
    expect(addressFormSchema.safeParse({ ...validAddress, label: "x".repeat(100) }).success).toBe(
      true,
    );
    expect(addressFormSchema.safeParse({ ...validAddress, label: "x".repeat(101) }).success).toBe(
      false,
    );
    expect(
      addressFormSchema.safeParse({ ...validAddress, postalCode: "9".repeat(20) }).success,
    ).toBe(true);
    expect(
      addressFormSchema.safeParse({ ...validAddress, postalCode: "9".repeat(21) }).success,
    ).toBe(false);
  });

  it("allows optional fields to be absent", () => {
    expect(addressFormSchema.safeParse(validAddress).success).toBe(true);
  });
});

describe("orderAddressSchema", () => {
  it("requires line1/city/country but allows absent postalCode/state/line2", () => {
    expect(orderAddressSchema.safeParse({ line1: "a", city: "b", country: "Nepal" }).success).toBe(
      true,
    );
    expect(orderAddressSchema.safeParse({ city: "b", country: "Nepal" }).success).toBe(false);
  });
});

describe("notesSchema", () => {
  it("caps notes at 1000 chars", () => {
    expect(notesSchema.safeParse("x".repeat(1000)).success).toBe(true);
    expect(notesSchema.safeParse("x".repeat(1001)).success).toBe(false);
  });
});

describe("coupon code validation", () => {
  it.each(["SAVE10", "abc", "A-b_9"])("accepts %s", (code) => {
    expect(isValidCouponCode(code)).toBe(true);
  });
  it.each(["", "ab", "has space", "50%off", "x".repeat(51)])("rejects %s", (code) => {
    expect(isValidCouponCode(code)).toBe(false);
  });
});

describe("zodFieldErrors", () => {
  it("flattens issues into field→message map keeping first per field", () => {
    const result = addressFormSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = zodFieldErrors(result.error);
      expect(Object.keys(errors)).toContain("label");
    }
  });
});

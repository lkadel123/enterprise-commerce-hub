import { describe, expect, it } from "vitest";
import { isSafeRedirect } from "@/lib/auth/CustomerAuthContext";

/**
 * Open-redirect protection (Phase 5/10 security regression).
 * Exact behaviour per `isSafeRedirect` in CustomerAuthContext.tsx:187.
 */
describe("isSafeRedirect", () => {
  it.each(["/", "/account", "/account/orders", "/products/foo", "/login?redirect=%2Fcart"])(
    "accepts internal path %s",
    (to) => {
      expect(isSafeRedirect(to)).toBe(true);
    },
  );

  it.each([
    "",
    "not-a-path",
    "account",
    "//evil.example",
    "//evil.example/path",
    "/\\evil.example",
    "\\/evil.example",
    "\\\\evil.example",
    "https://evil.example",
    "http://evil.example",
    "javascript:alert(1)",
    "data:text/html,<script>",
  ])("rejects unsafe redirect %s", (to) => {
    expect(isSafeRedirect(to)).toBe(false);
  });

  it("rejects non-string input defensively", () => {
    expect(isSafeRedirect(undefined as unknown as string)).toBe(false);
    expect(isSafeRedirect(null as unknown as string)).toBe(false);
  });
});

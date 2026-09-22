import { describe, expect, it, beforeEach } from "vitest";

import {
  clearCustomerSessionHint,
  hasCustomerSessionHint,
  setCustomerSessionHintCookie,
} from "./sessionHint";

describe("sessionHint", () => {
  beforeEach(() => {
    clearCustomerSessionHint();
  });

  it("reports no hint when the cookie is absent (fresh guest browser)", () => {
    expect(hasCustomerSessionHint()).toBe(false);
  });

  it("reports a hint when the backend has set the cookie", () => {
    setCustomerSessionHintCookie(true);
    expect(hasCustomerSessionHint()).toBe(true);
  });

  it("clearCustomerSessionHint removes a stale hint", () => {
    setCustomerSessionHintCookie(true);
    expect(hasCustomerSessionHint()).toBe(true);
    clearCustomerSessionHint();
    expect(hasCustomerSessionHint()).toBe(false);
  });

  it("ignores cookies with a different name", () => {
    document.cookie = "some_other_cookie=1; path=/";
    expect(hasCustomerSessionHint()).toBe(false);
  });
});

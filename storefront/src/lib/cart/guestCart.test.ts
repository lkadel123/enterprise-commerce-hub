import { beforeEach, describe, expect, it } from "vitest";
import {
  addGuestCartItem,
  clearGuestCart,
  readGuestCart,
  removeGuestCartItem,
  updateGuestCartQuantity,
  writeGuestCart,
} from "@/lib/cart/guestCart";

/** Deterministic guest-cart behaviour (Phase 6 merge logic). */
describe("guestCart", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts empty", () => {
    expect(readGuestCart()).toEqual([]);
  });

  it("adds items and clamps quantity to [1,999]", () => {
    const items = addGuestCartItem("p1", 5);
    expect(items).toEqual([{ productId: "p1", quantity: 5 }]);
    // 0 → clamped to min 1; NaN → falls back to min
    addGuestCartItem("p2", 0);
    addGuestCartItem("p3", Number.NaN);
    const all = readGuestCart();
    expect(all.find((i) => i.productId === "p2")?.quantity).toBe(1);
    expect(all.find((i) => i.productId === "p3")?.quantity).toBe(1);
  });

  it("merges duplicate products by summing, capped at max", () => {
    addGuestCartItem("p1", 600);
    addGuestCartItem("p1", 600);
    expect(readGuestCart()).toEqual([{ productId: "p1", quantity: 999 }]);
  });

  it("sets exact quantities via update (ignores unknown ids)", () => {
    writeGuestCart([
      { productId: "a", quantity: 3 },
      { productId: "b", quantity: 2 },
    ]);
    updateGuestCartQuantity("a", 7);
    updateGuestCartQuantity("unknown", 50); // no-op
    const items = readGuestCart();
    expect(items.find((i) => i.productId === "a")?.quantity).toBe(7);
    expect(items.some((i) => i.productId === "unknown")).toBe(false);
  });

  it("removes a single product", () => {
    writeGuestCart([
      { productId: "a", quantity: 1 },
      { productId: "b", quantity: 1 },
    ]);
    expect(removeGuestCartItem("a")).toEqual([{ productId: "b", quantity: 1 }]);
    expect(readGuestCart()).toEqual([{ productId: "b", quantity: 1 }]);
  });

  it("clears the cart", () => {
    addGuestCartItem("p1");
    clearGuestCart();
    expect(readGuestCart()).toEqual([]);
  });

  it("survives corrupted storage without throwing", () => {
    window.localStorage.setItem("commerce-hub:guest-cart", "{not json");
    expect(readGuestCart()).toEqual([]);
    window.localStorage.setItem(
      "commerce-hub:guest-cart",
      JSON.stringify({ items: [{ productId: "", quantity: -5 }, null, "junk"] }),
    );
    expect(readGuestCart()).toEqual([]);
  });
});

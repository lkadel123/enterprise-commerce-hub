import { apiFetch } from "./client";
import type { ApiEnvelope } from "@/types";
import type { CartDto, AddToCartInput, MergeCartInput } from "@/types";
export type CartEnvelope = ApiEnvelope<CartDto>;

export const cartApi = {
  /** GET /cart — the authenticated customer's cart. */
  get(): Promise<CartEnvelope> {
    return apiFetch<CartEnvelope>("/cart");
  },

  /** POST /cart/items — add or increment an item. Only productId+quantity. */
  add(input: AddToCartInput): Promise<CartEnvelope> {
    return apiFetch<CartEnvelope>("/cart/items", {
      method: "POST",
      body: input,
    });
  },

  /** PATCH /cart/items/:productId — set an item's quantity. */
  updateQuantity(productId: string, quantity: number): Promise<CartEnvelope> {
    return apiFetch<CartEnvelope>(`/cart/items/${encodeURIComponent(productId)}`, {
      method: "PATCH",
      body: { quantity },
    });
  },

  /** DELETE /cart/items/:productId — remove an item. */
  removeItem(productId: string): Promise<CartEnvelope> {
    return apiFetch<CartEnvelope>(`/cart/items/${encodeURIComponent(productId)}`, {
      method: "DELETE",
    });
  },

  /** DELETE /cart — clear the entire cart. */
  clear(): Promise<CartEnvelope> {
    return apiFetch<CartEnvelope>("/cart", { method: "DELETE" });
  },

  /** POST /cart/merge — merge a local (guest) cart into the server cart. */
  merge(input: MergeCartInput): Promise<CartEnvelope> {
    return apiFetch<CartEnvelope>("/cart/merge", {
      method: "POST",
      body: input,
    });
  },
};

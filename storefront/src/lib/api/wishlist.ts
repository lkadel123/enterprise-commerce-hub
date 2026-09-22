import { apiFetch } from "./client";
import type { ApiEnvelope } from "@/types";
import type { WishlistDto, WishlistCheckResult } from "@/types";
export type WishlistEnvelope = ApiEnvelope<WishlistDto>;

export type WishlistCheckEnvelope = ApiEnvelope<WishlistCheckResult>;

export const wishlistApi = {
  /** GET /wishlist — the authenticated customer's wishlist. */
  list(): Promise<WishlistEnvelope> {
    return apiFetch<WishlistEnvelope>("/wishlist");
  },

  /** POST /wishlist — add a product. Body is only `{ productId }`. */
  add(productId: string): Promise<WishlistEnvelope> {
    return apiFetch<WishlistEnvelope>("/wishlist", {
      method: "POST",
      body: { productId },
    });
  },

  /** GET /wishlist/:productId — whether a product is wishlisted. */
  check(productId: string): Promise<WishlistCheckEnvelope> {
    return apiFetch<WishlistCheckEnvelope>(`/wishlist/${encodeURIComponent(productId)}`);
  },

  /** DELETE /wishlist/:productId — remove a product. */
  remove(productId: string): Promise<WishlistEnvelope> {
    return apiFetch<WishlistEnvelope>(`/wishlist/${encodeURIComponent(productId)}`, {
      method: "DELETE",
    });
  },
};

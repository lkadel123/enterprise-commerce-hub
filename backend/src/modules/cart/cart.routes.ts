import { Router } from "express";

import { customerAuthenticate } from "../../middleware/customerAuthenticate.js";
import { apiRateLimiter } from "../../middleware/rateLimiter.js";
import { validate } from "../../middleware/validate.js";

import { cartController } from "./cart.controller.js";
import {
  addToCartSchema,
  updateCartItemSchema,
  cartItemParamsSchema,
  mergeCartSchema,
} from "./cart.validator.js";

/**
 * Customer cart endpoints.
 *
 * All routes require an authenticated customer session (httpOnly refresh
 * token + in-memory access token). Cart ownership is enforced at the
 * database layer using req.customer!.id — the customer can never access
 * or mutate another customer's cart.
 *
 * Prices, stock checks, and subtotals are resolved server-side from the
 * Product and Inventory models; client-supplied price/quantity values are
 * ignored for financial calculations.
 */
const router = Router();

// All cart routes require customer authentication
router.use(customerAuthenticate);
router.use(apiRateLimiter);

/**
 * GET /api/v1/cart
 * Retrieve the authenticated customer's cart.
 */
router.get("/", cartController.getCart);

/**
 * POST /api/v1/cart/items
 * Add an item to the cart (or increment quantity if already present).
 */
router.post("/items", validate(addToCartSchema, "body"), cartController.addItem);

/**
 * PATCH /api/v1/cart/items/:productId
 * Update the quantity of a specific cart item.
 */
router.patch(
  "/items/:productId",
  validate(cartItemParamsSchema, "params"),
  validate(updateCartItemSchema, "body"),
  cartController.updateQuantity,
);

/**
 * DELETE /api/v1/cart/items/:productId
 * Remove a specific item from the cart.
 */
router.delete(
  "/items/:productId",
  validate(cartItemParamsSchema, "params"),
  cartController.removeItem,
);

/**
 * DELETE /api/v1/cart
 * Clear the entire cart.
 */
router.delete("/", cartController.clearCart);

/**
 * POST /api/v1/cart/merge
 * Merge a local (anonymous) cart into the authenticated server cart.
 */
router.post("/merge", validate(mergeCartSchema, "body"), cartController.mergeCart);

export { router as cartRouter };

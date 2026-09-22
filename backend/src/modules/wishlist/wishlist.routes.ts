import { Router } from "express";

import { customerAuthenticate } from "../../middleware/customerAuthenticate.js";
import { apiRateLimiter } from "../../middleware/rateLimiter.js";
import { validate } from "../../middleware/validate.js";

import { wishlistController } from "./wishlist.controller.js";
import { addToWishlistSchema, wishlistItemParamsSchema } from "./wishlist.validator.js";

/**
 * Customer wishlist endpoints.
 *
 * All routes require an authenticated customer session. Wishlist ownership
 * is enforced at the database layer using req.customer!.id — the customer
 * can never access or mutate another customer's wishlist.
 *
 * Product prices are resolved server-side from the Product model;
 * client-supplied price values are never used for financial data.
 */
const router = Router();

// All wishlist routes require customer authentication
router.use(customerAuthenticate);
router.use(apiRateLimiter);

/**
 * GET /api/v1/wishlist
 * Retrieve the authenticated customer's wishlist.
 */
router.get("/", wishlistController.getWishlist);

/**
 * POST /api/v1/wishlist
 * Add a product to the wishlist.
 */
router.post("/", validate(addToWishlistSchema, "body"), wishlistController.addItem);

/**
 * GET /api/v1/wishlist/:productId
 * Check if a product is in the wishlist.
 */
router.get(
  "/:productId",
  validate(wishlistItemParamsSchema, "params"),
  wishlistController.checkItem,
);

/**
 * DELETE /api/v1/wishlist/:productId
 * Remove a product from the wishlist.
 */
router.delete(
  "/:productId",
  validate(wishlistItemParamsSchema, "params"),
  wishlistController.removeItem,
);

export { router as wishlistRouter };

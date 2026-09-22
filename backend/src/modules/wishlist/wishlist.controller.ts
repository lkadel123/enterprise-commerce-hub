import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/ApiResponse.js";
import { wishlistService } from "./wishlist.service.js";

export const wishlistController = {
  getWishlist: asyncHandler(async (req, res) => {
    const wishlist = await wishlistService.getWishlist(req.customer!.id);
    sendSuccess(res, wishlist);
  }),

  addItem: asyncHandler(async (req, res) => {
    const wishlist = await wishlistService.addItem(req.customer!.id, req.body);
    sendSuccess(res, wishlist, "Product added to wishlist.");
  }),

  removeItem: asyncHandler(async (req, res) => {
    const wishlist = await wishlistService.removeItem(
      req.customer!.id,
      req.params.productId as string,
    );
    sendSuccess(res, wishlist, "Product removed from wishlist.");
  }),

  checkItem: asyncHandler(async (req, res) => {
    const result = await wishlistService.containsItem(
      req.customer!.id,
      req.params.productId as string,
    );
    sendSuccess(res, result);
  }),
};

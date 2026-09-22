import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/ApiResponse.js";
import { cartService } from "./cart.service.js";

export const cartController = {
  getCart: asyncHandler(async (req, res) => {
    const cart = await cartService.getCart(req.customer!.id);
    sendSuccess(res, cart);
  }),

  addItem: asyncHandler(async (req, res) => {
    const cart = await cartService.addItemToCart(req.customer!.id, req.body);
    sendSuccess(res, cart, "Item added to cart.");
  }),

  updateQuantity: asyncHandler(async (req, res) => {
    const cart = await cartService.updateItemQuantity(
      req.customer!.id,
      req.params.productId as string,
      req.body,
    );
    sendSuccess(res, cart, "Cart updated.");
  }),

  removeItem: asyncHandler(async (req, res) => {
    const cart = await cartService.removeItem(req.customer!.id, req.params.productId as string);
    sendSuccess(res, cart, "Item removed from cart.");
  }),

  clearCart: asyncHandler(async (req, res) => {
    const cart = await cartService.clearCart(req.customer!.id);
    sendSuccess(res, cart, "Cart cleared.");
  }),

  mergeCart: asyncHandler(async (req, res) => {
    const cart = await cartService.mergeCart(req.customer!.id, req.body.items);
    sendSuccess(res, cart, "Cart merged successfully.");
  }),
};

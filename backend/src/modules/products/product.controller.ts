import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendCreated, sendPaginated, sendSuccess } from "../../utils/ApiResponse.js";
import { productService } from "./product.service.js";
import type { ProductListParams } from "./product.repository.js";

export const productController = {
  list: asyncHandler(async (req, res) => {
    const result = await productService.list(req.query as unknown as ProductListParams);
    sendPaginated(res, result.items, result.meta);
  }),

  getById: asyncHandler(async (req, res) => {
    const product = await productService.getById(req.params.id as string);
    sendSuccess(res, product);
  }),

  create: asyncHandler(async (req, res) => {
    const product = await productService.create(req.body);
    sendCreated(res, product, "Product created successfully");
  }),

  update: asyncHandler(async (req, res) => {
    const product = await productService.update(req.params.id as string, req.body);
    sendSuccess(res, product, "Product updated successfully");
  }),

  setStatus: asyncHandler(async (req, res) => {
    const product = await productService.setStatus(req.params.id as string, req.body.status);
    sendSuccess(res, product, "Product status updated successfully");
  }),

  remove: asyncHandler(async (req, res) => {
    await productService.remove(req.params.id as string);
    sendSuccess(res, { id: req.params.id }, "Product deleted successfully");
  }),
};

import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendCreated, sendPaginated, sendSuccess } from "../../utils/ApiResponse.js";
import { brandService } from "./brand.service.js";
import type { BrandListParams } from "./brand.repository.js";

export const brandController = {
  list: asyncHandler(async (req, res) => {
    const result = await brandService.list(req.query as unknown as BrandListParams);
    sendPaginated(res, result.items, result.meta);
  }),

  getById: asyncHandler(async (req, res) => {
    const brand = await brandService.getById(req.params.id as string);
    sendSuccess(res, brand);
  }),

  create: asyncHandler(async (req, res) => {
    const brand = await brandService.create(req.body);
    sendCreated(res, brand, "Brand created successfully");
  }),

  update: asyncHandler(async (req, res) => {
    const brand = await brandService.update(req.params.id as string, req.body);
    sendSuccess(res, brand, "Brand updated successfully");
  }),

  remove: asyncHandler(async (req, res) => {
    await brandService.remove(req.params.id as string);
    sendSuccess(res, { id: req.params.id }, "Brand deleted successfully");
  }),
};

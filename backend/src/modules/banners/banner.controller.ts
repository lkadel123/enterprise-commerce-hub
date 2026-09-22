import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendCreated, sendPaginated, sendSuccess } from "../../utils/ApiResponse.js";
import { bannerService } from "./banner.service.js";
import type { BannerListParams } from "./banner.repository.js";

export const bannerController = {
  list: asyncHandler(async (req, res) => {
    const result = await bannerService.list(req.query as unknown as BannerListParams);
    sendPaginated(res, result.items, result.meta);
  }),
  getById: asyncHandler(async (req, res) =>
    sendSuccess(res, await bannerService.getById(req.params.id as string)),
  ),
  create: asyncHandler(async (req, res) =>
    sendCreated(
      res,
      await bannerService.create(req.body, req.user!.id),
      "Banner created successfully",
    ),
  ),
  update: asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await bannerService.update(req.params.id as string, req.body),
      "Banner updated successfully",
    ),
  ),
  remove: asyncHandler(async (req, res) => {
    await bannerService.remove(req.params.id as string);
    sendSuccess(res, { id: req.params.id }, "Banner deleted successfully");
  }),
};

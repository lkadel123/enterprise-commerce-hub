import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendCreated, sendPaginated, sendSuccess } from "../../utils/ApiResponse.js";
import { mediaService } from "./media.service.js";
import type { MediaListParams } from "./media.repository.js";
import { badRequest } from "../../utils/ApiError.js";

export const mediaController = {
  list: asyncHandler(async (req, res) => {
    const result = await mediaService.list(req.query as unknown as MediaListParams);
    sendPaginated(res, result.items, result.meta);
  }),
  getById: asyncHandler(async (req, res) =>
    sendSuccess(res, await mediaService.getById(req.params.id as string)),
  ),
  create: asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("An image file is required.");
    sendCreated(
      res,
      await mediaService.create(req.file, req.user!.id),
      "Media uploaded successfully",
    );
  }),
  update: asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await mediaService.update(req.params.id as string, req.body),
      "Media updated successfully",
    ),
  ),
  remove: asyncHandler(async (req, res) => {
    await mediaService.remove(req.params.id as string);
    sendSuccess(res, { id: req.params.id }, "Media deleted successfully");
  }),
};

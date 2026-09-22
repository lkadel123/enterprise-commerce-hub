import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendPaginated, sendSuccess } from "../../utils/ApiResponse.js";
import { inventoryService } from "./inventory.service.js";
import type { InventoryListParams } from "./inventory.repository.js";

export const inventoryController = {
  list: asyncHandler(async (req, res) => {
    const result = await inventoryService.list(req.query as unknown as InventoryListParams);
    sendPaginated(res, result.items, result.meta);
  }),

  getById: asyncHandler(async (req, res) => {
    const record = await inventoryService.getById(req.params.id as string);
    sendSuccess(res, record);
  }),

  summary: asyncHandler(async (_req, res) => {
    const summary = await inventoryService.summary();
    sendSuccess(res, summary);
  }),

  adjust: asyncHandler(async (req, res) => {
    const record = await inventoryService.adjust(req.body, req.user!.id);
    sendSuccess(res, record, "Stock adjustment recorded");
  }),
};

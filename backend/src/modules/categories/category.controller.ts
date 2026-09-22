import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendCreated, sendPaginated, sendSuccess } from "../../utils/ApiResponse.js";
import { categoryService } from "./category.service.js";
import type { CategoryListParams } from "./category.repository.js";

export const categoryController = {
  list: asyncHandler(async (req, res) => {
    const result = await categoryService.list(req.query as unknown as CategoryListParams);
    sendPaginated(res, result.items, result.meta);
  }),

  getById: asyncHandler(async (req, res) => {
    const category = await categoryService.getById(req.params.id as string);
    sendSuccess(res, category);
  }),

  create: asyncHandler(async (req, res) => {
    const category = await categoryService.create(req.body);
    sendCreated(res, category, "Category created successfully");
  }),

  update: asyncHandler(async (req, res) => {
    const category = await categoryService.update(req.params.id as string, req.body);
    sendSuccess(res, category, "Category updated successfully");
  }),

  remove: asyncHandler(async (req, res) => {
    await categoryService.remove(req.params.id as string);
    sendSuccess(res, { id: req.params.id }, "Category deleted successfully");
  }),
};

import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/ApiResponse.js";
import { reportService } from "./report.service.js";

export const reportController = {
  overview: asyncHandler(async (_req, res) => {
    const data = await reportService.overview();
    sendSuccess(res, data);
  }),

  revenue: asyncHandler(async (req, res) => {
    const data = await reportService.revenue(req.query);
    sendSuccess(res, data);
  }),

  categories: asyncHandler(async (req, res) => {
    const data = await reportService.categories(req.query);
    sendSuccess(res, data);
  }),

  paymentMethods: asyncHandler(async (req, res) => {
    const data = await reportService.paymentMethods(req.query);
    sendSuccess(res, data);
  }),

  regions: asyncHandler(async (req, res) => {
    const data = await reportService.regions(req.query);
    sendSuccess(res, data);
  }),

  topProducts: asyncHandler(async (req, res) => {
    const data = await reportService.topProducts(Number(req.query.limit));
    sendSuccess(res, data);
  }),
};

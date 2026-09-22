import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendCreated, sendPaginated, sendSuccess } from "../../utils/ApiResponse.js";
import { couponService } from "./coupon.service.js";
import type { CouponListParams } from "./coupon.repository.js";

export const couponController = {
  list: asyncHandler(async (req, res) => {
    const result = await couponService.list(req.query as unknown as CouponListParams);
    sendPaginated(res, result.items, result.meta);
  }),

  getById: asyncHandler(async (req, res) => {
    const coupon = await couponService.getById(req.params.id as string);
    sendSuccess(res, coupon);
  }),

  create: asyncHandler(async (req, res) => {
    const coupon = await couponService.create(req.body);
    sendCreated(res, coupon, "Coupon created successfully");
  }),

  update: asyncHandler(async (req, res) => {
    const coupon = await couponService.update(req.params.id as string, req.body);
    sendSuccess(res, coupon, "Coupon updated successfully");
  }),

  remove: asyncHandler(async (req, res) => {
    await couponService.remove(req.params.id as string);
    sendSuccess(res, { id: req.params.id }, "Coupon deleted successfully");
  }),
};

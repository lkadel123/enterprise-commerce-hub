import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendPaginated, sendSuccess } from "../../utils/ApiResponse.js";
import { customerCouponService } from "./customer-coupon.service.js";
import type { CouponValidateInput, CustomerCouponListParams } from "./customer-coupon.types.js";

/**
 * Customer coupon endpoints. All routes are gated by `customerAuthenticate`;
 * customer identity is taken from `req.customer` only.
 */
export const customerCouponController = {
  validate: asyncHandler(async (req, res) => {
    const result = await customerCouponService.validate(
      req.customer!.id,
      req.body as CouponValidateInput,
    );
    sendSuccess(res, result);
  }),

  list: asyncHandler(async (req, res) => {
    const result = await customerCouponService.list(
      req.customer!.id,
      req.query as unknown as CustomerCouponListParams,
    );
    sendPaginated(res, result.items, result.meta);
  }),
};

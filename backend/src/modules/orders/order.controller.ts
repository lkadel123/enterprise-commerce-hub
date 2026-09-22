import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendCreated, sendPaginated, sendSuccess } from "../../utils/ApiResponse.js";
import { orderService } from "./order.service.js";
import type { OrderListParams } from "./order.repository.js";

export const orderController = {
  list: asyncHandler(async (req, res) => {
    const result = await orderService.list(req.query as unknown as OrderListParams);
    sendPaginated(res, result.items, result.meta);
  }),

  getById: asyncHandler(async (req, res) => {
    const order = await orderService.getById(req.params.id as string);
    sendSuccess(res, order);
  }),

  create: asyncHandler(async (req, res) => {
    const order = await orderService.create(req.body);
    sendCreated(res, order, "Order created successfully");
  }),

  setStatus: asyncHandler(async (req, res) => {
    const order = await orderService.setStatus(req.params.id as string, req.body);
    sendSuccess(res, order, "Order status updated successfully");
  }),

  setPayment: asyncHandler(async (req, res) => {
    const order = await orderService.setPayment(req.params.id as string, req.body);
    sendSuccess(res, order, "Payment status updated successfully");
  }),

  cancel: asyncHandler(async (req, res) => {
    const order = await orderService.cancel(req.params.id as string, req.body.reason);
    sendSuccess(res, order, "Order cancelled successfully");
  }),

  refund: asyncHandler(async (req, res) => {
    const order = await orderService.refund(req.params.id as string, req.body);
    sendSuccess(res, order, "Refund processed successfully");
  }),

  expirePending: asyncHandler(async (_req, res) => {
    // Phase 16C: operations endpoint for cron/scheduler/manual expiry sweeps.
    const result = await orderService.expirePendingOrders();
    sendSuccess(res, result, "Expired pending orders processed");
  }),
};

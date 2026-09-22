import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendPaginated, sendSuccess } from "../../utils/ApiResponse.js";
import { customerOrderService } from "./customer-order.service.js";
import type { CustomerOrderListParams } from "./customer-order.types.js";

export const customerOrderController = {
  create: asyncHandler(async (req, res) => {
    // Phase 16B: opaque idempotency key from the Idempotency-Key header.
    // Scoped to the authenticated customer inside the service; a client can
    // never scope a key to another customer's orders.
    const rawKey = req.header("Idempotency-Key");
    const idempotencyKey =
      typeof rawKey === "string" && rawKey.trim().length > 0 ? rawKey.trim().slice(0, 200) : undefined;
    const order = await customerOrderService.create(req.customer!.id, {
      ...req.body,
      idempotencyKey,
    });
    sendSuccess(res, order, "Order placed successfully.", 201);
  }),

  list: asyncHandler(async (req, res) => {
    const params = req.query as unknown as CustomerOrderListParams;
    const result = await customerOrderService.list(req.customer!.id, params);
    sendPaginated(res, result.items, result.meta);
  }),

  getById: asyncHandler(async (req, res) => {
    const order = await customerOrderService.getById(req.customer!.id, req.params.id as string);
    sendSuccess(res, order);
  }),

  getTracking: asyncHandler(async (req, res) => {
    const tracking = await customerOrderService.getTracking(
      req.customer!.id,
      req.params.id as string,
    );
    sendSuccess(res, tracking);
  }),
};

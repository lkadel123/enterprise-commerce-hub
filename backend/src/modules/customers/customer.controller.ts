import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendCreated, sendPaginated, sendSuccess } from "../../utils/ApiResponse.js";
import { customerService } from "./customer.service.js";
import type { CustomerListParams } from "./customer.repository.js";

export const customerController = {
  list: asyncHandler(async (req, res) => {
    const result = await customerService.list(req.query as unknown as CustomerListParams);
    sendPaginated(res, result.items, result.meta);
  }),

  getById: asyncHandler(async (req, res) => {
    const customer = await customerService.getById(req.params.id as string);
    sendSuccess(res, customer);
  }),

  create: asyncHandler(async (req, res) => {
    const customer = await customerService.create(req.body);
    sendCreated(res, customer, "Customer created successfully");
  }),

  update: asyncHandler(async (req, res) => {
    const customer = await customerService.update(req.params.id as string, req.body);
    sendSuccess(res, customer, "Customer updated successfully");
  }),

  remove: asyncHandler(async (req, res) => {
    await customerService.remove(req.params.id as string);
    sendSuccess(res, { id: req.params.id }, "Customer deleted successfully");
  }),
};

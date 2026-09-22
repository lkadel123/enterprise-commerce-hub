import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendCreated, sendPaginated, sendSuccess } from "../../utils/ApiResponse.js";
import { customerAddressService } from "./customer-address.service.js";
import type { AddressListParams } from "./customer-address.repository.js";

export const customerAddressController = {
  list: asyncHandler(async (req, res) => {
    const params = req.query as unknown as AddressListParams;
    const result = await customerAddressService.list(req.customer!.id, params);
    sendPaginated(res, result.items, result.meta);
  }),

  getById: asyncHandler(async (req, res) => {
    const addr = await customerAddressService.getById(req.params.id as string, req.customer!.id);
    sendSuccess(res, addr);
  }),

  create: asyncHandler(async (req, res) => {
    const addr = await customerAddressService.create(req.customer!.id, req.body);
    sendCreated(res, addr, "Address created successfully");
  }),

  update: asyncHandler(async (req, res) => {
    const existingId = req.params.id as string;
    const addr = await customerAddressService.update(existingId, req.customer!.id, req.body);
    sendSuccess(res, addr, "Address updated successfully");
  }),

  remove: asyncHandler(async (req, res) => {
    await customerAddressService.remove(req.params.id as string, req.customer!.id);
    sendSuccess(res, { id: req.params.id }, "Address deleted successfully");
  }),
};

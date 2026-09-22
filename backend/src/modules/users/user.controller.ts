import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendCreated, sendPaginated, sendSuccess } from "../../utils/ApiResponse.js";
import { userService } from "./user.service.js";
import type { UserListParams } from "./user.repository.js";

export const userController = {
  list: asyncHandler(async (req, res) => {
    const result = await userService.list(req.query as unknown as UserListParams);
    sendPaginated(res, result.items, result.meta);
  }),

  getById: asyncHandler(async (req, res) => {
    const user = await userService.getById(req.params.id as string);
    sendSuccess(res, user);
  }),

  create: asyncHandler(async (req, res) => {
    const user = await userService.create(req.body);
    sendCreated(res, user, "User created successfully");
  }),

  update: asyncHandler(async (req, res) => {
    const user = await userService.update(req.params.id as string, req.body);
    sendSuccess(res, user, "User updated successfully");
  }),

  resetPassword: asyncHandler(async (req, res) => {
    await userService.resetPassword(req.params.id as string, req.body.newPassword);
    sendSuccess(res, { id: req.params.id }, "Password reset successfully");
  }),

  remove: asyncHandler(async (req, res) => {
    await userService.remove(req.params.id as string, req.user!.id);
    sendSuccess(res, { id: req.params.id }, "User deleted successfully");
  }),

  listRoles: asyncHandler(async (_req, res) => {
    sendSuccess(res, userService.listRoles());
  }),
};

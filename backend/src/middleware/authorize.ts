import type { RequestHandler } from "express";
import type { PermissionAction, PermissionModule } from "../constants/permissions.js";
import { hasPermission, type RoleName } from "../constants/roles.js";
import { forbidden, unauthorized } from "../utils/ApiError.js";

/**
 * RBAC guard factory: `requirePermission("catalog", "edit")`.
 * Must be mounted after `authenticate`.
 */
export function requirePermission(
  module: PermissionModule,
  action: PermissionAction,
): RequestHandler {
  return (req, _res, next) => {
    const role = req.user?.role;
    if (!role) {
      next(unauthorized());
      return;
    }
    if (!hasPermission(role, module, action)) {
      next(
        forbidden(
          `Missing required permission: ${action} on module "${module}". Your role is "${role}".`,
        ),
      );
      return;
    }
    next();
  };
}

export type { RoleName };

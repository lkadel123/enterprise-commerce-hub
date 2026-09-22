import type { PermissionAction, PermissionModule } from "../constants/permissions.js";
import type { RoleName } from "../constants/roles.js";

/** Authenticated user attached to `req.user` by the authenticate middleware. */
export interface RequestUser {
  id: string;
  name: string;
  email: string;
  role: RoleName;
}

export interface ModulePermission {
  module: PermissionModule;
  actions: PermissionAction[];
}

/** Authenticated customer attached to `req.customer` by the customerAuthenticate middleware. */
export interface CustomerRequestUser {
  /** CustomerAccount (login identity) id. */
  id: string;
  /** Linked CRM Customer id; ownership key for customer-owned resources. Null when unlinked. */
  customerId: string | null;
  name: string;
  email: string;
  status: string;
}

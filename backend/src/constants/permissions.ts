/**
 * Permission modules and actions. Mirrors the permission matrix rendered on
 * the admin `Users & Roles` page (see docs/BACKEND-ARCHITECTURE.md §A7).
 */
export const PERMISSION_MODULES = [
  "catalog",
  "orders",
  "customers",
  "inventory",
  "marketing",
  "reports",
  "settings",
  "administration",
  "messages",
  "support",
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export const PERMISSION_ACTIONS = ["view", "create", "edit", "delete"] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export function isPermissionModule(value: string): value is PermissionModule {
  return (PERMISSION_MODULES as readonly string[]).includes(value);
}

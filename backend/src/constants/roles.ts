import type { PermissionAction, PermissionModule } from "./permissions.js";

export const ROLE_NAMES = [
  "Super Admin",
  "Admin",
  "Manager",
  "Sales Manager",
  "Inventory Manager",
  "Customer Support",
  "Content Manager",
  "Marketing Manager",
  "Accountant",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export interface RolePermissionRule {
  module: PermissionModule;
  actions: readonly PermissionAction[];
}

const ALL_MODULES: readonly PermissionModule[] = [
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
];
const VIEW: readonly PermissionAction[] = ["view"];
const ALL: readonly PermissionAction[] = ["view", "create", "edit", "delete"];

/** Role → module-level permission rules (defaults; tunable per deployment). */
export const ROLE_PERMISSIONS: Record<RoleName, readonly RolePermissionRule[]> = {
  "Super Admin": ALL_MODULES.map((module) => ({ module, actions: ALL })),

  Admin: [
    { module: "messages", actions: ALL },
    { module: "catalog", actions: ["view", "create", "edit"] },
    { module: "orders", actions: ALL },
    { module: "customers", actions: ALL },
    { module: "inventory", actions: ["view", "create", "edit"] },
    { module: "marketing", actions: ALL },
    { module: "reports", actions: ALL },
    { module: "settings", actions: ["view", "edit"] },
    { module: "administration", actions: ["view", "create", "edit"] },
  ],

  Manager: [
    { module: "messages", actions: ALL },
    { module: "catalog", actions: ["view", "create", "edit"] },
    { module: "orders", actions: ["view", "create", "edit"] },
    { module: "customers", actions: ["view", "create", "edit"] },
    { module: "inventory", actions: VIEW },
    { module: "marketing", actions: ["view", "create", "edit"] },
    { module: "reports", actions: VIEW },
    { module: "settings", actions: VIEW },
  ],

  "Sales Manager": [
    { module: "messages", actions: ALL },
    { module: "orders", actions: ["view", "create", "edit"] },
    { module: "customers", actions: ["view", "create", "edit"] },
    { module: "marketing", actions: VIEW },
    { module: "reports", actions: VIEW },
  ],

  "Inventory Manager": [
    { module: "messages", actions: ALL },
    { module: "catalog", actions: VIEW },
    { module: "inventory", actions: ALL },
    { module: "reports", actions: VIEW },
  ],

  "Customer Support": [
    { module: "messages", actions: ALL },
    { module: "catalog", actions: VIEW },
    { module: "orders", actions: ["view", "create", "edit"] },
    { module: "customers", actions: ["view", "edit"] },
  ],

  "Content Manager": [
    { module: "messages", actions: ALL },
    { module: "catalog", actions: ["view", "create", "edit"] },
    { module: "marketing", actions: ["view", "create", "edit"] },
    { module: "reports", actions: VIEW },
  ],

  "Marketing Manager": [
    { module: "messages", actions: ALL },
    { module: "catalog", actions: VIEW },
    { module: "customers", actions: VIEW },
    { module: "marketing", actions: ALL },
    { module: "reports", actions: VIEW },
  ],

  Accountant: [
    { module: "messages", actions: ALL },
    { module: "customers", actions: VIEW },
    { module: "orders", actions: ["view", "edit"] },
    { module: "reports", actions: ALL },
  ],
};

export function hasPermission(
  role: RoleName,
  module: PermissionModule,
  action: PermissionAction,
): boolean {
  if (role === "Super Admin") return true;
  const rules = ROLE_PERMISSIONS[role];
  const rule = rules.find((r) => r.module === module);
  if (!rule) return false;
  return rule.actions.includes(action);
}

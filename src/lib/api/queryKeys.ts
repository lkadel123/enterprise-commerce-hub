/**
 * Centralized TanStack Query key factory for the admin console.
 *
 * Every admin list/detail key is derived here so mutations can invalidate
 * precisely what a mutation affects. Keys are stable strings + serializable
 * params (the same convention as the storefront's feature-hook modules).
 */

export const adminKeys = {
  dashboard: ["admin", "reports", "overview"] as const,
  revenue: (params: object = {}) => ["admin", "reports", "revenue", params] as const,
  reportCategories: (params: object = {}) => ["admin", "reports", "categories", params] as const,
  paymentMethods: (params: object = {}) => ["admin", "reports", "payment-methods", params] as const,
  topProducts: (limit: number) => ["admin", "reports", "top-products", limit] as const,

  products: (params: object = {}) => ["admin", "products", params] as const,
  product: (id: string) => ["admin", "products", id] as const,

  categories: (params: object = {}) => ["admin", "categories", params] as const,
  category: (id: string) => ["admin", "categories", id] as const,

  brands: (params: object = {}) => ["admin", "brands", params] as const,
  brand: (id: string) => ["admin", "brands", id] as const,

  inventoryList: (params: object = {}) => ["admin", "inventory", "list", params] as const,
  inventorySummary: ["admin", "inventory", "summary"] as const,

  orders: (params: object = {}) => ["admin", "orders", params] as const,
  order: (id: string) => ["admin", "orders", id] as const,

  customers: (params: object = {}) => ["admin", "customers", params] as const,
  customer: (id: string) => ["admin", "customers", id] as const,

  reviews: (params: object = {}) => ["admin", "reviews", params] as const,
  reviewStats: ["admin", "reviews", "stats"] as const,

  coupons: (params: object = {}) => ["admin", "coupons", params] as const,

  banners: (params: object = {}) => ["admin", "banners", params] as const,

  media: (params: object = {}) => ["admin", "media", params] as const,

  users: (params: object = {}) => ["admin", "users", params] as const,
  userRoles: ["admin", "users", "roles"] as const,

  adminNotifications: (params: object = {}) => ["admin", "notifications", params] as const,
};

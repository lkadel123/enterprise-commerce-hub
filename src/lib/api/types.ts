/**
 * Authoritative API contracts for the admin console.
 *
 * Every type mirrors a backend DTO/service contract exactly (see the
 * per-module type files under `backend/src/modules` — e.g. `product.types.ts`
 * or `order.types.ts` — and their matching validator files).
 * Backend DTOs are the source of truth — the legacy `src/lib/mock-data.ts`
 * shapes must NOT be used against the API.
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type PermissionModule =
  | "catalog"
  | "orders"
  | "customers"
  | "inventory"
  | "marketing"
  | "reports"
  | "settings"
  | "administration"
  | "messages"
  | "support";

export type PermissionAction = "view" | "create" | "edit" | "delete";

export interface ModulePermission {
  module: PermissionModule;
  actions: PermissionAction[];
}

export type RoleName =
  | "Super Admin"
  | "Admin"
  | "Manager"
  | "Sales Manager"
  | "Inventory Manager"
  | "Customer Support"
  | "Content Manager"
  | "Marketing Manager"
  | "Accountant";

// ---------------------------------------------------------------------------
// Auth / users
// ---------------------------------------------------------------------------

export type UserStatus = "Active" | "Invited" | "Suspended";

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  status: UserStatus;
  lastActiveAt: string | null;
  createdAt: string;
}

/** `GET /auth/me` — profile without any token material. */
export interface AuthProfile {
  user: UserDto;
  permissions: ModulePermission[];
}

/** `POST /auth/login` / `POST /auth/refresh` — session establishment. */
export interface AuthSessionResult extends AuthProfile {
  accessToken: string;
}

export interface LoginInput {
  email: string;
  password: string;
  remember?: boolean;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: RoleName;
}

export interface UpdateUserInput {
  name?: string;
  role?: RoleName;
  status?: UserStatus;
}

export interface RoleDto {
  name: RoleName;
  permissions: { module: PermissionModule; actions: PermissionAction[] }[];
}

export interface UserListParams {
  q?: string;
  role?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

// ---------------------------------------------------------------------------
// Reports / dashboard (`GET /reports/*`, reports RBAC)
// ---------------------------------------------------------------------------

export type ReportGranularity = "daily" | "weekly" | "monthly" | "yearly";

export interface ReportQueryParams {
  from?: string;
  to?: string;
  granularity?: ReportGranularity;
  limit?: number;
}

export interface RevenuePointDto {
  key: string;
  label: string;
  revenue: number;
  orders: number;
  profit: number;
}

export interface CategorySalesDto {
  category: string;
  value: number;
}

export interface RegionSalesDto {
  region: string;
  value: number;
}

export interface PaymentMethodDto {
  method: string;
  value: number;
  share: number;
}

export interface TopProductDto {
  sku: string;
  name: string;
  unitsSold: number;
  revenue: number;
}

export interface OverviewDto {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  avgOrderValue: number;
  lowStockItems: number;
  pendingReviews: number;
  ordersByStatus: Record<string, number>;
}
// ---------------------------------------------------------------------------
// Catalog: products (`GET /products`, catalog RBAC)
// ---------------------------------------------------------------------------

export type ProductStatus = "Active" | "Draft" | "Out of Stock" | "Archived";

export interface ProductRefDto {
  id: string;
  name: string;
}

export interface ProductImageDto {
  url: string;
  alt?: string;
  position?: number;
  width?: number;
  height?: number;
}

export interface ProductVariationDto {
  size?: string;
  color?: string;
  sku?: string;
  price?: number;
  stock?: number;
}

export interface ProductShippingDto {
  weightKg?: number;
  shippingClass?: "standard" | "bulky" | "fragile";
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
}

export interface ProductSeoDto {
  title?: string;
  slug?: string;
  metaDescription?: string;
  keywords?: string;
}

export interface ProductDto {
  id: string;
  name: string;
  slug: string;
  sku: string;
  description: string | null;
  category: ProductRefDto | null;
  brand: ProductRefDto | null;
  price: number;
  cost: number;
  status: ProductStatus;
  rating: number;
  reviewsCount: number;
  featured: boolean;
  searchable: boolean;
  stock: number;
  reserved: number;
  images: ProductImageDto[];
  variations: ProductVariationDto[];
  shipping: ProductShippingDto;
  seo: ProductSeoDto;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductInput {
  name: string;
  sku: string;
  description?: string;
  categoryId?: string | null;
  brandId?: string | null;
  price: number;
  cost: number;
  status?: ProductStatus;
  featured?: boolean;
  searchable?: boolean;
  images?: ProductImageDto[];
  variations?: ProductVariationDto[];
  shipping?: ProductShippingDto;
  seo?: ProductSeoDto;
}

export type UpdateProductInput = Partial<CreateProductInput>;

export interface ProductListParams {
  q?: string;
  status?: string;
  category?: string;
  brand?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

// ---------------------------------------------------------------------------
// Catalog: categories (`GET /categories`, catalog RBAC)
// ---------------------------------------------------------------------------

export type CategoryStatus = "Active" | "Hidden";

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  parent: { id: string; name: string } | null;
  description: string | null;
  sort: number;
  status: CategoryStatus;
  productCount: number;
  createdAt: string;
}

export interface CreateCategoryInput {
  name: string;
  description?: string;
  parentId?: string | null;
  sort?: number;
  status?: CategoryStatus;
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string | null;
  parentId?: string | null;
  sort?: number;
  status?: CategoryStatus;
}

export interface CategoryListParams {
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

// ---------------------------------------------------------------------------
// Catalog: brands (`GET /brands`, catalog RBAC)
// ---------------------------------------------------------------------------

export type BrandStatus = "Active" | "Hidden";

export interface BrandDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  status: BrandStatus;
  productCount: number;
  createdAt: string;
}

export interface CreateBrandInput {
  name: string;
  description?: string;
  logoUrl?: string;
  status?: BrandStatus;
}

export interface UpdateBrandInput {
  name?: string;
  description?: string | null;
  logoUrl?: string | null;
  status?: BrandStatus;
}

export interface BrandListParams {
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}
// ---------------------------------------------------------------------------
// Inventory (`GET /inventory`, inventory RBAC)
// ---------------------------------------------------------------------------

export type StockStatus = "In Stock" | "Low Stock" | "Out of Stock";

export type Warehouse = "Rotterdam DC" | "Newark DC" | "Singapore DC";

export type AdjustmentReason = "received" | "writeOff" | "transfer" | "allocation" | "manual";

export interface InventoryDto {
  id: string;
  productId: string;
  productName: string | null;
  sku: string;
  warehouse: string;
  stock: number;
  reserved: number;
  incoming: number;
  reorderLevel: number;
  status: StockStatus;
  updatedAt: string | null;
}

export interface InventorySummaryDto {
  totalProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  inventoryValue: number;
}

export interface AdjustStockInput {
  productId?: string;
  sku?: string;
  warehouse: Warehouse;
  delta: number;
  reason: AdjustmentReason;
  note?: string;
}

export interface InventoryListParams {
  q?: string;
  warehouse?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

// ---------------------------------------------------------------------------
// Orders (`GET /orders`, orders RBAC)
// ---------------------------------------------------------------------------

export type OrderStatus =
  | "Pending"
  | "Processing"
  | "Shipped"
  | "Delivered"
  | "Cancelled"
  | "Refunded"
  | "Expired";

export type PaymentStatus = "Paid" | "Pending" | "Refunded" | "Failed" | "Initiated" | "Cancelled" | "Expired";

export type PaymentMethod = "Credit Card" | "Cash on Delivery" | "Digital Wallet" | "Bank Transfer";

export type PaymentProvider = "PAYBRIDGE" | "CYBERSOURCE" | "FONEPAY" | "KHALTI" | "ESEWA" | "COD" | "BANK_TRANSFER";

export interface OrderLineItemDto {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderPaymentDto {
  method: PaymentMethod;
  status: PaymentStatus;
  provider?: PaymentProvider;
  transactionId?: string;
  providerTransactionId?: string;
  amount?: number;
  currency?: string;
  initiatedAt?: string;
}

export interface OrderAmountsDto {
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  customer: { id: string; name: string; email: string } | null;
  email: string;
  region: string;
  warehouse: string;
  items: OrderLineItemDto[];
  amounts: OrderAmountsDto;
  payment: OrderPaymentDto;
  status: OrderStatus;
  addresses: {
    shipping: { line1: string; line2?: string; city: string; state?: string; postalCode?: string; country: string } | null;
    billing: { line1: string; line2?: string; city: string; state?: string; postalCode?: string; country: string } | null;
  };
  timeline: { label: string; at: string; done: boolean }[];
  coupon: { couponId: string; code: string; discount: number } | null;
  notes: string | null;
  expiresAt: string | null;
  refund: { amount: number; reason: string | null; refundedAt: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderListParams {
  q?: string;
  status?: string;
  payment?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

// ---------------------------------------------------------------------------
// Customers (`GET /customers`, customers RBAC)
// ---------------------------------------------------------------------------

export type CustomerGroup = "Retail" | "Loyalty" | "Wholesale";

export type CustomerStatus = "Active" | "New" | "VIP" | "Blocked";

export interface CustomerDto {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  group: CustomerGroup;
  status: CustomerStatus;
  city: string | null;
  orders: number;
  spent: number;
  aov: number;
  lastOrder: string | null;
  joinedAt: string;
  createdAt: string;
}

export interface CustomerDetailDto extends CustomerDto {
  recentOrders: OrderDto[];
}

export interface CreateCustomerInput {
  name: string;
  email: string;
  phone?: string;
  group?: CustomerGroup;
  status?: CustomerStatus;
  city?: string;
}

export interface UpdateCustomerInput {
  name?: string;
  phone?: string | null;
  group?: CustomerGroup;
  status?: CustomerStatus;
  city?: string | null;
}

export interface CustomerListParams {
  q?: string;
  group?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}
// ---------------------------------------------------------------------------
// Reviews (`GET /reviews`, catalog RBAC)
// ---------------------------------------------------------------------------

export type ReviewStatus = "Approved" | "Pending" | "Rejected" | "Hidden";

export interface ReviewDto {
  id: string;
  customer: { id: string; name: string } | null;
  product: { id: string; name: string } | null;
  rating: number;
  title: string | null;
  body: string;
  helpfulCount: number;
  status: ReviewStatus;
  createdAt: string;
}

export interface ReviewStatsDto {
  average: number;
  total: number;
  pending: number;
  distribution: { stars: number; count: number }[];
}

export interface ReviewListParams {
  q?: string;
  status?: string;
  productId?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

// ---------------------------------------------------------------------------
// Coupons (`GET /coupons`, marketing RBAC)
// ---------------------------------------------------------------------------

export type CouponType = "Percentage" | "Fixed" | "Free Shipping";

export type CouponStatus = "Active" | "Expiring" | "Scheduled" | "Expired";

export interface CouponDto {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  minOrder: number;
  maxDiscount: number;
  usageLimit: number;
  perCustomerLimit: number;
  applicableCategoryIds: string[];
  startAt: string;
  endAt: string;
  used: number;
  status: CouponStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCouponInput {
  code: string;
  type: CouponType;
  value: number;
  minOrder?: number;
  maxDiscount?: number;
  usageLimit?: number;
  perCustomerLimit?: number;
  applicableCategoryIds?: string[];
  startAt: string;
  endAt: string;
}

export type UpdateCouponInput = Partial<CreateCouponInput>;

export interface CouponListParams {
  q?: string;
  type?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

// ---------------------------------------------------------------------------
// Media (`GET /media`, marketing RBAC)
// ---------------------------------------------------------------------------

export interface MediaVariantDto {
  storageKey: string;
  url: string;
  width: number;
  height: number;
  mimeType: string;
  size: number;
}

export interface MediaDto {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  alt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  variants: MediaVariantDto[];
}

export interface UpdateMediaInput {
  alt?: string | null;
}

export interface MediaListParams {
  q?: string;
  mimeType?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

// ---------------------------------------------------------------------------
// Banners (`GET /banners`, marketing RBAC)
// ---------------------------------------------------------------------------

export type BannerStatus = "Active" | "Inactive";

export interface BannerDto {
  id: string;
  title: string;
  image: { id: string; url: string; alt: string | null; mimeType: string };
  linkUrl: string | null;
  status: BannerStatus;
  startAt: string | null;
  endAt: string | null;
  sortOrder: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBannerInput {
  title: string;
  imageId: string;
  linkUrl?: string | null;
  status?: BannerStatus;
  startAt?: string | null;
  endAt?: string | null;
  sortOrder?: number;
}

export type UpdateBannerInput = Partial<CreateBannerInput>;

export interface BannerListParams {
  q?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

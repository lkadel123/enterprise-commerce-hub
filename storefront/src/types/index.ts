export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiFieldError {
  path?: string;
  message: string;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ApiFieldError[];
    stack?: string;
  };
}

/** Success envelope for non-paginated responses. */
export interface ApiEnvelope<T> {
  success?: true;
  data: T;
  meta?: PaginationMeta;
  message?: string;
}

export interface Paged<T> {
  items: T[];
  meta: PaginationMeta;
}

// ---------------------------------------------------------------------------
// Auth / customer account
// ---------------------------------------------------------------------------

export type CustomerAccountStatus = "Active" | "Suspended";

export interface CustomerAuthProfile {
  id: string;
  name: string;
  email: string;
  customerId: string | null;
  status: CustomerAccountStatus;
}

export interface CustomerSessionResult {
  customer: CustomerAuthProfile;
  accessToken: string;
  remember: boolean;
}

export interface CustomerProfileSnap {
  name: string;
  email: string;
  phone: string | null;
}

export interface CustomerProfileResult {
  customer: CustomerAuthProfile;
  customerProfile: CustomerProfileSnap | null;
}

export interface ChangePasswordOk {
  changed: boolean;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export type ProductStatus = "Active" | "Draft" | "Out of Stock" | "Archived";

export interface PublicRef {
  id: string;
  name: string;
  slug: string;
}

export interface MediaVariant {
  name?: string;
  url?: string;
  width?: number;
  height?: number;
}

export interface ProductImage {
  url: string;
  alt?: string;
  position?: number;
  width?: number;
  height?: number;
  variants?: MediaVariant[];
}

export interface ProductVariation {
  size?: string;
  color?: string;
  sku?: string;
  price?: number;
  stock?: number;
}

export interface ProductShipping {
  weightKg?: number;
  shippingClass?: "standard" | "bulky" | "fragile";
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
}

export interface ProductSeo {
  title?: string;
  slug?: string;
  metaDescription?: string;
  keywords?: string;
}

export interface PublicProductDto {
  id: string;
  name: string;
  slug: string;
  sku: string;
  description: string | null;
  category: PublicRef | null;
  brand: PublicRef | null;
  price: number;
  stock: number;
  status: ProductStatus;
  rating: number;
  reviewsCount: number;
  featured: boolean;
  images: ProductImage[];
  variations: ProductVariation[];
  shipping: ProductShipping;
  seo: ProductSeo;
  createdAt: string;
  updatedAt: string;
}

/** Backend `products` list query params (verified allowlist). */
export interface ProductListParams {
  [key: string]: string | number | boolean | null | undefined;
  q?: string | undefined;
  category?: string | undefined;
  brand?: string | undefined;
  featured?: boolean | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  sort?: string | undefined;
}

export const PRODUCT_SORT_FIELDS = [
  "name",
  "price",
  "rating",
  "reviewsCount",
  "featured",
  "createdAt",
] as const;

export interface PublicCategoryDto {
  id: string;
  name: string;
  slug: string;
  parent: { id: string; name: string } | null;
  description: string | null;
  sort: number;
  productCount: number;
}

export interface PublicBrandDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  productCount: number;
}

export interface PublicReviewDto {
  id: string;
  customer: { id: string; name: string } | null;
  rating: number;
  title: string | null;
  body: string;
  helpfulCount: number;
  createdAt: string;
}

export interface PublicBannerImageDto {
  url: string;
  alt: string | null;
  mimeType: string;
}

export interface PublicBannerDto {
  id: string;
  title: string;
  image: PublicBannerImageDto | null;
  linkUrl: string | null;
  sortOrder: number;
  startAt: string | null;
  endAt: string | null;
}

export interface PublicSearchSuggestionDto {
  q: string;
  suggestions: string[];
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export interface CartItemDto {
  /** Cart-item identifier (productId). */
  id: string;
  productId: string;
  quantity: number;
  price: number;
  name: string;
  slug: string;
  image: string | null;
  availableStock: number;
}

export interface CartDto {
  id: string;
  items: CartItemDto[];
  itemCount: number;
  subtotal: number;
  createdAt: string;
  updatedAt: string;
}

export interface AddToCartInput {
  productId: string;
  quantity?: number;
}

export interface MergeCartInput {
  items: { productId: string; quantity: number }[];
}

// ---------------------------------------------------------------------------
// Wishlist
// ---------------------------------------------------------------------------

export interface WishlistItemDto {
  /** Product id (also the wishlist-item id). */
  id: string;
  productId: string;
  name: string;
  slug: string;
  price: number;
  image: string | null;
  inStock: boolean;
  addedAt: string;
}

export interface WishlistDto {
  id: string;
  items: WishlistItemDto[];
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WishlistCheckResult {
  inWishlist: boolean;
}

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

export type CouponType = "Percentage" | "Fixed" | "Free Shipping";

export type CouponValidationReason =
  | "not_found"
  | "scheduled"
  | "expired"
  | "usage_limit"
  | "per_customer_limit"
  | "product"
  | "category"
  | "minimum_order";

export interface CouponValidationResult {
  valid: boolean;
  coupon?: {
    code: string;
    type: CouponType;
    value: number;
    minOrder: number;
    maxDiscount: number;
    endAt: string;
    complete: boolean;
    discount: number | null;
    perCustomerRemaining: number | null;
  };
  reason?: CouponValidationReason;
  message?: string;
}

export interface CustomerCouponDto {
  code: string;
  type: CouponType;
  value: number;
  minOrder: number;
  maxDiscount: number;
  endAt: string;
  applicableCategoryIds: string[];
  usable: boolean;
  perCustomerRemaining: number | null;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export type OrderStatus =
  "Pending" | "Processing" | "Shipped" | "Delivered" | "Cancelled" | "Refunded" | "Expired";

export type PaymentMethod = "Credit Card" | "Cash on Delivery" | "Digital Wallet" | "Bank Transfer";

export type PaymentStatus =
  "Paid" | "Pending" | "Refunded" | "Failed" | "Initiated" | "Cancelled" | "Expired";

/**
 * Payment providers. "CYBERSOURCE" and "FONEPAY" are the active online
 * gateways. "PAYBRIDGE"/"KHALTI"/"ESEWA" are retained ONLY so historical
 * orders placed through those retired gateways still render correctly;
 * new payments never use them.
 */
export type PaymentProvider =
  "PAYBRIDGE" | "CYBERSOURCE" | "FONEPAY" | "KHALTI" | "ESEWA" | "COD" | "BANK_TRANSFER";

/**
 * Gateways this storefront can actively start a payment with. A narrower set
 * than {@link PaymentProvider} (which also carries legacy/historical values):
 * "FONEPAY" is the QR / Intent Checkout gateway and "CYBERSOURCE" is the
 * Unified Checkout card gateway. The backend re-validates the value and
 * refuses any gateway that is not configured.
 */
export type PaymentGatewayHint = "FONEPAY" | "CYBERSOURCE";

export type RefundStatus = "PENDING" | "SUCCESS" | "FAILED" | "UNSUPPORTED";

export interface OrderAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
}

export interface OrderAmounts {
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
}

export interface OrderItem {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderPayment {
  method: string;
  status: PaymentStatus;
  provider?: PaymentProvider;
  transactionId?: string;
  providerTransactionId?: string;
  amount?: number;
  currency?: string;
  initiatedAt?: string;
  paidAt?: string;
  failureReason?: string;
  /**
   * Opaque provider bookkeeping persisted by the backend on the order document
   * (`toOrderDto` returns `payment` verbatim). Customer-safe and display-only:
   * it carries the advisory checkout-time `gatewayChoice` and the Fonepay QR
   * envelope (`qrImage` PNG data URL / `displayName`). Credentials and access
   * tokens are never stored here, and NOTHING in this object is proof of
   * payment — success is only ever the authoritative payment status endpoint.
   */
  metadata?: Record<string, unknown>;
}

export interface OrderTimelineEntry {
  label: string;
  at: string;
  done: boolean;
}

/** Refund record returned on the order DTO (Phase 16 / Phase 17). */
export interface OrderRefund {
  amount: number;
  status: RefundStatus;
  providerRef?: string;
  initiatedAt: string;
  reason?: string;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  customer: { id: string; name: string; email: string } | null;
  email: string;
  region: string;
  warehouse: string;
  items: OrderItem[];
  amounts: OrderAmounts;
  payment: OrderPayment;
  status: OrderStatus;
  addresses: { shipping: OrderAddress | null; billing: OrderAddress | null };
  timeline: OrderTimelineEntry[];
  coupon: { code: string; discount: number } | null;
  notes: string | null;
  expiresAt: string | null;
  refund: OrderRefund | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerTrackingDto {
  orderId: string;
  orderNumber: string;
  currentStatus: string;
  timeline: OrderTimelineEntry[];
}

/**
 * Customer checkout request — mirrors the backend
 * `CreateCustomerOrderInput` / `createCustomerOrderSchema` exactly.
 *
 * SECURITY: contains ONLY opaque identifiers and strings. No financial
 * fields (price/subtotal/discount/shipping/tax/total) and no customerId —
 * the backend schema is strict and rejects unknown keys, and all amounts
 * are computed server-side.
 */
export interface CreateCustomerOrderInput {
  /** Line items. Omit to check out from the server cart. */
  items?: { productId: string; quantity: number }[];
  shippingAddress?: OrderAddress;
  billingAddress?: OrderAddress;
  paymentMethod?: PaymentMethod;
  /**
   * Optional checkout-time gateway hint ("FONEPAY" | "CYBERSOURCE") recorded by
   * the backend in `payment.metadata.gatewayChoice` so the post-order page can
   * offer the flow the customer picked. Advisory only — the authoritative
   * gateway is chosen (and re-validated) at payment initiation. Not financial.
   */
  paymentGateway?: PaymentGatewayHint;
  couponCode?: string;
  notes?: string;
}

/** Coupon validate request — mirrors `validateCouponSchema` (`.strict()`). */
export interface CouponValidateInput {
  code: string;
  items?: { productId: string; quantity: number }[];
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface CustomerPaymentDto {
  orderId: string;
  gateway: PaymentProvider | null;
  method: PaymentMethod;
  status: PaymentStatus;
  transactionId: string | null;
  providerTransactionId: string | null;
  amount: number | null;
  currency: string;
  initiatedAt: string | null;
  paidAt: string | null;
  failureReason: string | null;
  /**
   * Hosted-checkout gateways — the redirect URL returned at initiation (if the
   * gateway uses a redirect surface). Display only: success comes exclusively
   * from server-side verification via the status/verify endpoints.
   */
  paymentUrl?: string | null;
  expiresAt?: string | null;
  /**
   * Fonepay QR / Intent Checkout — a display-only PNG data URL of the payment
   * QR, rendered server-side from the provider `qrString`. Safe to render: it
   * contains no credentials and is never proof of payment. Success comes
   * exclusively from server-side Status-API verification via the status/verify
   * endpoints. `null` for every non-Fonepay payment.
   */
  qrImage?: string | null;
  /** Fonepay merchant/terminal display name shown next to the QR. */
  qrDisplayName?: string | null;
  /**
   * Cybersource Unified Checkout public capture-context session data — the
   * one-time JWT the embedded SDK needs to render Cybersource's own payment
   * iframe. Server-created; contains no secrets and no financial authority.
   * `null` for every non-Cybersource payment.
   */
  clientToken?: string | null;
}

export interface CustomerPaymentResult {
  payment: CustomerPaymentDto;
  duplicate: boolean;
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export interface SubmitReviewInput {
  /** Phase 18 (G18-02): the customer's own delivered order that contained the product. */
  orderId: string;
  productId: string;
  rating: number;
  title?: string;
  body: string;
}

/** Customer's own review — mirrors the backend `ReviewDto` exactly. */
export type ReviewStatus = "Approved" | "Pending" | "Rejected" | "Hidden";

export interface CustomerReviewDto {
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

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotificationPriority = "low" | "normal" | "high" | "critical";

export interface CustomerNotificationDto {
  id: string;
  type: string;
  title: string;
  message: string | null;
  priority: NotificationPriority;
  read: boolean;
  readAt: string | null;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UnreadCountDto {
  count: number;
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export interface CustomerAddressDto {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: string;
}

export interface CreateCustomerAddressInput {
  label: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  isDefault?: boolean;
}

export interface UpdateCustomerAddressInput {
  label?: string;
  line1?: string;
  line2?: string | null;
  city?: string;
  state?: string | null;
  postalCode?: string;
  country?: string;
  isDefault?: boolean;
}

// ---------------------------------------------------------------------------
// Support
// ---------------------------------------------------------------------------

export type ConversationStatus = "open" | "in_progress" | "resolved" | "closed";

export type ConversationPriority = "low" | "normal" | "high" | "urgent";

export interface SupportConversationDto {
  id: string;
  subject: string;
  status: ConversationStatus;
  priority: ConversationPriority;
  category: string | null;
  relatedOrderId: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessageDto {
  id: string;
  conversationId: string;
  senderType: "customer" | "agent" | "system";
  message: string;
  read: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

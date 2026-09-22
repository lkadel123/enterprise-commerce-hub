import type { Types } from "mongoose";
import type {
  IOrder,
  IOrderAddress,
  IOrderAmounts,
  IOrderCoupon,
  IOrderPayment,
  IOrderRefund,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Region,
} from "./order.model.js";

export interface OrderCustomerRef {
  _id: Types.ObjectId;
  name: string;
  email: string;
}

export interface OrderRecord extends Omit<IOrder, "customer"> {
  customer: OrderCustomerRef | null;
}

export interface OrderItemInput {
  productId: string;
  qty: number;
}

export interface OrderAddressInput {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
}

export interface CreateOrderInput {
  customerId: string;
  items: OrderItemInput[];
  paymentMethod?: PaymentMethod;
  /**
   * Optional checkout-time gateway hint ("CYBERSOURCE" | "FONEPAY") recorded in
   * `payment.metadata.gatewayChoice` so the post-order page can start the
   * chosen flow. Advisory only — the authoritative gateway is the one actually
   * used at payment initiation.
   */
  paymentGateway?: string;
  region?: Region;
  warehouse?: string;
  couponCode?: string;
  shippingFee?: number;
  notes?: string;
  shippingAddress?: OrderAddressInput;
  billingAddress?: OrderAddressInput;
  /** Phase 16B: opaque idempotency key (scoped to the owning customer). */
  idempotencyKey?: string;
  /** Canonical fingerprint of the create payload for "same key, different body" detection. Phase 16B. */
  idempotencyFingerprint?: string;
  /** Phase 16C: soft payment/order expiry deadline. */
  expiresAt?: Date;
}

export interface SetOrderStatusInput {
  status: OrderStatus;
}

export interface SetOrderPaymentInput {
  paymentStatus: PaymentStatus;
  transactionId?: string;
}

export interface RefundOrderInput {
  reason?: string;
  /** Phase 16E: explicit refund amount (defaults to order total if omitted). */
  amount?: number;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  customer: { id: string; name: string; email: string } | null;
  email: string;
  region: string;
  warehouse: string;
  items: {
    productId: string;
    sku: string;
    name: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  amounts: IOrderAmounts;
  payment: IOrderPayment;
  status: OrderStatus;
  addresses: { shipping: IOrderAddress | null; billing: IOrderAddress | null };
  timeline: { label: string; at: string; done: boolean }[];
  coupon: IOrderCoupon | null;
  notes: string | null;
  expiresAt: string | null;
  refund: IOrderRefund | null;
  createdAt: string;
  updatedAt: string;
}

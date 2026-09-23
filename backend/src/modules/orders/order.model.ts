import { Schema, model, type HydratedDocument, type Types } from "mongoose";
import { WAREHOUSES } from "../inventory/inventory.model.js";

export const ORDER_STATUSES = [
  "Pending",
  "Processing",
  "Shipped",
  "Delivered",
  "Cancelled",
  "Refunded",
  "Expired",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = [
  "Credit Card",
  "Cash on Delivery",
  "Digital Wallet",
  "Bank Transfer",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  "Paid",
  "Pending",
  "Refunded",
  "Failed",
  "Initiated",
  "Cancelled",
  "Expired",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const REGIONS = [
  "North America",
  "Europe",
  "Asia Pacific",
  "Latin America",
  "Middle East",
] as const;
export type Region = (typeof REGIONS)[number];

export interface IOrderLineItem {
  product: Types.ObjectId;
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface IOrderAmounts {
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
}

export interface IOrderAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
}

export interface IOrderTimelineEntry {
  label: string;
  at: Date;
  done: boolean;
}

/**
 * Payment providers. "CYBERSOURCE" and "FONEPAY" are the active online
 * payment gateways. "PAYBRIDGE", "KHALTI" and "ESEWA" are retained ONLY for
 * historical data compatibility — existing orders in the database reference
 * them and their documents must continue to validate.
 */
export const PAYMENT_PROVIDERS = [
  "PAYBRIDGE",
  "CYBERSOURCE",
  "FONEPAY",
  "KHALTI",
  "ESEWA",
  "COD",
  "BANK_TRANSFER",
] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export interface IOrderPayment {
  method: PaymentMethod;
  status: PaymentStatus;
  provider?: PaymentProvider;
  transactionId?: string;
  providerTransactionId?: string;
  amount?: number;
  currency?: string;
  initiatedAt?: Date;
  paidAt?: Date;
  failureReason?: string;
  metadata?: Record<string, unknown>;
}

export interface IOrderCoupon {
  code: string;
  discount: number;
}

/** Refund record (Phase 16). Admin/server-owned; gateway outcome captured idempotently. */
export interface IOrderRefund {
  amount: number;
  status: "PENDING" | "SUCCESS" | "FAILED" | "UNSUPPORTED";
  providerRef?: string;
  initiatedAt: Date;
  reason?: string;
}

export interface IOrder {
  _id: Types.ObjectId;
  orderNumber: string;
  customer: Types.ObjectId;
  email: string;
  region: string;
  warehouse: string;
  items: IOrderLineItem[];
  amounts: IOrderAmounts;
  payment: IOrderPayment;
  status: OrderStatus;
  addresses: { shipping: IOrderAddress | null; billing: IOrderAddress | null };
  timeline: IOrderTimelineEntry[];
  coupon: IOrderCoupon | null;
  notes?: string;
  /** Opaque customer-order idempotency key (unique per customer). Phase 16B. */
  idempotencyKey?: string;
  /** Canonical fingerprint of the create payload; detects "same key, different body". Phase 16B. */
  idempotencyHash?: string;
  /** Soft deadline after which an unpaid Pending order may be expired. Phase 16C. */
  expiresAt?: Date;
  /** Refund record for the admin refund flow. Phase 16E. */
  refund?: IOrderRefund;
  createdAt: Date;
  updatedAt: Date;
}

const orderLineItemSchema = new Schema<IOrderLineItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    sku: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    qty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const orderAddressSchema = new Schema<IOrderAddress>(
  {
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, required: true },
    state: { type: String },
    postalCode: { type: String },
    country: { type: String, required: true },
  },
  { _id: false },
);

const orderTimelineEntrySchema = new Schema<IOrderTimelineEntry>(
  {
    label: { type: String, required: true },
    at: { type: Date, required: true, default: Date.now },
    done: { type: Boolean, default: false },
  },
  { _id: false },
);

const orderCouponSchema = new Schema<IOrderCoupon>(
  {
    code: { type: String, required: true, uppercase: true },
    discount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true },
    customer: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    email: { type: String, required: true, maxlength: 254 },
    region: { type: String, enum: [...REGIONS], default: "North America" },
    warehouse: { type: String, enum: [...WAREHOUSES], default: "Rotterdam DC" },
    items: { type: [orderLineItemSchema], default: [] },
    amounts: {
      subtotal: { type: Number, required: true, min: 0 },
      discount: { type: Number, default: 0, min: 0 },
      shipping: { type: Number, default: 0, min: 0 },
      tax: { type: Number, default: 0, min: 0 },
      total: { type: Number, required: true, min: 0 },
    },
    payment: {
      method: { type: String, enum: [...PAYMENT_METHODS], required: true },
      status: { type: String, enum: [...PAYMENT_STATUSES], default: "Pending" },
      provider: { type: String, enum: [...PAYMENT_PROVIDERS] },
      transactionId: { type: String },
      providerTransactionId: { type: String },
      amount: { type: Number, min: 0 },
      currency: { type: String, default: "USD" },
      initiatedAt: { type: Date },
      paidAt: { type: Date },
      failureReason: { type: String },
      metadata: { type: Schema.Types.Mixed, default: {} },
    },
    status: { type: String, enum: [...ORDER_STATUSES], default: "Pending", index: true },
    addresses: {
      shipping: { type: orderAddressSchema, default: null },
      billing: { type: orderAddressSchema, default: null },
    },
    timeline: { type: [orderTimelineEntrySchema], default: [] },
    coupon: { type: orderCouponSchema, default: null },
    notes: { type: String, maxlength: 1000 },
    idempotencyKey: { type: String, trim: true, maxlength: 200 },
    idempotencyHash: { type: String, maxlength: 128 },
    expiresAt: { type: Date },
    refund: {
      amount: { type: Number, min: 0 },
      status: {
        type: String,
        enum: ["PENDING", "SUCCESS", "FAILED", "UNSUPPORTED"],
      },
      providerRef: { type: String },
      initiatedAt: { type: Date },
      reason: { type: String, maxlength: 500 },
    },
  },
  { timestamps: true, versionKey: false },
);

orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });
// Per-customer idempotency: a second order with the same key must be impossible
// even under concurrent requests (Phase 16B). Partial so null keys never collide.
orderSchema.index(
  { customer: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
);

export type OrderDoc = HydratedDocument<IOrder>;

export const OrderModel = model<IOrder>("Order", orderSchema);

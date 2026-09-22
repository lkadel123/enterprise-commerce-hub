import type { OrderDto } from "../orders/order.types.js";
import type { PaymentMethod } from "../orders/order.model.js";

/**
 * A single line item the customer is requesting to order.
 *
 * NOTE: only the product ID and quantity are accepted. Price, sku, name, and
 * totals are resolved server-side by the authoritative `orderService.create`
 * from the live Product/Inventory records — never from the client.
 */
export interface CustomerOrderItemInput {
  productId: string;
  quantity: number;
}

/**
 * Customer-facing checkout input.
 *
 * Deliberately mirrors the existing `OrderAddressInput` shape consumed by
 * `orderService.create`. No financial fields (price, subtotal, shipping, tax,
 * total), no `customerId`, no order-number/payment-status control are exposed.
 */
export interface CreateCustomerOrderInput {
  /** Line items. Optional — when omitted the server cart is checked out. */
  items?: CustomerOrderItemInput[];
  shippingAddress?: CustomerOrderAddressInput;
  billingAddress?: CustomerOrderAddressInput;
  paymentMethod?: PaymentMethod;
  /**
   * Optional gateway hint for the post-order payment flow ("CYBERSOURCE" |
   * "FONEPAY"). Advisory only — stored in `payment.metadata.gatewayChoice`;
   * the authoritative gateway is chosen at payment initiation and re-validated
   * by the backend. Not a financial field.
   */
  paymentGateway?: string;
  couponCode?: string;
  notes?: string;
  /**
   * Phase 16B: opaque idempotency key (Idempotency-Key header). Scoped to the
   * authenticated customer at the service layer; never client-scoped.
   */
  idempotencyKey?: string;
}

export interface CustomerOrderAddressInput {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
}

export interface CustomerOrderListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  sort?: string;
  from?: string;
  to?: string;
}

/** Customer-safe order tracking projection. */
export interface CustomerTrackingDto {
  orderId: string;
  orderNumber: string;
  currentStatus: string;
  timeline: { label: string; at: string; done: boolean }[];
}

export type { OrderDto };

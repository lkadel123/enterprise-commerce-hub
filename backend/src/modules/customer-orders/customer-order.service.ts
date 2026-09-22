import { Types } from "mongoose";
import { createHash } from "node:crypto";
import { badRequest, notFound, unauthorized } from "../../utils/ApiError.js";
import { CustomerAccountModel } from "../customer-auth/customerAccount.model.js";
import { customerRepository } from "../customers/customer.repository.js";
import { cartService } from "../cart/cart.service.js";
import { cartRepository } from "../cart/cart.repository.js";
import { orderService } from "../orders/order.service.js";
import { toOrderDto } from "../orders/order.service.js";
import type { OrderDto } from "../orders/order.types.js";
import { customerOrderRepository } from "./customer-order.repository.js";
import type {
  CreateCustomerOrderInput,
  CustomerOrderItemInput,
  CustomerOrderListParams,
  CustomerTrackingDto,
} from "./customer-order.types.js";
import { notificationService } from "../notifications/notification.service.js";
import { notifyCustomerByCrmCustomerId } from "../notifications/lifecycle-notify.js";
import { logger } from "../../utils/logger.js";

/**
 * Phase 16C: soft expiry deadline (minutes) for unpaid Pending orders.
 * Configurable via ORDER_EXPIRY_MINUTES; default 120 minutes.
 */
const ORDER_EXPIRY_MINUTES =
  Number.parseInt(process.env.ORDER_EXPIRY_MINUTES ?? "", 10) > 0
    ? Number.parseInt(process.env.ORDER_EXPIRY_MINUTES ?? "", 10)
    : 120;

/**
 * Canonical fingerprint of the create payload (Phase 16B). Detects "same
 * idempotency key, materially different body" so a reused key cannot silently
 * return a different order. Financial values are server-derived, so only the
 * client-authored selection fields participate.
 */
function fingerprintFor(input: CreateCustomerOrderInput): string {
  const canonical = {
    billingAddress: input.billingAddress ?? null,
    couponCode: input.couponCode ?? null,
    items: (input.items ?? []).map((i) => ({ productId: i.productId, quantity: i.quantity })),
    notes: input.notes ?? null,
    paymentGateway: input.paymentGateway ?? null,
    paymentMethod: input.paymentMethod ?? null,
    shippingAddress: input.shippingAddress ?? null,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * Resolve the authenticated CustomerAccount to its linked CRM `Customer`
 * (the owner key used by the `Order` model), creating and linking the CRM
 * Customer on first use.
 *
 * Idempotent and additive:
 *  - If the account is already linked, the existing CRM Customer is returned.
 *  - If the account.email already has a CRM Customer, that record is reused
 *    (prevents duplicates) and linked.
 *  - Otherwise a new CRM Customer is created and linked.
 *
 * Identity always comes from the authenticated account â€” never from a client
 * supplied id.
 */
export async function ensureCrmCustomer(customerAccountId: string): Promise<string> {
  const account = await CustomerAccountModel.findById(customerAccountId).lean().exec();
  if (!account) {
    throw unauthorized("Customer account not found.");
  }
  if (account.customer) {
    return account.customer.toString();
  }

  // Reuse an existing CRM Customer for the same email to avoid duplicates.
  const existing = await customerRepository.findByEmail(account.email);
  let crmCustomerId: string;
  if (existing) {
    crmCustomerId = existing._id.toString();
  } else {
    const created = await customerRepository.create({
      name: account.name,
      email: account.email,
      group: "Retail",
      status: "Active",
    });
    crmCustomerId = created._id.toString();
  }

  // Link the CRM Customer and return it. Safe if called more than once.
  await CustomerAccountModel.updateOne(
    { _id: account._id },
    { $set: { customer: new Types.ObjectId(crmCustomerId) } },
  ).exec();

  return crmCustomerId;
}

export const customerOrderService = {
  /**
   * Create a customer order by reusing the authoritative `orderService.create`
   * (server-side pricing, product validation, stock reservation, coupon
   * processing, totals, order number, timeline, rollback).
   *
   * Line items come from the request body when provided, otherwise from the
   * customer's server cart. The cart is cleared ONLY after the order is
   * successfully created.
   */
  async create(customerAccountId: string, input: CreateCustomerOrderInput): Promise<OrderDto> {
    const crmCustomerId = await ensureCrmCustomer(customerAccountId);

    const items =
      input.items && input.items.length > 0
        ? input.items
        : await this.resolveCartItems(customerAccountId);

    const order = await orderService.create({
      customerId: crmCustomerId,
      items: items.map((i) => ({ productId: i.productId, qty: i.quantity })),
      paymentMethod: input.paymentMethod,
      paymentGateway: input.paymentGateway,
      couponCode: input.couponCode,
      notes: input.notes,
      shippingAddress: input.shippingAddress,
      billingAddress: input.billingAddress,
      // Phase 16B: opaque, customer-scoped idempotency key (from the
      // Idempotency-Key header) + payload fingerprint for reuse detection.
      idempotencyKey: input.idempotencyKey,
      idempotencyFingerprint: input.idempotencyKey ? fingerprintFor(input) : undefined,
      // Phase 16C: soft expiry deadline for unpaid orders (configurable).
      expiresAt: new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60_000),
    });

    // Phase 16D: notify the customer their order was created (best-effort).
    try {
      await notifyCustomerByCrmCustomerId(
        crmCustomerId,
        "order_created",
        `Order #${order.orderNumber} placed`,
        {
          entityType: "order",
          entityId: order.id,
          actionUrl: `/account/orders/${order.id}`,
          metadata: { orderId: order.id, total: order.amounts.total },
        },
      );
    } catch (notifyError) {
      /* non-fatal */ logger.warn({ orderId: order.id, error: notifyError }, "order_created notification failed");
    }

    // Notify customer of coupon redemption (non-blocking, best-effort)
    // Coupon is redeemed at order creation if a couponCode was provided
    if (input.couponCode) {
      try {
        await notificationService.notifyCustomer(
          customerAccountId,
          "coupon_redeemed",
          `Coupon ${input.couponCode} redeemed on order #${order.orderNumber}`,
          {
            entityType: "coupon",
            entityId: input.couponCode,
            actionUrl: `/account/coupons`,
            metadata: { couponCode: input.couponCode, orderId: order.id },
          },
        );
      } catch (notifyError) {
        /* non-fatal */ logger.error(
          { crmCustomerId, couponCode: input.couponCode, orderId: order.id, error: notifyError },
          "Failed to create coupon redemption notification",
        );
      }
    }

    // Clear the cart only after a successful order (never before).
    if (!input.items || input.items.length === 0) {
      await cartRepository.clearCart(customerAccountId);
    }

    return order;
  },

  async list(customerAccountId: string, params: CustomerOrderListParams) {
    const crmCustomerId = await ensureCrmCustomer(customerAccountId);
    const { items, meta } = await customerOrderRepository.listByCustomer(crmCustomerId, params);
    return { items: items.map((order) => toOrderDto(order)), meta };
  },

  async getById(customerAccountId: string, orderId: string): Promise<OrderDto> {
    const crmCustomerId = await ensureCrmCustomer(customerAccountId);
    const order = await customerOrderRepository.findByIdForCustomer(orderId, crmCustomerId);
    if (!order) throw notFound("Order not found.");
    return toOrderDto(order);
  },

  async getTracking(customerAccountId: string, orderId: string): Promise<CustomerTrackingDto> {
    const crmCustomerId = await ensureCrmCustomer(customerAccountId);
    const order = await customerOrderRepository.findByIdForCustomer(orderId, crmCustomerId);
    if (!order) throw notFound("Order not found.");

    return {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      currentStatus: order.status,
      timeline: order.timeline.map((entry) => ({
        label: entry.label,
        at: new Date(entry.at).toISOString(),
        done: entry.done,
      })),
    };
  },

  /** Pull line items from the customer's server cart (productId + quantity only). */
  async resolveCartItems(customerAccountId: string): Promise<CustomerOrderItemInput[]> {
    const cart = await cartService.getCart(customerAccountId);
    if (!cart.items || cart.items.length === 0) {
      throw badRequest("Your cart is empty. Add items before checking out.");
    }
    // Only product id + quantity are forwarded; prices/names are resolved by
    // orderService.create from authoritative Product/Inventory data.
    return cart.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));
  },
};

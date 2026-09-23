import { badRequest, notFound, serviceUnavailable } from "../../utils/ApiError.js";
import { isDuplicateKeyError } from "../../utils/duplicateKey.js";
import { logger } from "../../utils/logger.js";
import { couponRepository } from "../coupons/coupon.repository.js";
import { couponRedemptionRepository } from "../coupons/coupon-redemption.repository.js";
import { customerRepository } from "../customers/customer.repository.js";
import { inventoryRepository } from "../inventory/inventory.repository.js";
import { productRepository } from "../products/product.repository.js";
import { notifyCustomerByCrmCustomerId } from "../notifications/lifecycle-notify.js";
import { getPaymentProvider } from "../payments/payment.providers.js";
import { orderRepository, type OrderListParams } from "./order.repository.js";
import type { IOrder, OrderStatus } from "./order.model.js";
import type {
  CreateOrderInput,
  OrderDto,
  OrderRecord,
  RefundOrderInput,
  SetOrderPaymentInput,
  SetOrderStatusInput,
} from "./order.types.js";

const DEFAULT_SHIPPING_FEE = 12.5;
const TAX_RATE = 0.075;
const DEFAULT_WAREHOUSE = "Rotterdam DC";

const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  Pending: ["Processing", "Cancelled", "Expired"],
  Processing: ["Shipped", "Cancelled"],
  Shipped: ["Delivered", "Refunded"],
  Delivered: ["Refunded"],
  Cancelled: [],
  Refunded: [],
  Expired: [],
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Releases any reservations held against an order back into available stock. */
async function releaseReservations(order: OrderRecord): Promise<void> {
  const warehouse = order.warehouse ?? DEFAULT_WAREHOUSE;
  for (const item of order.items) {
    await inventoryRepository.releaseReserved(item.product.toString(), warehouse, item.qty);
  }
}

/** Converts a populated order document to its public DTO shape. */
export function toOrderDto(order: OrderRecord): OrderDto {
  return {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    customer: order.customer
      ? {
          id: order.customer._id.toString(),
          name: order.customer.name,
          email: order.customer.email,
        }
      : null,
    email: order.email,
    region: order.region,
    warehouse: order.warehouse ?? DEFAULT_WAREHOUSE,
    items: order.items.map((item) => ({
      productId: item.product.toString(),
      sku: item.sku,
      name: item.name,
      qty: item.qty,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
    amounts: order.amounts,
    payment: order.payment,
    status: order.status,
    addresses: order.addresses ?? { shipping: null, billing: null },
    timeline: order.timeline.map((entry) => ({
      label: entry.label,
      at: new Date(entry.at).toISOString(),
      done: entry.done,
    })),
    coupon: order.coupon ?? null,
    notes: order.notes ?? null,
    expiresAt: order.expiresAt ? new Date(order.expiresAt).toISOString() : null,
    refund: order.refund ?? null,
    createdAt: new Date(order.createdAt).toISOString(),
    updatedAt: new Date(order.updatedAt).toISOString(),
  };
}

/** Outcome of a gateway refund request (Phase 16E). */
type GatewayRefundOutcome = {
  status: "SUCCESS" | "PENDING" | "FAILED" | "UNSUPPORTED";
  providerRef?: string;
};

/**
 * Requests a refund through the payment provider (Phase 16E).
 *
 * - No gateway provider/transaction reference, or a provider without refund
 *   support (all built-in providers today) â†’ "UNSUPPORTED": the caller performs
 *   the documented status-only refund. Real gateway refund support is NOT
 *   claimed without provider credentials.
 * - "SUCCESS" carries the provider refund reference; "FAILED" is retryable;
 *   the order is only marked Refunded after SUCCESS/UNSUPPORTED.
 */
async function requestGatewayRefund(
  order: OrderRecord,
  amount: number,
): Promise<GatewayRefundOutcome> {
  const providerKey = order.payment.provider;
  const providerTransactionId = order.payment.providerTransactionId;
  if (!providerKey || !providerTransactionId) return { status: "UNSUPPORTED" };

  let provider: ReturnType<typeof getPaymentProvider>;
  try {
    provider = getPaymentProvider(providerKey);
  } catch {
    return { status: "UNSUPPORTED" };
  }
  if (provider.refundCapability() === "UNSUPPORTED" || !provider.refund) {
    return { status: "UNSUPPORTED" };
  }

  try {
    const outcome = await provider.refund(providerTransactionId, amount);
    const status: GatewayRefundOutcome["status"] =
      outcome.status === "SUCCESS"
        ? "SUCCESS"
        : outcome.status === "PENDING"
          ? "PENDING"
          : "FAILED";
    return { status, providerRef: outcome.providerRef };
  } catch (error) {
    logger.warn(
      { orderId: order._id.toString(), provider: providerKey, error },
      "Gateway refund request failed",
    );
    return { status: "FAILED" };
  }
}

export const orderService = {
  async list(params: OrderListParams) {
    const { items, meta } = await orderRepository.list(params);
    return { items: items.map((order) => toOrderDto(order)), meta };
  },

  async getById(id: string): Promise<OrderDto> {
    const order = await orderRepository.findByIdPopulated(id);
    if (!order) throw notFound("Order not found.");
    return toOrderDto(order);
  },

  async create(input: CreateOrderInput): Promise<OrderDto> {
    const customer = await customerRepository.findById(input.customerId);
    if (!customer) throw notFound("Customer not found.");

    // Phase 16B: idempotency pre-check. If an order already exists for this
    // (customer, idempotencyKey) pair, return it instead of creating a duplicate.
    if (input.idempotencyKey) {
      const existing = await orderRepository.findByIdempotencyKey(
        customer._id.toString(),
        input.idempotencyKey,
      );
      if (existing) {
        // Same key, different payload â†’ reject (key reuse attack).
        if (
          input.idempotencyFingerprint &&
          existing.idempotencyHash !== input.idempotencyFingerprint
        ) {
          throw badRequest("Idempotency key already used for a different order payload.");
        }
        return toOrderDto(existing);
      }
    }

    const warehouse = input.warehouse ?? DEFAULT_WAREHOUSE;

    const productIds = input.items.map((item) => item.productId);
    const products = await productRepository.findByIds(productIds);
    const productMap = new Map(products.map((product) => [product._id.toString(), product]));

    const items: IOrder["items"] = input.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) throw badRequest(`Product ${item.productId} not found.`);
      if (product.status !== "Active") {
        throw badRequest(`Product "${product.name}" is not available for ordering.`);
      }
      const lineTotal = round2(product.price * item.qty);
      return {
        product: product._id,
        sku: product.sku,
        name: product.name,
        qty: item.qty,
        unitPrice: round2(product.price),
        lineTotal,
      };
    });

    const subtotal = round2(items.reduce((sum, item) => sum + item.lineTotal, 0));

    let coupon: import("../coupons/coupon.model.js").ICoupon | null = null;
    let discount = 0;
    let freeShipping = false;
    let appliedCoupon: IOrder["coupon"] = null;
    let couponCustomerReserved = false;
    let couponUsageReserved = false;

    if (input.couponCode) {
      coupon = await couponRepository.findByCode(input.couponCode);
      if (!coupon) throw badRequest("Coupon code not found.");
      const now = Date.now();
      if (new Date(coupon.startAt).getTime() > now || new Date(coupon.endAt).getTime() < now) {
        throw badRequest("Coupon is not valid for the current date.");
      }
      if (subtotal < coupon.minOrder) {
        throw badRequest(`Minimum order amount for this coupon is ${coupon.minOrder}.`);
      }
      if (coupon.type === "Percentage") {
        const cap = coupon.maxDiscount > 0 ? coupon.maxDiscount : Number.POSITIVE_INFINITY;
        discount = round2(Math.min((subtotal * coupon.value) / 100, cap));
      } else if (coupon.type === "Fixed") {
        discount = round2(Math.min(coupon.value, subtotal));
      } else {
        freeShipping = true;
      }
      appliedCoupon = { code: coupon.code, discount };

      // Phase 7: atomically reserve per-customer and global coupon usage
      // BEFORE stock reservation, so every failure path can release exactly
      // what it reserved (no double-count, no concurrency over-redemption).
      couponCustomerReserved = await couponRedemptionRepository.reserveForCustomer(
        coupon._id.toString(),
        customer._id.toString(),
        coupon.perCustomerLimit,
      );
      if (!couponCustomerReserved) {
        coupon = null;
        throw badRequest("Coupon per-customer usage limit has been reached.");
      }
      couponUsageReserved = await couponRepository.reserveUsage(coupon._id.toString());
      if (!couponUsageReserved) {
        await couponRedemptionRepository.releaseForCustomer(
          coupon._id.toString(),
          customer._id.toString(),
        );
        couponCustomerReserved = false;
        coupon = null;
        throw badRequest("Coupon usage limit has been reached.");
      }
    }

    // Reserve stock atomically for every line. If any line cannot be satisfied,
    // release the reservations already made and abort â€” this prevents both
    // overselling and partially-reserved orders.
    let reservedCount = 0;
    for (const item of items) {
      const record = await inventoryRepository.reserveStock(
        item.product.toString(),
        warehouse,
        item.qty,
      );
      if (!record) {
        for (const rollback of items.slice(0, reservedCount)) {
          await inventoryRepository.releaseReserved(
            rollback.product.toString(),
            warehouse,
            rollback.qty,
          );
        }
        // Release the coupon reservations too (Phase 7 rollback contract).
        if (coupon) {
          if (couponCustomerReserved) {
            await couponRedemptionRepository.releaseForCustomer(
              coupon._id.toString(),
              customer._id.toString(),
            );
          }
          if (couponUsageReserved) {
            await couponRepository.decrementUsed(coupon._id.toString());
          }
        }
        throw badRequest(
          `Insufficient stock for "${item.name}" (SKU ${item.sku}) in ${warehouse}.`,
        );
      }
      reservedCount += 1;
    }

    const shipping = input.shippingFee ?? (freeShipping ? 0 : DEFAULT_SHIPPING_FEE);
    const tax = round2((subtotal - discount) * TAX_RATE);
    const total = round2(subtotal - discount + shipping + tax);

    const orderNumber = await orderRepository.nextOrderNumber();

    let order: IOrder;
    try {
      order = await orderRepository.create({
        orderNumber,
        customer: customer._id,
        email: customer.email,
        region: input.region ?? "North America",
        warehouse,
        items,
        amounts: { subtotal, discount, shipping, tax, total },
        payment: {
          method: (input.paymentMethod ?? "Credit Card") as IOrder["payment"]["method"],
          status: "Pending",
          ...(input.paymentGateway ? { metadata: { gatewayChoice: input.paymentGateway } } : {}),
        },
        status: "Pending",
        addresses: {
          shipping: input.shippingAddress ?? null,
          billing: input.billingAddress ?? null,
        },
        timeline: [{ label: "Order placed", at: new Date(), done: true }],
        coupon: appliedCoupon,
        notes: input.notes,
        // Phase 16B/C: idempotency key + fingerprint + soft expiry deadline.
        idempotencyKey: input.idempotencyKey,
        idempotencyHash: input.idempotencyFingerprint,
        expiresAt: input.expiresAt,
      });
    } catch (error) {
      // Compensating rollback: order record failed, release THIS request's
      // reservations (stock + coupon) so nothing is leaked by a failed create.
      for (const item of items) {
        await inventoryRepository.releaseReserved(item.product.toString(), warehouse, item.qty);
      }
      if (coupon) {
        if (couponCustomerReserved) {
          await couponRedemptionRepository.releaseForCustomer(
            coupon._id.toString(),
            customer._id.toString(),
          );
        }
        if (couponUsageReserved) {
          await couponRepository.decrementUsed(coupon._id.toString());
        }
      }

      // Phase 16B: concurrent duplicate create â€” the per-(customer, key) unique
      // index let the other request win. Roll back above undid OUR reserve, so
      // returning the winner's order is consistent and idempotent.
      if (input.idempotencyKey && isDuplicateKeyError(error)) {
        const winner = await orderRepository.findByIdempotencyKey(
          customer._id.toString(),
          input.idempotencyKey,
        );
        if (winner) {
          // Same key with a materially different payload must not silently
          // replay a different order, exactly like the sequential pre-check.
          if (
            input.idempotencyFingerprint &&
            winner.idempotencyHash !== input.idempotencyFingerprint
          ) {
            throw badRequest("Idempotency key already used for a different order payload.");
          }
          return toOrderDto(winner);
        }
      }
      throw error;
    }

    return orderService.getById(order._id.toString());
  },

  /**
   * Expires a single unpaid Pending order (Phase 16C). Releases reservations,
   * decrements coupon usage, and transitions the order to "Expired". Idempotent:
   * only acts on orders whose deadline has passed.
   */
  async expireOrder(id: string): Promise<OrderDto | null> {
    const order = await orderRepository.findByIdPopulated(id);
    if (!order) return null;
    if (order.status !== "Pending") return null;
    if (!order.expiresAt || new Date(order.expiresAt).getTime() > Date.now()) {
      return null;
    }
    const updated = await orderRepository.expirePendingById(id, new Date(order.expiresAt));
    if (!updated) return null;
    await releaseReservations(updated);
    if (updated.coupon?.code) {
      try {
        const coupon = await couponRepository.findByCode(updated.coupon.code);
        if (coupon) await couponRepository.decrementUsed(coupon._id.toString());
      } catch {
        logger.warn({ coupon: updated.coupon.code }, "Failed to decrement coupon on expiry");
      }
    }
    // Phase 16D: notify the owning customer (de-duplicated, best-effort).
    await notifyCustomerByCrmCustomerId(
      updated.customer?._id?.toString(),
      "order_expired",
      `Order #${updated.orderNumber} expired`,
      {
        message:
          "Payment was not completed in time; the order has expired and reserved stock was released.",
        entityType: "order",
        entityId: updated._id.toString(),
        actionUrl: `/account/orders/${updated._id.toString()}`,
        metadata: { orderId: updated._id.toString(), status: "Expired" },
      },
    );
    return toOrderDto(updated);
  },

  /**
   * Expires all unpaid Pending orders whose deadline has passed (Phase 16C).
   * Returns the list of expired order ids. Callable from cron/scheduler/worker
   * or manually by operations (see docs/PRODUCTION_OPERATIONS.md).
   */
  async expirePendingOrders(now: Date = new Date()): Promise<{ expired: string[] }> {
    const candidates = await orderRepository.listPendingToExpire(now);
    const expired: string[] = [];
    for (const order of candidates) {
      const result = await orderService.expireOrder(order._id.toString());
      if (result) expired.push(result.id);
    }
    return { expired };
  },

  async setStatus(id: string, input: SetOrderStatusInput): Promise<OrderDto> {
    const order = await orderRepository.findByIdPopulated(id);
    if (!order) throw notFound("Order not found.");

    // F-03: terminal, payment-coupled transitions must never be reachable through
    // the generic status endpoint.
    //
    // Cancelled → route through the guarded cancellation workflow. cancel()
    // rejects Paid orders (money must move via the refund flow), uses the atomic
    // cancelIfCancellable guard, releases reserved inventory and decrements coupon
    // usage. A plain status write previously bypassed all of that.
    if (input.status === "Cancelled") {
      return orderService.cancel(id);
    }

    // Refunded → only the refund workflow may produce this state (provider refund
    // + refund record). A direct status write would be a fake refund.
    if (input.status === "Refunded") {
      throw badRequest(
        'Orders cannot be directly transitioned to "Refunded" via a status update. Use the refund workflow.',
      );
    }

    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed.includes(input.status)) {
      throw badRequest(`Cannot transition order from "${order.status}" to "${input.status}".`);
    }

    await orderRepository.updateById(
      id,
      { status: input.status },
      { label: input.status, at: new Date(), done: true },
    );

    // Phase 16I: on Delivered, finalize stock â€” the reservation becomes a
    // permanent sale (stock and reserved both decrease exactly once; the
    // transition table guarantees Delivered is reached only from Shipped).
    if (input.status === "Delivered") {
      const warehouse = order.warehouse ?? DEFAULT_WAREHOUSE;
      for (const item of order.items) {
        await inventoryRepository.finalizeReserved(item.product.toString(), warehouse, item.qty);
      }
    }

    // Phase 16D: customer lifecycle notification per fulfilment transition.
    const notificationType =
      input.status === "Processing"
        ? "order_status_changed"
        : input.status === "Shipped"
          ? "order_status_changed"
          : input.status === "Delivered"
            ? "order_status_changed"
            : null;
    if (notificationType) {
      await notifyCustomerByCrmCustomerId(
        order.customer?._id?.toString(),
        notificationType,
        `Order #${order.orderNumber} is now ${input.status}`,
        {
          entityType: "order",
          entityId: id,
          actionUrl: `/account/orders/${id}`,
          metadata: { orderId: id, status: input.status },
        },
      );
    }

    return orderService.getById(id);
  },

  async setPayment(id: string, input: SetOrderPaymentInput): Promise<OrderDto> {
    const order = await orderRepository.findByIdPopulated(id);
    if (!order) throw notFound("Order not found.");

    // Phase 16F: only unpaid Pending orders may receive a payment status update.
    // This prevents double-payment or payment on expired/cancelled orders.
    if (order.status !== "Pending") {
      throw badRequest(
        `Order "${order.status}" cannot receive a payment update. Only Pending orders can be paid.`,
      );
    }

    await orderRepository.updateById(
      id,
      {
        "payment.status": input.paymentStatus,
        ...(input.transactionId ? { "payment.transactionId": input.transactionId } : {}),
      },
      { label: `Payment ${input.paymentStatus}`, at: new Date(), done: true },
    );

    return orderService.getById(id);
  },

  async cancel(id: string, reason?: string): Promise<OrderDto> {
    const order = await orderRepository.findByIdPopulated(id);
    if (!order) throw notFound("Order not found.");

    if (order.status === "Cancelled") {
      // Idempotent repeat cancel: already terminal.
      return orderService.getById(id);
    }

    // Phase 16G: payment state governs the cancellation path. A Paid order can
    // never be silently cancelled â€” money must move back via the refund flow.
    if (order.payment.status === "Paid") {
      throw badRequest(
        "Order is paid; it cannot be cancelled without a refund. Use the refund flow.",
      );
    }

    if (!ALLOWED_TRANSITIONS[order.status].includes("Cancelled")) {
      throw badRequest(`Order "${order.status}" cannot be cancelled.`);
    }

    // Atomic guarded cancel: closes the cancel-vs-payment-verify race â€” if a
    // concurrent verification marked the payment Paid, this update matches
    // nothing and the order stays payable.
    const cancelled = await orderRepository.cancelIfCancellable(id, reason);
    if (!cancelled) {
      const current = await orderRepository.findByIdPopulated(id);
      if (current?.payment.status === "Paid") {
        throw badRequest(
          "Order is paid; it cannot be cancelled without a refund. Use the refund flow.",
        );
      }
      throw badRequest(`Order "${current?.status ?? order.status}" cannot be cancelled.`);
    }

    // Return reserved stock to the warehouse now that the order is cancelled.
    await releaseReservations(cancelled);

    // Decrement coupon usage so the code becomes usable again.
    if (cancelled.coupon?.code) {
      try {
        const coupon = await couponRepository.findByCode(cancelled.coupon.code);
        if (coupon) await couponRepository.decrementUsed(coupon._id.toString());
      } catch {
        logger.warn({ coupon: cancelled.coupon.code }, "Failed to decrement coupon on cancel");
      }
    }

    // Phase 16D: notify the owning customer (de-duplicated, best-effort).
    await notifyCustomerByCrmCustomerId(
      cancelled.customer?._id?.toString(),
      "order_cancelled",
      `Order #${cancelled.orderNumber} cancelled`,
      {
        message: reason ? `Your order was cancelled: ${reason}` : "Your order was cancelled.",
        entityType: "order",
        entityId: id,
        actionUrl: `/account/orders/${id}`,
        metadata: { orderId: id, status: "Cancelled" },
      },
    );

    return orderService.getById(id);
  },

  async refund(id: string, input: RefundOrderInput = {}): Promise<OrderDto> {
    const order = await orderRepository.findByIdPopulated(id);
    if (!order) throw notFound("Order not found.");

    // Idempotent: a successfully recorded refund is never executed twice
    // (checked before the status guard so a retried refund on an already
    // Refunded order returns the recorded outcome instead of an error).
    if (order.refund?.status === "SUCCESS") {
      return orderService.getById(id);
    }

    if (!["Shipped", "Delivered"].includes(order.status)) {
      throw badRequest(
        `Order "${order.status}" cannot be refunded. Only Shipped/Delivered orders can be refunded.`,
      );
    }

    // Phase 16A/G: money can only be refunded against a successful payment â€”
    // never create a "Refunded" state without one.
    if (order.payment.status !== "Paid") {
      throw badRequest(
        `Order payment is "${order.payment.status}"; only a Paid payment can be refunded.`,
      );
    }

    const paidAmount = round2(order.payment.amount ?? order.amounts.total);
    const refundAmount = round2(input.amount ?? paidAmount);
    if (!(refundAmount > 0) || refundAmount > paidAmount + 0.009) {
      throw badRequest(
        `Refund amount must be positive and cannot exceed the paid amount (${paidAmount}).`,
      );
    }

    // Record the intent first (PENDING) so failures are recoverable and
    // retries are visible; the gateway is never called inside a transaction.
    await orderRepository.updateById(id, {
      refund: {
        amount: refundAmount,
        status: "PENDING",
        initiatedAt: new Date(),
        reason: input.reason,
      },
    });

    const outcome = await requestGatewayRefund(order, refundAmount);

    if (outcome.status === "PENDING") {
      // Gateway accepted but has not confirmed â€” do NOT mark Refunded yet.
      await orderRepository.updateById(id, {
        refund: {
          amount: refundAmount,
          status: "PENDING",
          providerRef: outcome.providerRef,
          initiatedAt: new Date(),
          reason: input.reason,
        },
      });
      await notifyCustomerByCrmCustomerId(
        order.customer?._id?.toString(),
        "refund_initiated",
        `Refund initiated for order #${order.orderNumber}`,
        {
          entityType: "order",
          entityId: id,
          actionUrl: `/account/orders/${id}`,
          metadata: { orderId: id, amount: refundAmount },
        },
      );
      return orderService.getById(id);
    }

    if (outcome.status === "FAILED") {
      await orderRepository.updateById(id, {
        refund: {
          amount: refundAmount,
          status: "FAILED",
          initiatedAt: new Date(),
          reason: input.reason,
        },
      });
      throw serviceUnavailable(
        "Refund gateway request failed; no refund was applied. Retry later.",
      );
    }

    // SUCCESS (gateway confirmed) or UNSUPPORTED (documented status-only refund
    // for gateways without a refund API â€” see payment.provider.ts).
    await orderRepository.updateById(
      id,
      {
        status: "Refunded",
        "payment.status": "Refunded",
        refund: {
          amount: refundAmount,
          status: outcome.status === "SUCCESS" ? "SUCCESS" : "UNSUPPORTED",
          providerRef: outcome.providerRef,
          initiatedAt: new Date(),
          reason: input.reason,
        },
      },
      {
        label: input.reason ? `Refunded â€” ${input.reason}` : "Refunded",
        at: new Date(),
        done: true,
      },
    );

    // A refunded (previously shipped/delivered) order returns held stock.
    await releaseReservations(order);

    // Phase 16D: notify the owning customer (de-duplicated, best-effort).
    await notifyCustomerByCrmCustomerId(
      order.customer?._id?.toString(),
      "refund_completed",
      `Refund completed for order #${order.orderNumber}`,
      {
        message: `A refund of ${refundAmount} was processed.`,
        entityType: "order",
        entityId: id,
        actionUrl: `/account/orders/${id}`,
        metadata: { orderId: id, amount: refundAmount },
      },
    );

    return orderService.getById(id);
  },
};

export type { OrderRecord };

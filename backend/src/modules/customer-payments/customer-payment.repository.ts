import { customerOrderRepository } from "../customer-orders/customer-order.repository.js";
import type { OrderRecord } from "../orders/order.types.js";

/**
 * Data access for the customer-payment domain.
 *
 * Reuses the existing ownership-aware order query from the customer-orders
 * module. No new payment persistence model is introduced — order.payment.*
 * fields remain the single source of truth, so there is no duplicate payment
 * state to drift.
 */
export const customerPaymentRepository = {
  /**
   * Ownership-scoped order lookup. The CRM customer id is always resolved from
   * the authenticated session (never from request data), so a foreign order id
   * yields null (→ generic not-found), never another customer's order.
   */
  findByIdForCustomer(orderId: string, crmCustomerId: string): Promise<OrderRecord | null> {
    return customerOrderRepository.findByIdForCustomer(orderId, crmCustomerId);
  },
};

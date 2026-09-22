import { Types } from "mongoose";
import { paginationMeta, parsePagination, parseSort } from "../../utils/pagination.js";
import type { PaginationMeta } from "../../utils/ApiResponse.js";
import { OrderModel } from "../orders/order.model.js";
import type { OrderRecord } from "../orders/order.types.js";
import type { CustomerOrderListParams } from "./customer-order.types.js";

export interface CustomerOrderListResult {
  items: OrderRecord[];
  meta: PaginationMeta;
}

export const customerOrderRepository = {
  /**
   * Paginated, customer-scoped order history. The CRM customer id is always
   * supplied by the authenticated session (never from request data), so a
   * customer can only ever see their own orders.
   */
  async listByCustomer(
    crmCustomerId: string,
    params: CustomerOrderListParams,
  ): Promise<CustomerOrderListResult> {
    const { page, pageSize, skip, limit } = parsePagination(params);

    const filter: Record<string, unknown> = { customer: new Types.ObjectId(crmCustomerId) };
    if (params.status) filter.status = params.status;
    if (params.from || params.to) {
      const created: Record<string, Date> = {};
      if (params.from) created.$gte = new Date(params.from);
      if (params.to) {
        const end = new Date(params.to);
        end.setHours(23, 59, 59, 999);
        created.$lte = end;
      }
      filter.createdAt = created;
    }

    const sort = parseSort(params.sort, ["createdAt", "orderNumber", "amounts.total", "status"]);
    const sortWithDefault = Object.keys(sort).length > 0 ? sort : { createdAt: -1 as const };

    const [items, total] = await Promise.all([
      OrderModel.find(filter)
        .sort(sortWithDefault)
        .skip(skip)
        .limit(limit)
        .populate("customer", "name email")
        .lean()
        .exec(),
      OrderModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items as unknown as OrderRecord[],
      meta: paginationMeta(total, page, pageSize),
    };
  },

  /**
   * Ownership-scoped detail lookup. The database query enforces that the
   * order belongs to the authenticated CRM customer — a foreign order id
   * yields null here (→ generic not-found), never another customer's order.
   */
  async findByIdForCustomer(orderId: string, crmCustomerId: string): Promise<OrderRecord | null> {
    return (await OrderModel.findOne({
      _id: new Types.ObjectId(orderId),
      customer: new Types.ObjectId(crmCustomerId),
    })
      .populate("customer", "name email")
      .lean()
      .exec()) as unknown as OrderRecord | null;
  },
};

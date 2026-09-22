import { conflict, notFound } from "../../utils/ApiError.js";
import { orderRepository } from "../orders/order.repository.js";
import { toOrderDto } from "../orders/order.service.js";
import { customerRepository, type CustomerListParams } from "./customer.repository.js";
import type { ICustomer } from "./customer.model.js";
import type {
  CreateCustomerInput,
  CustomerDetailDto,
  CustomerDto,
  UpdateCustomerInput,
} from "./customer.types.js";

function toDto(
  customer: ICustomer,
  stats: { orders: number; spent: number; lastOrder: Date | null },
): CustomerDto {
  const orders = stats.orders;
  return {
    id: customer._id.toString(),
    name: customer.name,
    email: customer.email,
    phone: customer.phone ?? null,
    group: customer.group,
    status: customer.status,
    city: customer.city ?? null,
    orders,
    spent: Math.round(stats.spent * 100) / 100,
    aov: orders > 0 ? Math.round((stats.spent / orders) * 100) / 100 : 0,
    lastOrder: stats.lastOrder ? new Date(stats.lastOrder).toISOString() : null,
    joinedAt: new Date(customer.joinedAt).toISOString(),
    createdAt: new Date(customer.createdAt).toISOString(),
  };
}

export const customerService = {
  async list(params: CustomerListParams) {
    const { items, meta } = await customerRepository.list(params);
    const stats = await orderRepository.statsForCustomers(items.map((item) => item._id.toString()));

    return {
      items: items.map((customer) => {
        const row = stats.get(customer._id.toString());
        return toDto(customer, {
          orders: row?.orders ?? 0,
          spent: row?.spent ?? 0,
          lastOrder: row?.lastOrder ?? null,
        });
      }),
      meta,
    };
  },

  async getById(id: string): Promise<CustomerDetailDto> {
    const customer = await customerRepository.findById(id);
    if (!customer) throw notFound("Customer not found.");

    const stats = await orderRepository.statsForCustomers([id]);
    const row = stats.get(id);
    const recentOrders = await orderRepository.recentOrdersForCustomer(id, 10);

    return {
      ...toDto(customer, {
        orders: row?.orders ?? 0,
        spent: row?.spent ?? 0,
        lastOrder: row?.lastOrder ?? null,
      }),
      recentOrders: recentOrders.map((order) => toOrderDto(order)),
    };
  },

  async create(input: CreateCustomerInput): Promise<CustomerDto> {
    const existing = await customerRepository.findByEmail(input.email);
    if (existing) throw conflict("A customer with this email already exists.");

    const customer = await customerRepository.create(input);
    return toDto(customer, { orders: 0, spent: 0, lastOrder: null });
  },

  async update(id: string, input: UpdateCustomerInput): Promise<CustomerDto> {
    const customer = await customerRepository.updateById(id, input);
    if (!customer) throw notFound("Customer not found.");

    const stats = await orderRepository.statsForCustomers([id]);
    const row = stats.get(id);
    return toDto(customer, {
      orders: row?.orders ?? 0,
      spent: row?.spent ?? 0,
      lastOrder: row?.lastOrder ?? null,
    });
  },

  async remove(id: string): Promise<void> {
    const customer = await customerRepository.findById(id);
    if (!customer) throw notFound("Customer not found.");

    const stats = await orderRepository.statsForCustomers([id]);
    const row = stats.get(id);
    if ((row?.orders ?? 0) > 0) {
      throw conflict("Customer has order history and cannot be deleted.");
    }

    await customerRepository.deleteById(id);
  },
};

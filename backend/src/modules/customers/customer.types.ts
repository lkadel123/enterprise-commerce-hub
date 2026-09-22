import type { OrderDto } from "../orders/order.types.js";
import type { CustomerGroup, CustomerStatus } from "./customer.model.js";

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

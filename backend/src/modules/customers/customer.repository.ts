import { paginationMeta, parsePagination, parseSort } from "../../utils/pagination.js";
import type { PaginationMeta } from "../../utils/ApiResponse.js";
import { CustomerModel, type ICustomer } from "./customer.model.js";
import type { CreateCustomerInput, UpdateCustomerInput } from "./customer.types.js";
import type { CustomerGroup, CustomerStatus } from "./customer.model.js";

export interface CustomerListParams {
  q?: string;
  group?: CustomerGroup;
  status?: CustomerStatus;
  page?: number;
  pageSize?: number;
  sort?: string;
}

export interface CustomerListResult {
  items: ICustomer[];
  meta: PaginationMeta;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const customerRepository = {
  async list(params: CustomerListParams): Promise<CustomerListResult> {
    const { page, pageSize, skip, limit } = parsePagination(params);

    const filter: Record<string, unknown> = {};
    if (params.q) {
      const regex = new RegExp(escapeRegExp(params.q), "i");
      filter.$or = [{ name: { $regex: regex } }, { email: { $regex: regex } }];
    }
    if (params.group) filter.group = params.group;
    if (params.status) filter.status = params.status;

    const sort = parseSort(params.sort, [
      "name",
      "email",
      "group",
      "status",
      "joinedAt",
      "createdAt",
    ]);
    const sortWithDefault = Object.keys(sort).length > 0 ? sort : { joinedAt: -1 as const };

    const [items, total] = await Promise.all([
      CustomerModel.find(filter).sort(sortWithDefault).skip(skip).limit(limit).lean().exec(),
      CustomerModel.countDocuments(filter).exec(),
    ]);

    return { items: items as unknown as ICustomer[], meta: paginationMeta(total, page, pageSize) };
  },

  async findById(id: string): Promise<ICustomer | null> {
    return (await CustomerModel.findById(id).lean().exec()) as unknown as ICustomer | null;
  },

  async findByEmail(email: string): Promise<ICustomer | null> {
    return (await CustomerModel.findOne({ email: email.toLowerCase() })
      .lean()
      .exec()) as unknown as ICustomer | null;
  },

  async create(data: CreateCustomerInput): Promise<ICustomer> {
    const doc = await CustomerModel.create(data);
    return doc.toObject() as unknown as ICustomer;
  },

  async updateById(id: string, patch: UpdateCustomerInput): Promise<ICustomer | null> {
    return (await CustomerModel.findByIdAndUpdate(id, patch, { new: true, runValidators: true })
      .lean()
      .exec()) as unknown as ICustomer | null;
  },

  async deleteById(id: string): Promise<ICustomer | null> {
    return (await CustomerModel.findByIdAndDelete(id).lean().exec()) as unknown as ICustomer | null;
  },
};

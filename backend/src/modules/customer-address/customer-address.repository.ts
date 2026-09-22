import { paginationMeta, parsePagination, parseSort } from "../../utils/pagination.js";
import type { PaginationMeta } from "../../utils/ApiResponse.js";
import { CustomerAddressModel, type ICustomerAddress } from "./customer-address.model.js";
import type {
  CreateCustomerAddressInput,
  UpdateCustomerAddressInput,
} from "./customer-address.types.js";
import type { Types } from "mongoose";

export interface AddressListParams {
  page?: number;
  pageSize?: number;
  sort?: string;
}

export interface AddressListResult {
  items: ICustomerAddress[];
  meta: PaginationMeta;
}

export const customerAddressRepository = {
  async list(customerAccountId: string, params: AddressListParams): Promise<AddressListResult> {
    const { page, pageSize, skip, limit } = parsePagination(params);

    const filter: Record<string, unknown> = { customerAccountId };

    const sortFields = ["label", "isDefault", "createdAt"];
    const sort = parseSort(params.sort, sortFields);
    const sortWithDefault = Object.keys(sort).length > 0 ? sort : { createdAt: -1 as const };

    const [items, total] = await Promise.all([
      CustomerAddressModel.find(filter).sort(sortWithDefault).skip(skip).limit(limit).lean().exec(),
      CustomerAddressModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items as unknown as ICustomerAddress[],
      meta: paginationMeta(total, page, pageSize),
    };
  },

  async findById(id: string, customerAccountId: string): Promise<ICustomerAddress | null> {
    return (await CustomerAddressModel.findOne({
      _id: id,
      customerAccountId,
    })
      .lean()
      .exec()) as unknown as ICustomerAddress | null;
  },

  async create(
    customerAccountId: string,
    data: CreateCustomerAddressInput,
  ): Promise<ICustomerAddress> {
    const doc = await CustomerAddressModel.create({
      customerAccountId: customerAccountId as unknown as Types.ObjectId,
      ...data,
    });
    return doc.toObject() as unknown as ICustomerAddress;
  },

  async updateById(
    id: string,
    customerAccountId: string,
    patch: UpdateCustomerAddressInput,
  ): Promise<ICustomerAddress | null> {
    return (await CustomerAddressModel.findOneAndUpdate({ _id: id, customerAccountId }, patch, {
      new: true,
      runValidators: true,
    })
      .lean()
      .exec()) as unknown as ICustomerAddress | null;
  },

  async deleteById(id: string, customerAccountId: string): Promise<boolean> {
    const result = await CustomerAddressModel.deleteOne({
      _id: id,
      customerAccountId,
    }).exec();
    return result.deletedCount > 0;
  },

  async countByCustomerAccountId(customerAccountId: string): Promise<number> {
    return CustomerAddressModel.countDocuments({ customerAccountId }).exec();
  },

  async findByIds(ids: string[]): Promise<ICustomerAddress[]> {
    if (ids.length === 0) return [];
    return (await CustomerAddressModel.find({ _id: { $in: ids } })
      .lean()
      .exec()) as unknown as ICustomerAddress[];
  },

  async setDefault(id: string, customerAccountId: string): Promise<void> {
    // Unset isDefault on all other addresses for this customer
    await CustomerAddressModel.updateMany(
      { customerAccountId, _id: { $ne: id } },
      { $set: { isDefault: false } },
    ).exec();
    // Set the specified address as default
    await CustomerAddressModel.updateOne(
      { _id: id, customerAccountId },
      { $set: { isDefault: true } },
    ).exec();
  },
};

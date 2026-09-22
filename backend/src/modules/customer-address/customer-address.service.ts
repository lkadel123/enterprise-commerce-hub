import { notFound } from "../../utils/ApiError.js";
import {
  customerAddressRepository,
  type AddressListParams,
} from "./customer-address.repository.js";
import { CustomerAddressModel } from "./customer-address.model.js";
import type {
  CustomerAddressDto,
  CreateCustomerAddressInput,
  UpdateCustomerAddressInput,
} from "./customer-address.types.js";
import type { ICustomerAddress } from "./customer-address.model.js";

function toDto(addr: ICustomerAddress): CustomerAddressDto {
  return {
    id: addr._id.toString(),
    label: addr.label,
    line1: addr.line1,
    line2: addr.line2 ?? null,
    city: addr.city,
    state: addr.state ?? null,
    postalCode: addr.postalCode,
    country: addr.country,
    isDefault: addr.isDefault,
    createdAt: new Date(addr.createdAt).toISOString(),
  };
}

export const customerAddressService = {
  async list(customerId: string, params: AddressListParams) {
    const { items, meta } = await customerAddressRepository.list(customerId, params);
    return { items: items.map((addr) => toDto(addr)), meta };
  },

  async getById(id: string, customerId: string): Promise<CustomerAddressDto> {
    const addr = await customerAddressRepository.findById(id, customerId);
    if (!addr) throw notFound("Address not found.");
    return toDto(addr);
  },

  async create(customerId: string, input: CreateCustomerAddressInput): Promise<CustomerAddressDto> {
    // If setting as default, unset other defaults first
    if (input.isDefault) {
      await CustomerAddressModel.updateMany(
        { customerAccountId: customerId, isDefault: true },
        { $set: { isDefault: false } },
      ).exec();
    }

    const addr = await customerAddressRepository.create(customerId, input);
    return toDto(addr);
  },

  async update(
    id: string,
    customerId: string,
    input: UpdateCustomerAddressInput,
  ): Promise<CustomerAddressDto> {
    const existing = await customerAddressRepository.findById(id, customerId);
    if (!existing) throw notFound("Address not found.");

    // If setting as default, unset other defaults first
    if (input.isDefault === true) {
      await CustomerAddressModel.updateMany(
        { customerAccountId: customerId, _id: { $ne: id }, isDefault: true },
        { $set: { isDefault: false } },
      ).exec();
    }

    const addr = await customerAddressRepository.updateById(id, customerId, input);
    if (!addr) throw notFound("Address not found.");
    return toDto(addr);
  },

  async remove(id: string, customerId: string): Promise<void> {
    const addr = await customerAddressRepository.findById(id, customerId);
    if (!addr) throw notFound("Address not found.");

    const wasDefault = addr.isDefault;

    await customerAddressRepository.deleteById(id, customerId);

    // If the deleted address was the default, set a new default
    if (wasDefault) {
      const remaining = await CustomerAddressModel.find({ customerAccountId: customerId })
        .sort({ createdAt: -1 })
        .limit(1)
        .lean()
        .exec();
      if (remaining.length > 0) {
        await CustomerAddressModel.updateOne(
          { _id: remaining[0]._id },
          { $set: { isDefault: true } },
        ).exec();
      }
    }
  },
};

import type { CustomerAccountStatus } from "../customer-auth/customerAccount.model.js";

export interface CustomerAddressDto {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: string;
}

export interface CreateCustomerAddressInput {
  label: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  isDefault?: boolean;
}

export interface UpdateCustomerAddressInput {
  label?: string;
  line1?: string;
  line2?: string | null;
  city?: string;
  state?: string | null;
  postalCode?: string;
  country?: string;
  isDefault?: boolean;
}

export type CustomerAddressOwner = {
  id: string;
  customerId: string | null;
};

export interface CustomerAddressOwnerStatus extends CustomerAddressOwner {
  status: CustomerAccountStatus;
}

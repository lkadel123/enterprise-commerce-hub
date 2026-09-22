import { apiFetch } from "./client";
import type {
  ApiEnvelope,
  CreateCustomerAddressInput,
  CustomerAddressDto,
  UpdateCustomerAddressInput,
} from "@/types";

/**
 * Customer address book API client.
 *
 * Mirrors the backend `customer-address` module mounted at
 * `/api/v1/customer/addresses` (see
 * `backend/src/modules/customer-address/customer-address.routes.ts`).
 * All routes are ownership-scoped server-side; no customer id is sent.
 */
export const addressesApi = {
  /** GET /customer/addresses — the customer's saved addresses. */
  list(): Promise<ApiEnvelope<CustomerAddressDto[]>> {
    return apiFetch<ApiEnvelope<CustomerAddressDto[]>>("/customer/addresses");
  },

  /** POST /customer/addresses — create a saved address. */
  create(body: CreateCustomerAddressInput): Promise<ApiEnvelope<CustomerAddressDto>> {
    return apiFetch<ApiEnvelope<CustomerAddressDto>>("/customer/addresses", {
      method: "POST",
      body,
    });
  },

  /** GET /customer/addresses/:id */
  getById(id: string): Promise<ApiEnvelope<CustomerAddressDto>> {
    return apiFetch<ApiEnvelope<CustomerAddressDto>>(
      `/customer/addresses/${encodeURIComponent(id)}`,
    );
  },

  /** PATCH /customer/addresses/:id */
  update(id: string, body: UpdateCustomerAddressInput): Promise<ApiEnvelope<CustomerAddressDto>> {
    return apiFetch<ApiEnvelope<CustomerAddressDto>>(
      `/customer/addresses/${encodeURIComponent(id)}`,
      { method: "PATCH", body },
    );
  },

  /** DELETE /customer/addresses/:id */
  remove(id: string): Promise<ApiEnvelope<{ deleted: boolean }>> {
    return apiFetch(`/customer/addresses/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};

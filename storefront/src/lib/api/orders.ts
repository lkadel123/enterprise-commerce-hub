import { apiFetch } from "./client";
import type {
  ApiEnvelope,
  CreateCustomerOrderInput,
  CustomerTrackingDto,
  OrderDto,
  Paged,
} from "@/types";

/**
 * Customer self-service orders API client.
 *
 * Mirrors the backend `customer-orders` module mounted at
 * `/api/v1/customer/orders` (see
 * `backend/src/modules/customer-orders/customer-order.routes.ts`).
 *
 * SECURITY: the create-order body contains ONLY opaque identifiers
 * (`productId`, `quantity`) and strings (`couponCode`, `notes`, addresses,
 * `paymentMethod`). No financial fields and no customer id are ever sent —
 * the backend derives identity from the authenticated session and computes
 * all amounts server-side.
 */
export const ordersApi = {
  /**
   * POST /customer/orders — place an order (items omitted ⇒ server cart).
   *
   * Phase 17 (G17-03): accepts an opaque, customer-scoped idempotency key
   * (generated once per intentional checkout submission) sent via the
   * `Idempotency-Key` header. The backend enforces uniqueness per customer so
   * a retried submission never creates a duplicate order and returns the
   * original order instead.
   */
  create(body: CreateCustomerOrderInput, idempotencyKey?: string): Promise<ApiEnvelope<OrderDto>> {
    return apiFetch<ApiEnvelope<OrderDto>>("/customer/orders", {
      method: "POST",
      body,
      ...(idempotencyKey
        ? { headers: { "Idempotency-Key": idempotencyKey } }
        : {}),
    });
  },

  /** GET /customer/orders — paginated order history. */
  list(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    sort?: string;
    from?: string;
    to?: string;
  }): Promise<ApiEnvelope<OrderDto[]> & { meta?: Paged<OrderDto>["meta"] }> {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set("page", String(params.page));
    if (params?.pageSize !== undefined) search.set("pageSize", String(params.pageSize));
    if (params?.status) search.set("status", params.status);
    if (params?.sort) search.set("sort", params.sort);
    if (params?.from) search.set("from", params.from);
    if (params?.to) search.set("to", params.to);
    const qs = search.toString();
    return apiFetch(`/customer/orders${qs ? `?${qs}` : ""}`);
  },

  /** GET /customer/orders/:id — ownership-scoped order detail. */
  getById(orderId: string): Promise<ApiEnvelope<OrderDto>> {
    return apiFetch<ApiEnvelope<OrderDto>>(`/customer/orders/${encodeURIComponent(orderId)}`);
  },

  /** GET /customer/orders/:id/tracking — customer-safe tracking projection. */
  getTracking(orderId: string): Promise<ApiEnvelope<CustomerTrackingDto>> {
    return apiFetch<ApiEnvelope<CustomerTrackingDto>>(
      `/customer/orders/${encodeURIComponent(orderId)}/tracking`,
    );
  },
};

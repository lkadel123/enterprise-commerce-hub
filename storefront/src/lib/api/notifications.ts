import { apiFetch } from "./client";
import type { ApiEnvelope, CustomerNotificationDto, Paged, UnreadCountDto } from "@/types";

/**
 * Customer notifications API client.
 *
 * Mirrors the backend `customer-notifications` module mounted at
 * `/api/v1/customer/notifications`. All routes are scoped to the
 * authenticated customer server-side; no customer id is ever sent.
 */
export interface NotificationListParams {
  unread?: boolean;
  read?: boolean;
  type?: string;
  priority?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

function buildQuery(params?: NotificationListParams): string {
  const search = new URLSearchParams();
  if (!params) return "";
  if (params.unread !== undefined) search.set("unread", String(params.unread));
  if (params.read !== undefined) search.set("read", String(params.read));
  if (params.type) search.set("type", params.type);
  if (params.priority) search.set("priority", params.priority);
  if (params.q) search.set("q", params.q);
  if (params.page !== undefined) search.set("page", String(params.page));
  if (params.pageSize !== undefined) search.set("pageSize", String(params.pageSize));
  if (params.sort) search.set("sort", params.sort);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const notificationsApi = {
  /** GET /customer/notifications — paginated, filterable notification list. */
  list(
    params?: NotificationListParams,
  ): Promise<
    ApiEnvelope<CustomerNotificationDto[]> & { meta?: Paged<CustomerNotificationDto>["meta"] }
  > {
    return apiFetch(`/customer/notifications${buildQuery(params)}`);
  },

  /** GET /customer/notifications/unread-count — unread badge count. */
  getUnreadCount(): Promise<ApiEnvelope<UnreadCountDto>> {
    return apiFetch<ApiEnvelope<UnreadCountDto>>("/customer/notifications/unread-count");
  },

  /** GET /customer/notifications/:id — a single owner-scoped notification. */
  getById(id: string): Promise<ApiEnvelope<CustomerNotificationDto>> {
    return apiFetch<ApiEnvelope<CustomerNotificationDto>>(
      `/customer/notifications/${encodeURIComponent(id)}`,
    );
  },

  /** PATCH /customer/notifications/:id/read — mark one notification read. */
  markRead(id: string): Promise<ApiEnvelope<CustomerNotificationDto>> {
    return apiFetch(`/customer/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
  },

  /** POST /customer/notifications/read-all — mark everything read. */
  markAllRead(): Promise<ApiEnvelope<{ updated: number }>> {
    return apiFetch("/customer/notifications/read-all", { method: "POST" });
  },

  /** DELETE /customer/notifications/:id — delete one notification. */
  delete(id: string): Promise<ApiEnvelope<{ deleted: boolean }>> {
    return apiFetch(`/customer/notifications/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};

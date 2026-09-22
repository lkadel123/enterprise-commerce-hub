import { apiFetch } from "./client";
import type { ApiEnvelope, Paged, SupportConversationDto, SupportMessageDto } from "@/types";

/**
 * Customer support API client.
 *
 * Mirrors the backend `support` customer router mounted at
 * `/api/v1/customer/support/conversations`. All operations are
 * ownership-scoped server-side.
 *
 * SECURITY: the client never sends `customerId` or `senderType` — both are
 * resolved/forced by the backend from the authenticated session.
 */

export interface ConversationListParams {
  status?: string;
  priority?: string;
  category?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

export interface CreateConversationInput {
  /** ≤200 chars (backend validator). */
  subject: string;
  priority?: "low" | "normal" | "high" | "urgent";
  /** ≤50 chars. */
  category?: string;
  /** Must be one of the customer's own order ids (ownership re-checked server-side). */
  relatedOrderId?: string;
  /** ≤5000 chars. */
  initialMessage: string;
}

function buildQuery(params?: ConversationListParams): string {
  const search = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const supportApi = {
  /** POST /customer/support/conversations — create a conversation. */
  createConversation(body: CreateConversationInput): Promise<ApiEnvelope<SupportConversationDto>> {
    return apiFetch("/customer/support/conversations", { method: "POST", body });
  },

  /** GET /customer/support/conversations — the customer's conversations. */
  listConversations(
    params?: ConversationListParams,
  ): Promise<
    ApiEnvelope<SupportConversationDto[]> & { meta?: Paged<SupportConversationDto>["meta"] }
  > {
    return apiFetch(`/customer/support/conversations${buildQuery(params)}`);
  },

  /** GET /customer/support/conversations/:id — conversation detail. */
  getConversation(id: string): Promise<ApiEnvelope<SupportConversationDto>> {
    return apiFetch(`/customer/support/conversations/${encodeURIComponent(id)}`);
  },

  /** GET /customer/support/conversations/:id/messages — thread messages. */
  getMessages(
    id: string,
    params?: { page?: number; pageSize?: number },
  ): Promise<ApiEnvelope<SupportMessageDto[]> & { meta?: Paged<SupportMessageDto>["meta"] }> {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set("page", String(params.page));
    if (params?.pageSize !== undefined) search.set("pageSize", String(params.pageSize));
    const qs = search.toString();
    return apiFetch(
      `/customer/support/conversations/${encodeURIComponent(id)}/messages${qs ? `?${qs}` : ""}`,
    );
  },

  /** PATCH /customer/support/conversations/:id/read — mark the thread read. */
  markConversationRead(id: string): Promise<ApiEnvelope<SupportConversationDto>> {
    return apiFetch(`/customer/support/conversations/${encodeURIComponent(id)}/read`, {
      method: "PATCH",
    });
  },

  /** PATCH /customer/support/conversations/:id/status — restricted transitions. */
  updateConversationStatus(
    id: string,
    status: "open" | "in_progress" | "resolved",
  ): Promise<ApiEnvelope<SupportConversationDto>> {
    return apiFetch(`/customer/support/conversations/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: { status },
    });
  },

  /** POST /customer/support/conversations/:id/messages — send a reply (≤5000 chars). */
  sendMessage(id: string, message: string): Promise<ApiEnvelope<SupportMessageDto>> {
    return apiFetch(`/customer/support/conversations/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      body: { message },
    });
  },

  /** DELETE /customer/support/conversations/:id — delete a conversation. */
  deleteConversation(id: string): Promise<ApiEnvelope<{ deleted: boolean }>> {
    return apiFetch(`/customer/support/conversations/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};

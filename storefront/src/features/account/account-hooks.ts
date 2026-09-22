import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { customerAuthApi } from "@/lib/api/customer-client";
import { notificationsApi } from "@/lib/api/notifications";
import { reviewsApi } from "@/lib/api/reviews";
import { supportApi, type CreateConversationInput } from "@/lib/api/support";
import { useCustomerAuthReady } from "@/lib/auth/CustomerAuthContext";
import type { CustomerProfileResult, SubmitReviewInput } from "@/types";

/**
 * TanStack Query hooks for the customer account area (Phase 8).
 *
 * All protected queries are gated by `useCustomerAuthReady()` so they never
 * fire before session restoration completes and never leak private requests
 * for guests (including during SSR).
 */

export const accountKeys = {
  notifications: (page: number) => ["notifications", page] as const,
  unreadCount: ["notifications", "unread-count"] as const,
  conversations: (page: number) => ["support", "conversations", page] as const,
  conversation: (id: string) => ["support", "conversation", id] as const,
  messages: (id: string) => ["support", "messages", id] as const,
  reviews: (page: number) => ["reviews", page] as const,
};

/* ------------------------------ Notifications ----------------------------- */

export function useNotificationsQuery(page = 1, pageSize = 20) {
  const enabled = useCustomerAuthReady();
  return useQuery({
    queryKey: accountKeys.notifications(page),
    queryFn: async () => {
      const response = await notificationsApi.list({ page, pageSize });
      return { items: response.data, meta: response.meta };
    },
    enabled,
    placeholderData: (prev) => prev,
  });
}

/** Unread count for badges. Modest stale time — no aggressive polling. */
export function useUnreadCountQuery() {
  const enabled = useCustomerAuthReady();
  return useQuery({
    queryKey: accountKeys.unreadCount,
    queryFn: async () => (await notificationsApi.getUnreadCount()).data.count,
    enabled,
    staleTime: 30_000,
  });
}

function invalidateNotifications(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["notifications"] });
}

export function useMarkNotificationReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => invalidateNotifications(queryClient),
  });
}

export function useMarkAllNotificationsReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => invalidateNotifications(queryClient),
  });
}

export function useDeleteNotificationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.delete(id),
    onSuccess: () => invalidateNotifications(queryClient),
  });
}

/* --------------------------------- Support -------------------------------- */

export function useConversationsQuery(page = 1, pageSize = 20) {
  const enabled = useCustomerAuthReady();
  return useQuery({
    queryKey: accountKeys.conversations(page),
    queryFn: async () => {
      const response = await supportApi.listConversations({ page, pageSize });
      return { items: response.data, meta: response.meta };
    },
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useConversationQuery(conversationId: string) {
  const enabled = useCustomerAuthReady() && conversationId.length > 0;
  return useQuery({
    queryKey: accountKeys.conversation(conversationId),
    queryFn: async () => (await supportApi.getConversation(conversationId)).data,
    enabled,
    retry: false,
  });
}

export function useConversationMessagesQuery(conversationId: string) {
  const enabled = useCustomerAuthReady() && conversationId.length > 0;
  return useQuery({
    queryKey: accountKeys.messages(conversationId),
    queryFn: async () => {
      const response = await supportApi.getMessages(conversationId, { pageSize: 100 });
      return response.data;
    },
    enabled,
  });
}

export function useCreateConversationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateConversationInput) => supportApi.createConversation(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["support", "conversations"] }),
  });
}

export function useSendMessageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, message }: { conversationId: string; message: string }) =>
      supportApi.sendMessage(conversationId, message),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: accountKeys.messages(variables.conversationId),
      });
      void queryClient.invalidateQueries({
        queryKey: accountKeys.conversation(variables.conversationId),
      });
      void queryClient.invalidateQueries({ queryKey: ["support", "conversations"] });
    },
  });
}

export function useUpdateConversationStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      conversationId,
      status,
    }: {
      conversationId: string;
      status: "open" | "in_progress" | "resolved";
    }) => supportApi.updateConversationStatus(conversationId, status),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: accountKeys.conversation(variables.conversationId),
      });
      void queryClient.invalidateQueries({ queryKey: ["support", "conversations"] });
    },
  });
}

export function useDeleteConversationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => supportApi.deleteConversation(conversationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["support", "conversations"] }),
  });
}

/* --------------------------------- Reviews -------------------------------- */

export function useMyReviewsQuery(page = 1, pageSize = 20) {
  const enabled = useCustomerAuthReady();
  return useQuery({
    queryKey: accountKeys.reviews(page),
    queryFn: async () => {
      const response = await reviewsApi.list({ page, pageSize });
      return { items: response.data, meta: response.meta };
    },
    enabled,
    placeholderData: (prev) => prev,
  });
}

/**
 * Phase 18 (G18-02) — submit a review for a delivered order item.
 *
 * The mutation carries the owning `orderId` so the backend can authoritatively
 * gate review creation (ownership, delivered state, product-in-order). The
 * client never claims eligibility itself — a server rejection (403/404/409) is
 * surfaced to the caller via the mutation error and rendered by the form.
 * On success we refresh the customer's review list and the product's reviews.
 */
export function useSubmitReviewMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SubmitReviewInput) => reviewsApi.create(body),
    onSuccess: () => {
      // Phase 10 fix: invalidate the REAL public review keys. Product-page
      // reviews live under ["public","reviews", productId, page, pageSize]
      // (see catalog-hooks.ts) and the product detail (rating/reviewsCount)
      // under ["public","product", slug]. Prefix invalidation matches both
      // families exactly; the previous keys (["reviews"], ["product","reviews"])
      // matched nothing live, leaving the product page stale after a submit.
      void queryClient.invalidateQueries({ queryKey: ["public", "reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["public", "product"] });
    },
  });
}

/* --------------------------------- Profile -------------------------------- */

/** Full profile (incl. phone) from GET /auth/customer/me. */
export function useProfileQuery() {
  const enabled = useCustomerAuthReady();
  return useQuery({
    queryKey: ["account", "profile"],
    queryFn: async () => (await customerAuthApi.me()).data,
    enabled,
  });
}

/**
 * Update profile name/phone. `onUpdated` lets the caller refresh the auth
 * context's in-memory customer snapshot so the header/dashboard reflect the
 * change immediately.
 */
export function useUpdateProfileMutation(onUpdated?: (result: CustomerProfileResult) => void) {
  return useMutation({
    mutationFn: async (body: { name?: string; phone?: string }) => {
      const response = await customerAuthApi.updateProfile(body);
      return response.data;
    },
    onSuccess: (data) => onUpdated?.(data),
  });
}

export function useChangePasswordMutation() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      customerAuthApi.changePassword(body),
  });
}

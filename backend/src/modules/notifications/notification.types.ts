export const NOTIFICATION_TYPES = [
  "order",
  "inventory",
  "customer",
  "product",
  "review",
  "coupon",
  "system",
  "authentication",
  "user",
  "security",
  "support",
  "review_submitted",
  "coupon_redeemed",
  "order_status_changed",
  "payment_initiated",
  "payment_successful",
  "payment_failed",
  "refunded",
  "order_created",
  "order_cancelled",
  "order_expired",
  "refund_initiated",
  "refund_completed",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_PRIORITIES = ["low", "normal", "high", "critical"] as const;

export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export interface CreateNotificationInput {
  recipientId: string;
  recipientType?: "admin" | "customer";
  type: NotificationType;
  title: string;
  message?: string;
  priority?: NotificationPriority;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationDto {
  id: string;
  recipientId: string;
  recipientType: "admin" | "customer";
  type: NotificationType;
  title: string;
  message: string | null;
  priority: NotificationPriority;
  read: boolean;
  readAt: string | null;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerNotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  priority: NotificationPriority;
  read: boolean;
  readAt: string | null;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UnreadCountDto {
  count: number;
}

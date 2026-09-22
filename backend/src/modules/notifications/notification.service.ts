import type { INotification } from "./notification.model.js";
import { notificationRepository, type NotificationListParams } from "./notification.repository.js";
import type {
  CreateNotificationInput,
  CustomerNotificationDto,
  NotificationDto,
  UnreadCountDto,
} from "./notification.types.js";

/** Options bag for customer notifications (title is passed separately). */
export interface NotifyCustomerOptions {
  message?: string;
  priority?: CreateNotificationInput["priority"];
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

function toDto(notification: INotification): NotificationDto {
  return {
    id: notification._id.toString(),
    recipientId: notification.recipientId.toString(),
    recipientType: notification.recipientType,
    type: notification.type,
    title: notification.title,
    message: notification.message ?? null,
    priority: notification.priority,
    read: notification.read,
    readAt: notification.readAt ? new Date(notification.readAt).toISOString() : null,
    entityType: notification.entityType ?? null,
    entityId: notification.entityId ?? null,
    actionUrl: notification.actionUrl ?? null,
    metadata: (notification.metadata as Record<string, unknown>) ?? null,
    createdAt: new Date(notification.createdAt).toISOString(),
    updatedAt: new Date(notification.updatedAt).toISOString(),
  };
}

function toCustomerDto(notification: INotification): CustomerNotificationDto {
  return {
    id: notification._id.toString(),
    type: notification.type,
    title: notification.title,
    message: notification.message ?? null,
    priority: notification.priority,
    read: notification.read,
    readAt: notification.readAt ? new Date(notification.readAt).toISOString() : null,
    entityType: notification.entityType ?? null,
    entityId: notification.entityId ?? null,
    actionUrl: notification.actionUrl ?? null,
    createdAt: new Date(notification.createdAt).toISOString(),
    updatedAt: new Date(notification.updatedAt).toISOString(),
  };
}

export const notificationService = {
  async list(
    recipientId: string,
    recipientType: "admin" | "customer",
    params: NotificationListParams,
  ) {
    const { items, meta } = await notificationRepository.list(recipientId, recipientType, params);
    const dtos = items.map((n) => (recipientType === "customer" ? toCustomerDto(n) : toDto(n)));
    return { items: dtos, meta };
  },

  async getById(
    id: string,
    recipientId: string,
    recipientType: "admin" | "customer",
  ): Promise<NotificationDto | CustomerNotificationDto | null> {
    const notification = await notificationRepository.findById(id, recipientType);
    if (!notification || notification.recipientId.toString() !== recipientId) {
      return null;
    }
    return recipientType === "customer" ? toCustomerDto(notification) : toDto(notification);
  },

  async create(input: CreateNotificationInput): Promise<NotificationDto> {
    const notification = await notificationRepository.create(input);
    return toDto(notification);
  },

  /** Convenience: creates a notification for a single user by id. */
  async notify(
    recipientId: string,
    type: CreateNotificationInput["type"],
    title: string,
    options?: {
      recipientType?: "admin" | "customer";
      message?: string;
      priority?: CreateNotificationInput["priority"];
      entityType?: string;
      entityId?: string;
      actionUrl?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<NotificationDto> {
    return this.create({
      recipientId,
      recipientType: options?.recipientType ?? "admin",
      type,
      title,
      message: options?.message,
      priority: options?.priority,
      entityType: options?.entityType,
      entityId: options?.entityId,
      actionUrl: options?.actionUrl,
      metadata: options?.metadata,
    });
  },

  /**
   * Convenience: creates notifications for all admin users by their ids.
   * Useful when multiple administrators should see the same event.
   */
  async notifyMany(
    recipientIds: string[],
    type: CreateNotificationInput["type"],
    title: string,
    options?: {
      recipientType?: "admin" | "customer";
      message?: string;
      priority?: CreateNotificationInput["priority"];
      entityType?: string;
      entityId?: string;
      actionUrl?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<NotificationDto[]> {
    const results: NotificationDto[] = [];
    for (const id of recipientIds) {
      results.push(
        await this.notify(id, type, title, {
          recipientType: options?.recipientType,
          message: options?.message,
          priority: options?.priority,
          entityType: options?.entityType,
          entityId: options?.entityId,
          actionUrl: options?.actionUrl,
          metadata: options?.metadata,
        }),
      );
    }
    return results;
  },

  /**
   * Convenience: creates a notification for a single customer account.
   * Uses the customer's Account ID as the recipientId.
   */
  async notifyCustomer(
    customerId: string,
    type: CreateNotificationInput["type"],
    title: string,
    options?: {
      message?: string;
      priority?: CreateNotificationInput["priority"];
      entityType?: string;
      entityId?: string;
      actionUrl?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<CustomerNotificationDto> {
    const notification = await notificationRepository.create({
      recipientId: customerId,
      recipientType: "customer",
      type,
      title,
      message: options?.message,
      priority: options?.priority,
      entityType: options?.entityType,
      entityId: options?.entityId,
      actionUrl: options?.actionUrl,
      metadata: options?.metadata,
    });
    return toCustomerDto(notification);
  },

  /**
   * Lifecycle notification with dedupe (Phase 16D): repeated lifecycle
   * transitions (retried cancels, re-run expiry sweeps) must not create a
   * second notification for the same (recipient, type, entity).
   */
  async notifyCustomerOnce(
    customerId: string,
    type: CreateNotificationInput["type"],
    title: string,
    options?: NotifyCustomerOptions,
  ): Promise<CustomerNotificationDto | null> {
    const exists = await notificationRepository.existsFor(
      customerId,
      "customer",
      type,
      options?.entityId,
    );
    if (exists) return null;
    return this.notifyCustomer(customerId, type, title, options);
  },

  async markAsRead(
    id: string,
    recipientId: string,
    recipientType: "admin" | "customer",
  ): Promise<NotificationDto | CustomerNotificationDto | null> {
    const notification = await notificationRepository.markAsRead(id, recipientId, recipientType);
    if (!notification) return null;
    return recipientType === "customer" ? toCustomerDto(notification) : toDto(notification);
  },

  async markAllAsRead(recipientId: string, recipientType: "admin" | "customer"): Promise<number> {
    return notificationRepository.markAllAsRead(recipientId, recipientType);
  },

  async remove(
    id: string,
    recipientId: string,
    recipientType: "admin" | "customer",
  ): Promise<boolean> {
    const result = await notificationRepository.deleteById(id, recipientId, recipientType);
    return result !== null;
  },

  async getUnreadCount(
    recipientId: string,
    recipientType: "admin" | "customer",
  ): Promise<UnreadCountDto> {
    const count = await notificationRepository.countUnread(recipientId, recipientType);
    return { count };
  },
};

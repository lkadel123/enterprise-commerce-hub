/**
 * Customer-facing notification surface types.
 *
 * Re-exports the canonical types from the shared notifications module so the
 * customer layer stays thin while keeping a clear public contract.
 */
export type {
  NotificationType,
  NotificationPriority,
  CustomerNotificationDto,
} from "../notifications/notification.types.js";

export {
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITIES,
} from "../notifications/notification.types.js";

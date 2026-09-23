import { customerAuthRepository } from "../customer-auth/customer-auth.repository.js";
import { notificationService, type NotifyCustomerOptions } from "./notification.service.js";
import type { NotificationType } from "./notification.types.js";
import { logger } from "../../utils/logger.js";

/**
 * Phase 16D lifecycle notification helper.
 *
 * Customer notifications are keyed by CustomerAccount id (the storefront
 * identity), while commerce records (orders) reference the CRM Customer.
 * This resolves the account for a CRM customer and sends a de-duplicated
 * lifecycle notification. Best-effort: never throws.
 */
export async function notifyCustomerByCrmCustomerId(
  crmCustomerId: string | null | undefined,
  type: NotificationType,
  title: string,
  options?: NotifyCustomerOptions,
): Promise<void> {
  if (!crmCustomerId) return;
  try {
    const accountId = await customerAuthRepository.findAccountIdByCrmCustomerId(crmCustomerId);
    if (!accountId) return;
    await notificationService.notifyCustomerOnce(accountId, type, title, options);
  } catch (error) {
    logger.warn({ crmCustomerId, type, error }, "Failed to deliver lifecycle notification");
  }
}

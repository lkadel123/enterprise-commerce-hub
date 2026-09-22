import { Router } from "express";

import { customerAuthenticate } from "../../middleware/customerAuthenticate.js";
import { authenticate } from "../../middleware/authenticate.js";
import { apiRateLimiter, authActionRateLimiter } from "../../middleware/rateLimiter.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";

import { supportConversationController } from "./support-conversation.controller.js";
import {
  createSupportConversationSchema,
  supportConversationListQuerySchema,
  supportConversationParamsSchema,
  updateSupportConversationSchema,
  customerStatusUpdateSchema,
} from "./support-conversation.validator.js";
import { createSupportMessageSchema } from "./support-message.validator.js";

/**
 * Support conversation routes.
 *
 * Customer routes (under /api/v1/customer/support/conversations) require a
 * customer-authenticated session. All operations are ownership-scoped:
 * a customer can only see and interact with their own conversations.
 *
 * Admin routes (under /api/v1/admin/support/conversations) require an
 * authenticated admin with appropriate permissions.
 */
const customerRouter = Router();
const adminRouter = Router();

// --- Customer routes ---
customerRouter.use(customerAuthenticate);
customerRouter.use(apiRateLimiter);

/** POST /api/v1/customer/support/conversations — create a new support conversation. */
customerRouter.post(
  "/",
  validate(createSupportConversationSchema, "body"),
  supportConversationController.customerCreate,
);

/** GET /api/v1/customer/support/conversations — list the customer's conversations. */
customerRouter.get(
  "/",
  validate(supportConversationListQuerySchema, "query"),
  supportConversationController.customerList,
);

/** GET /api/v1/customer/support/conversations/:id — view a conversation + messages. */
customerRouter.get(
  "/:id",
  validate(supportConversationParamsSchema, "params"),
  supportConversationController.customerGetById,
);

/** GET /api/v1/customer/support/conversations/:id/messages — list messages in a conversation. */
customerRouter.get(
  "/:id/messages",
  validate(supportConversationParamsSchema, "params"),
  supportConversationController.customerListMessages,
);

/** PATCH /api/v1/customer/support/conversations/:id/read — mark the conversation as read. */
customerRouter.patch(
  "/:id/read",
  validate(supportConversationParamsSchema, "params"),
  supportConversationController.customerMarkRead,
);

/** PATCH /api/v1/customer/support/conversations/:id/status — update status. */
customerRouter.patch(
  "/:id/status",
  validate(supportConversationParamsSchema, "params"),
  validate(customerStatusUpdateSchema, "body"),
  supportConversationController.customerUpdateStatus,
);

/** POST /api/v1/customer/support/conversations/:id/messages — send a reply. */
customerRouter.post(
  "/:id/messages",
  validate(supportConversationParamsSchema, "params"),
  validate(createSupportMessageSchema, "body"),
  supportConversationController.customerAddMessage,
);

/** DELETE /api/v1/customer/support/conversations/:id — delete a conversation. */
customerRouter.delete(
  "/:id",
  validate(supportConversationParamsSchema, "params"),
  authActionRateLimiter,
  supportConversationController.customerDelete,
);

// --- Admin routes ---
adminRouter.use(authenticate);
adminRouter.use(requirePermission("support", "view"));
adminRouter.use(apiRateLimiter);

/** GET /api/v1/admin/support/conversations — list all conversations. */
adminRouter.get(
  "/",
  validate(supportConversationListQuerySchema, "query"),
  supportConversationController.adminList,
);

/** GET /api/v1/admin/support/conversations/:id — view any conversation + messages. */
adminRouter.get(
  "/:id",
  validate(supportConversationParamsSchema, "params"),
  supportConversationController.adminGetById,
);

/** PATCH /api/v1/admin/support/conversations/:id — update conversation. */
adminRouter.patch(
  "/:id",
  validate(supportConversationParamsSchema, "params"),
  validate(updateSupportConversationSchema, "body"),
  supportConversationController.adminUpdate,
);

/** POST /api/v1/admin/support/conversations/:id/messages — agent sends a reply. */
adminRouter.post(
  "/:id/messages",
  validate(supportConversationParamsSchema, "params"),
  validate(createSupportMessageSchema, "body"),
  supportConversationController.adminAddAgentMessage,
);

/** DELETE /api/v1/admin/support/conversations/:id — delete a conversation. */
adminRouter.delete(
  "/:id",
  validate(supportConversationParamsSchema, "params"),
  authActionRateLimiter,
  supportConversationController.adminDelete,
);

export { customerRouter as supportCustomerRouter, adminRouter as supportAdminRouter };

import { Router } from "express";
import { customerAuthenticate } from "../../middleware/customerAuthenticate.js";
import { validate } from "../../middleware/validate.js";
import { customerAuthController } from "../customer-auth/customer-auth.controller.js";
import { customerUpdateProfileSchema } from "../customer-auth/customer-auth.validator.js";

/**
 * Customer self-service account endpoints, mounted at /api/v1/account.
 * All routes are session-scoped: the customer access token issued at
 * /auth/customer/login identifies the resource owner. Profile updates write
 * to the linked CRM Customer record so order/CRM continuity is preserved.
 */
const router = Router();

router.use(customerAuthenticate);

router.get("/profile", customerAuthController.me);
router.patch(
  "/profile",
  validate(customerUpdateProfileSchema),
  customerAuthController.updateProfile,
);

export { router as accountRouter };

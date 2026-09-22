import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import {
  authActionRateLimiter,
  authRateLimiter,
  refreshRateLimiter,
} from "../../middleware/rateLimiter.js";
import { validate } from "../../middleware/validate.js";
import { authController } from "./auth.controller.js";
import { changePasswordSchema, loginSchema } from "./auth.validator.js";

const router = Router();

router.post("/login", authRateLimiter, validate(loginSchema), authController.login);
router.post("/refresh", refreshRateLimiter, authController.refresh);
router.post("/logout", authController.logout);

router.use(authenticate);
router.get("/me", authController.me);
router.post(
  "/change-password",
  authActionRateLimiter,
  validate(changePasswordSchema),
  authController.changePassword,
);

export { router as authRouter };

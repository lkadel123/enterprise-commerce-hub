import { Router } from "express";

import { customerAuthenticate } from "../../middleware/customerAuthenticate.js";
import {
  authActionRateLimiter,
  authRateLimiter,
  refreshRateLimiter,
} from "../../middleware/rateLimiter.js";
import { validate } from "../../middleware/validate.js";

import { customerAuthController } from "./customer-auth.controller.js";
import { customerSocialController } from "./customer-social.controller.js";
import {
  customerChangePasswordSchema,
  customerForgotPasswordSchema,
  customerLoginSchema,
  customerRegisterSchema,
  customerResetPasswordSchema,
  customerSocialAcceptTermsSchema,
  customerUpdateProfileSchema,
} from "./customer-auth.validator.js";
import { socialOAuthRateLimiter } from "../../middleware/rateLimiter.js";

const router = Router();

/**
 * Public customer authentication endpoints.
 */
router.post(
  "/register",
  authRateLimiter,
  validate(customerRegisterSchema),
  customerAuthController.register,
);

router.post("/login", authRateLimiter, validate(customerLoginSchema), customerAuthController.login);

/**
 * Social sign-in (Google / Facebook) — CUSTOMER accounts only.
 *
 * Browser navigation flow (never fetch): the storefront links here, we redirect
 * to the provider, and the provider redirects to the matching /callback route.
 * The dedicated limiter bounds consent-screen and callback floods per IP.
 */
router.get("/google", socialOAuthRateLimiter, customerSocialController.googleStart);
router.get("/google/callback", socialOAuthRateLimiter, customerSocialController.googleCallback);

router.get("/facebook", socialOAuthRateLimiter, customerSocialController.facebookStart);
router.get("/facebook/callback", socialOAuthRateLimiter, customerSocialController.facebookCallback);

/**
 * Terms & Conditions consent completion for NEW social customers.
 *
 * The provider-verified identity is carried server-side in a signed, single-use
 * HttpOnly consent cookie (never in URLs or client storage); the request body
 * must contain the literal `acceptedTerms: true` or the request is rejected
 * before any account exists. Same limiter family as the OAuth round trip.
 */
router.post(
  "/social/accept-terms",
  socialOAuthRateLimiter,
  validate(customerSocialAcceptTermsSchema),
  customerSocialController.acceptTerms,
);

router.post("/refresh", refreshRateLimiter, customerAuthController.refresh);

router.post("/logout", customerAuthController.logout);

/**
 * Password recovery endpoints.
 *
 * These must remain public because the customer may not
 * have a valid authenticated session when recovering a password.
 */
router.post(
  "/forgot-password",
  validate(customerForgotPasswordSchema),
  customerAuthController.forgotPassword,
);

router.post(
  "/reset-password",
  validate(customerResetPasswordSchema),
  customerAuthController.resetPassword,
);

/**
 * Authenticated customer endpoints.
 *
 * All routes below this middleware require a valid
 * customer authentication session.
 */
router.use(customerAuthenticate);

router.get("/me", customerAuthController.me);

router.post(
  "/change-password",
  authActionRateLimiter,
  validate(customerChangePasswordSchema),
  customerAuthController.changePassword,
);

router.patch(
  "/profile",
  validate(customerUpdateProfileSchema),
  customerAuthController.updateProfile,
);

export { router as customerAuthRouter };

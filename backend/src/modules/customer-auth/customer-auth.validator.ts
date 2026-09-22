import { z } from "zod";

import { CURRENT_TERMS_VERSION } from "../../constants/terms.js";

export const customerRegisterSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  // Backend-enforced acceptance: the field MUST be the literal boolean `true`.
  // Missing, false, "true" (string), 1 (number) — anything else is rejected.
  acceptedTerms: z.literal(true, {
    errorMap: () => ({
      message: "You must accept the Terms & Conditions and Privacy Policy.",
    }),
  }),
});

export { CURRENT_TERMS_VERSION };

/**
 * POST /auth/customer/social/accept-terms — completes a NEW social-customer
 * registration ONLY after explicit Terms & Conditions acceptance. The
 * provider-verified identity arrives exclusively via the signed HttpOnly
 * consent cookie; the body carries nothing but the literal `true`.
 */
export const customerSocialAcceptTermsSchema = z.object({
  acceptedTerms: z.literal(true, {
    errorMap: () => ({
      message: "You must accept the Terms & Conditions and Privacy Policy.",
    }),
  }),
});

export const customerLoginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
  remember: z.boolean().optional(),
});

export const customerChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

export const customerUpdateProfileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
});

export const customerForgotPasswordSchema = z.object({
  email: z.string().trim().email().max(254),
});

export const customerResetPasswordSchema = z.object({
  requestId: z.string().regex(/^[0-9a-f]{64}$/i, "Invalid request ID"),
  token: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { badRequest, conflict, invalidCredentials, serviceUnavailable, unauthorized } from "../../utils/ApiError.js";
import { hashPassword, verifyPassword } from "../../utils/password.js";
import { hashToken } from "../../utils/jwt.js";
import { env } from "../../config/env.js";
import { sendPasswordResetEmail, smtpEnabled } from "../../utils/mailer.js";
import { signCustomerAccessToken } from "./customer-token.js";
import { customerRepository } from "../customers/customer.repository.js";
import { customerAuthRepository } from "./customer-auth.repository.js";
import { CustomerAccountModel } from "./customerAccount.model.js";
import { CURRENT_TERMS_VERSION } from "../../constants/terms.js";
import type {
  CustomerAuthContext,
  CustomerRegisterInput,
  CustomerLoginInput,
  CustomerChangePasswordInput,
  CustomerAuthProfile,
  CustomerAuthSessionResult,
  CustomerProfileResult,
} from "./customer-auth.types.js";

/** MS_PER_DAY constant */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Normalize email: lowercase + trim.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Generate a secure random requestId (hex string).
 */
function generateRequestId(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Generate secure random token pair (base64url token + SHA-256 hash).
 */
function generateRefreshTokenPair(): { token: string; tokenHash: string } {
  const token = randomBytes(48).toString("base64url");
  const tokenHash = hashToken(token);
  return { token, tokenHash };
}

/**
 * Convert a customer account record to a safe public profile.
 * Never includes passwordHash or internal security fields.
 */
function toProfile(account: {
  _id: { toString(): string };
  name: string;
  email: string;
  customer: { toString(): string } | null;
  status: string;
}): CustomerAuthProfile {
  return {
    id: account._id.toString(),
    name: account.name,
    email: account.email,
    customerId: account.customer ? account.customer.toString() : null,
    status: account.status as CustomerAuthProfile["status"],
  };
}

/**
 * Resolve the linked CRM Customer into the safe customerProfile projection used
 * by profile/updateProfile responses. Returns null when no CRM Customer exists.
 */
async function resolveCustomerProfile(account: {
  customer: { toString(): string } | null;
}): Promise<CustomerProfileResult["customerProfile"]> {
  if (!account.customer) return null;
  const crm = await customerRepository.findById(account.customer.toString());
  if (!crm) return null;
  return { name: crm.name, email: crm.email, phone: crm.phone ?? null };
}

/**
 * POST /auth/customer/register
 * Register a new customer account.
 */
async function register(
  input: CustomerRegisterInput,
  ctx: CustomerAuthContext,
): Promise<CustomerAuthSessionResult> {
  const email = normalizeEmail(input.email);

  const existing = await customerAuthRepository.findByEmail(email);
  if (existing) {
    throw conflict("A customer with this email already exists.");
  }

  const passwordHash = await hashPassword(input.password);

  const account = await customerAuthRepository.createAccount({
    name: input.name,
    email,
    passwordHash,
    // Accepted terms are validated (literal `true`) by the schema before the
    // service is reached — record WHEN and WHICH VERSION was accepted.
    termsAcceptedAt: new Date(),
    termsVersion: CURRENT_TERMS_VERSION,
    customer: null,
  });

  const { token, tokenHash } = generateRefreshTokenPair();

  const ttlDays = 7; // default, no remember on register

  await customerAuthRepository.createSession({
    customerAccountId: account._id,
    tokenHash,
    ua: ctx?.ua,
    ip: ctx?.ip,
    expiresAt: new Date(Date.now() + ttlDays * MS_PER_DAY),
    remember: false,
  });

  const accessToken = signCustomerAccessToken(account._id.toString());

  return {
    customer: toProfile(account),
    accessToken,
    refreshToken: token,
    remember: false,
  };
}

/**
 * POST /auth/customer/login
 * Login with email + password.
 */
async function login(
  input: CustomerLoginInput,
  ctx: CustomerAuthContext,
): Promise<CustomerAuthSessionResult> {
  const email = normalizeEmail(input.email);

  const user = await customerAuthRepository.findByEmail(email);
  if (!user) {
    throw invalidCredentials("Invalid email or password.");
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw invalidCredentials("Invalid email or password.");
  }

  if (user.status !== "Active") {
    throw unauthorized("This account is not active.");
  }

  const remember = input.remember ?? false;

  // Revoke any existing active sessions for this account (security: force re-login)
  await customerAuthRepository.revokeAllForAccount(user._id.toString());

  const { token, tokenHash } = generateRefreshTokenPair();

  const ttlDays = remember ? 30 : 7;

  await customerAuthRepository.createSession({
    customerAccountId: user._id,
    tokenHash,
    ua: ctx?.ua,
    ip: ctx?.ip,
    expiresAt: new Date(Date.now() + ttlDays * MS_PER_DAY),
    remember,
  });

  const accessToken = signCustomerAccessToken(user._id.toString());

  return {
    customer: toProfile(user),
    accessToken,
    refreshToken: token,
    remember,
  };
}

/**
 * POST /auth/customer/refresh
 * Refresh access token using a valid refresh token.
 * Rotates the refresh token (invalidate old, create new).
 */
async function refresh(
  token: string,
  ctx: CustomerAuthContext,
): Promise<CustomerAuthSessionResult> {
  if (!token) {
    throw unauthorized("Refresh token missing.");
  }

  const tokenHash = hashToken(token);

  const session = await customerAuthRepository.findSessionByTokenHash(tokenHash);
  if (!session) {
    throw unauthorized("Invalid refresh token.");
  }

  if (session.revokedAt) {
    // Reuse detection: a presented, already-revoked token means the refresh
    // token was replayed. Revoke the whole rotation chain so any successor
    // tokens derived from it are invalidated too.
    await customerAuthRepository.revokeChain(tokenHash);
    throw unauthorized("Invalid refresh token.");
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await customerAuthRepository.revokeSession(session._id.toString());
    throw unauthorized("Refresh token expired. Please sign in again.");
  }

  const user = await customerAuthRepository.findById(session.customerAccountId.toString());
  if (!user) {
    throw unauthorized("Customer account no longer exists.");
  }

  if (user.status !== "Active") {
    throw unauthorized("Customer account is not active.");
  }

  // Rotate: revoke current session, create a successor linked to the chain root
  await customerAuthRepository.revokeSession(session._id.toString());

  const chainRoot = session.rotatedFrom ?? tokenHash;

  const { token: newToken, tokenHash: newTokenHash } = generateRefreshTokenPair();

  const ttlDays = session.remember ? 30 : 7;

  await customerAuthRepository.createSession({
    customerAccountId: user._id,
    tokenHash: newTokenHash,
    ua: ctx?.ua,
    ip: ctx?.ip,
    expiresAt: new Date(Date.now() + ttlDays * MS_PER_DAY),
    remember: session.remember,
    rotatedFrom: chainRoot,
  });

  const accessToken = signCustomerAccessToken(user._id.toString());

  return {
    customer: toProfile(user),
    accessToken,
    refreshToken: newToken,
    remember: session.remember,
  };
}

/**
 * POST /auth/customer/logout
 * Invalidate the supplied refresh session.
 */
async function logout(token?: string): Promise<void> {
  if (!token) {
    return;
  }

  const tokenHash = hashToken(token);
  const session = await customerAuthRepository.findSessionByTokenHash(tokenHash);
  if (session) {
    await customerAuthRepository.revokeSession(session._id.toString());
  }
}

/**
 * GET /auth/customer/me
 * Return the authenticated customer profile.
 */
async function profile(customerId: string): Promise<CustomerProfileResult> {
  const account = await customerAuthRepository.findById(customerId);
  if (!account) {
    throw unauthorized("Customer not found.");
  }

  return {
    customer: toProfile(account),
    customerProfile: await resolveCustomerProfile(account),
  };
}

/**
 * POST /auth/customer/change-password
 * Change the customer password.
 * Verifies current password, hashes new password, revokes other sessions.
 */
async function changePassword(
  customerId: string,
  input: CustomerChangePasswordInput,
): Promise<void> {
  const account = await customerAuthRepository.findById(customerId);
  if (!account) {
    throw unauthorized("Customer not found.");
  }

  const valid = await verifyPassword(input.currentPassword, account.passwordHash);
  if (!valid) {
    throw badRequest("Current password is incorrect.");
  }

  const newPasswordHash = await hashPassword(input.newPassword);

  await customerAuthRepository.updatePassword(customerId, newPasswordHash);

  await customerAuthRepository.revokeAllForAccount(customerId);
}

/**
 * PATCH /auth/customer/profile
 * Update the customer profile.
 */
async function updateProfile(
  customerId: string,
  patch: { name?: string; phone?: string },
): Promise<CustomerProfileResult> {
  const account = await customerAuthRepository.findById(customerId);
  if (!account) {
    throw unauthorized("Customer not found.");
  }

  if (patch.name) {
    await customerAuthRepository.updateProfile(customerId, { name: patch.name });
  }

  // Ensure a linked CRM Customer exists so profile writes land on the CRM
  // record (creates + links on first profile update, then reuses it).
  let crmId = account.customer ? account.customer.toString() : null;
  let crm = crmId ? await customerRepository.findById(crmId) : null;
  if (!crm) {
    crm = await customerRepository.findByEmail(account.email);
    if (!crm) {
      crm = await customerRepository.create({
        name: patch.name ?? account.name,
        email: account.email,
        group: "Retail",
        status: "Active",
      });
    }
    crmId = crm._id.toString();
    await CustomerAccountModel.updateOne(
      { _id: account._id },
      { $set: { customer: new Types.ObjectId(crmId) } },
    ).exec();
  }

  const crmPatch: { name?: string; phone?: string } = {};
  if (patch.name) crmPatch.name = patch.name;
  if (patch.phone) crmPatch.phone = patch.phone;
  if (Object.keys(crmPatch).length > 0) {
    const updatedCrm = await customerRepository.updateById(crm._id.toString(), crmPatch);
    if (updatedCrm) crm = updatedCrm;
  }

  const updatedAccount = await customerAuthRepository.findById(customerId);
  return {
    customer: toProfile(updatedAccount ?? account),
    customerProfile: {
      name: crm.name,
      email: crm.email,
      phone: crm.phone ?? null,
    },
  };
}

/**
 * POST /auth/customer/forgot-password
 * Initiate password reset.
 * Generates a requestId + one-time token, stores the token HASH + expiry on
 * the account, and DELIVERS the reset link by email (SMTP).
 *
 * Security model (preserved):
 * - Only the SHA-256 hash of the token is stored; the raw token exists solely
 *   inside the emailed link and is never returned by the API or logged.
 * - Unknown emails still return a generic requestId so responses never leak
 *   whether an account exists (no email is sent for unknown accounts).
 * - When SMTP is disabled or delivery fails the operation fails loudly (503)
 *   instead of pretending the email was sent.
 */
async function forgotPassword(
  email: string,
  _ctx: CustomerAuthContext,
): Promise<{ requestId: string }> {
  const normalizedEmail = normalizeEmail(email);

  const account = await customerAuthRepository.findByEmail(normalizedEmail);
  if (!account) {
    // Important: do not leak whether email exists — return generic response.
    // No email is sent; the requestId is inert without the matching token.
    return { requestId: generateRequestId() };
  }

  const requestId = generateRequestId();
  const token = randomBytes(48).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 24 * MS_PER_DAY); // 24 hours

  // Fail fast BEFORE staging anything: a staged token whose email was never
  // delivered is a dead end for the customer. When SMTP is not configured the
  // operation errors out and nothing is written.
  if (!smtpEnabled()) {
    throw serviceUnavailable(
      "Password reset by email is not available. Please contact support.",
    );
  }

  await CustomerAccountModel.updateOne(
    { _id: account._id },
    {
      $set: {
        resetRequestId: requestId,
        resetTokenHash: tokenHash,
        resetTokenExpiresAt: expiresAt,
      },
    },
  );

  // Deliver the one-time reset link. The URL is built from the server-validated
  // PUBLIC_BASE_URL; the raw token exists only inside the emailed link.
  const resetUrl = `${env.PUBLIC_BASE_URL}/reset-password?requestId=${requestId}&token=${token}`;
  await sendPasswordResetEmail(normalizedEmail, resetUrl);

  return { requestId };
}

/**
 * POST /auth/customer/reset-password
 * Validate reset requestId + token, then change password.
 * Rejects expired/used/invalid tokens.
 * Hashes the new password, revokes existing sessions.
 */
async function resetPassword(requestId: string, token: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(token);

  const account = await CustomerAccountModel.findOne({
    resetRequestId: requestId,
    resetTokenHash: tokenHash,
    resetTokenExpiresAt: { $gt: new Date() },
  })
    .lean()
    .exec();

  if (!account) {
    throw unauthorized("Invalid or expired reset token.");
  }

  const passwordHash = await hashPassword(newPassword);

  await CustomerAccountModel.updateOne(
    { _id: account._id },
    {
      $set: {
        passwordHash,
        passwordChangedAt: new Date(),
      },
      $unset: {
        resetRequestId: "",
        resetTokenHash: "",
        resetTokenExpiresAt: "",
      },
    },
  ).exec();

  await customerAuthRepository.revokeAllForAccount(account._id.toString());
}

export const customerAuthService = {
  register,
  login,
  refresh,
  logout,
  profile,
  changePassword,
  updateProfile,
  forgotPassword,
  resetPassword,
};

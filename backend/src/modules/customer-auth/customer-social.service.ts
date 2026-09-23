import { randomBytes } from "node:crypto";
import { Types } from "mongoose";

import { conflict, unauthorized } from "../../utils/ApiError.js";
import { hashPassword } from "../../utils/password.js";
import { hashToken } from "../../utils/jwt.js";
import { logger } from "../../utils/logger.js";
import { signCustomerAccessToken } from "./customer-token.js";
import { customerAuthRepository } from "./customer-auth.repository.js";
import { CustomerAccountModel } from "./customerAccount.model.js";
import { CURRENT_TERMS_VERSION } from "../../constants/terms.js";
import type {
  CustomerAuthContext,
  CustomerAuthProfile,
  CustomerAuthSessionResult,
} from "./customer-auth.types.js";
import {
  CustomerSocialAccountModel,
  isSocialProvider,
  type ICustomerSocialAccount,
  type SocialProvider,
} from "./customerSocialAccount.model.js";

/**
 * Social sign-in account resolution — CUSTOMER accounts only.
 *
 * Rules:
 * 1. Social identity already linked → authenticate that account.
 * 2. Provider-verified email matches an existing CustomerAccount → securely
 *    link the provider to that account (auto-link is only ever performed for
 *    a provider-VERIFIED email — resolution callers refuse unverified emails).
 * 3. Otherwise → the caller MUST obtain explicit Terms & Conditions acceptance
 *    first; the account is created only by acceptSocialTermsAndCreate().
 *
 * The resolution NEVER accepts or sets any privileged role: CustomerAccount
 * has no role field at all, and the admin `User` collection is never touched.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Social-created accounts get an UNUSABLE random hash — no plain password exists. */
const SOCIAL_PASSWORD_BYTES = 64;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

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

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

function assertActive(account: { status: string }): void {
  if (account.status !== "Active") {
    throw unauthorized("This account is not active.");
  }
}

/** Mirror of the password-flow session issuance (same refresh-session infra). */
async function issueSession(
  account: IAccountLike,
  ctx: CustomerAuthContext,
): Promise<CustomerAuthSessionResult> {
  const accountId = account._id.toString();

  // Same security posture as password login: a new sign-in revokes any active
  // refresh sessions for this account, then creates a fresh one.
  await customerAuthRepository.revokeAllForAccount(accountId);

  const token = randomBytes(48).toString("base64url");
  const tokenHash = hashToken(token);

  await customerAuthRepository.createSession({
    customerAccountId: account._id,
    tokenHash,
    ua: ctx?.ua,
    ip: ctx?.ip,
    // Same default TTL as password login without `remember`.
    expiresAt: new Date(Date.now() + 7 * MS_PER_DAY),
    remember: false,
  });

  return {
    customer: toProfile(account as unknown as Parameters<typeof toProfile>[0]),
    accessToken: signCustomerAccessToken(accountId),
    // Delivered to the client only via httpOnly cookie by the controller.
    refreshToken: token,
    remember: false,
  };
}

interface IAccountLike {
  _id: Types.ObjectId;
  name: string;
  email: string;
  customer: Types.ObjectId | null;
  status: string;
  emailVerifiedAt?: Date | null;
}

export interface SocialIdentityInput {
  provider: string;
  providerUserId: string;
  /** Provider-verified email, or null when the provider withholds it. */
  email: string | null;
  /** True only when the provider guarantees the email is verified. */
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

async function findSocialAccount(
  provider: SocialProvider,
  providerUserId: string,
): Promise<ICustomerSocialAccount | null> {
  return (await CustomerSocialAccountModel.findOne({ provider, providerUserId })
    .lean()
    .exec()) as unknown as ICustomerSocialAccount | null;
}

/** Returned when a NEW customer must explicitly accept the terms first. */
export interface SocialConsentRequired {
  consentRequired: true;
}

export type SocialSignInOutcome = CustomerAuthSessionResult | SocialConsentRequired;

function isConsentRequired(outcome: SocialSignInOutcome): outcome is SocialConsentRequired {
  return (outcome as SocialConsentRequired).consentRequired === true;
}

export { isConsentRequired };

/**
 * Resolve a provider-verified social identity into an authenticated customer
 * session (existing link → secure email link → consent-required for NEW
 * accounts). A NEW customer account is NEVER created here — the caller must
 * complete the Terms & Conditions consent step first.
 */
export async function resolveSocialSignIn(
  profile: SocialIdentityInput,
  ctx: CustomerAuthContext,
): Promise<SocialSignInOutcome> {
  if (!isSocialProvider(profile.provider)) {
    throw conflict("Unsupported sign-in provider.");
  }
  const provider = profile.provider;
  const email = profile.email ? normalizeEmail(profile.email) : null;

  // 1) Identity already linked → authenticate that account.
  const existingSocial = await findSocialAccount(provider, profile.providerUserId);
  if (existingSocial) {
    const account = await customerAuthRepository.findById(existingSocial.accountId.toString());
    if (!account) throw unauthorized("Customer account no longer exists.");
    assertActive(account);
    // Keep the stored profile snapshot fresh (name/avatar/email may change upstream).
    const patch: { name?: string; avatarUrl?: string; email?: string } = {};
    if (profile.name && profile.name !== existingSocial.name) patch.name = profile.name;
    if (profile.avatarUrl && profile.avatarUrl !== existingSocial.avatarUrl) {
      patch.avatarUrl = profile.avatarUrl;
    }
    if (email && email !== existingSocial.email) patch.email = email;
    if (Object.keys(patch).length > 0) {
      await CustomerSocialAccountModel.updateOne(
        { _id: existingSocial._id },
        { $set: patch },
      ).exec();
    }
    return issueSession(account as unknown as IAccountLike, ctx);
  }

  // 2) Verified email matches an existing customer account → secure link.
  if (email) {
    const existingByEmail = await customerAuthRepository.findByEmail(email);
    if (existingByEmail) {
      assertActive(existingByEmail);
      if (!profile.emailVerified) {
        // Defence in depth: an unverified provider email must never claim an
        // existing account (provider clients normally reject this earlier).
        throw conflict(
          "The provider did not verify this email. Sign in with email and password instead.",
        );
      }
      await linkSocialAccount(
        provider,
        profile.providerUserId,
        existingByEmail._id,
        profile,
        email,
      );
      // Mark the account email as provider-verified when never verified before.
      if (!existingByEmail.emailVerifiedAt) {
        await CustomerAccountModel.updateOne(
          { _id: existingByEmail._id, emailVerifiedAt: null },
          { $set: { emailVerifiedAt: new Date() } },
        ).exec();
      }
      return issueSession(existingByEmail as unknown as IAccountLike, ctx);
    }
  }

  // 3) No email → cannot create a customer account (Facebook may withhold it).
  if (!email) {
    throw conflict(
      "This provider did not share an email address. Sign in with email or use a provider that shares an email.",
    );
  }

  // 4) This would be a NEW customer account → explicit Terms & Conditions
  // acceptance is REQUIRED before the account may exist. The controller
  // redirects the user to a consent step with a signed, single-use, HttpOnly
  // continuation (provider identity never appears in URLs or client storage);
  // the account is only created afterwards by acceptSocialTermsAndCreate().
  return { consentRequired: true };
}

/**
 * Complete a social registration after EXPLICIT Terms & Conditions acceptance.
 *
 * Re-resolves the identity immediately before creation so concurrent changes
 * (identity linked elsewhere / password registration with the same email)
 * are handled as links — never duplicates — then records
 * `termsAcceptedAt` + `termsVersion` on the new CUSTOMER account and issues
 * the SAME session mechanism as every other customer sign-in.
 */
export async function acceptSocialTermsAndCreate(
  profile: SocialIdentityInput,
  ctx: CustomerAuthContext,
): Promise<CustomerAuthSessionResult> {
  if (!isSocialProvider(profile.provider)) {
    throw conflict("Unsupported sign-in provider.");
  }
  const provider = profile.provider;
  const email = profile.email ? normalizeEmail(profile.email) : null;

  // 1) Identity already linked meanwhile → authenticate that account.
  const existingSocial = await findSocialAccount(provider, profile.providerUserId);
  if (existingSocial) {
    const account = await customerAuthRepository.findById(existingSocial.accountId.toString());
    if (!account) throw unauthorized("Customer account no longer exists.");
    assertActive(account);
    return issueSession(account as unknown as IAccountLike, ctx);
  }

  // 2) An account with this email appeared meanwhile (e.g. password
  //    registration while consent was pending) → secure link, no duplicate.
  if (email) {
    const existingByEmail = await customerAuthRepository.findByEmail(email);
    if (existingByEmail) {
      assertActive(existingByEmail);
      if (!profile.emailVerified) {
        throw conflict(
          "The provider did not verify this email. Sign in with email and password instead.",
        );
      }
      await linkSocialAccount(
        provider,
        profile.providerUserId,
        existingByEmail._id,
        profile,
        email,
      );
      if (!existingByEmail.emailVerifiedAt) {
        await CustomerAccountModel.updateOne(
          { _id: existingByEmail._id, emailVerifiedAt: null },
          { $set: { emailVerifiedAt: new Date() } },
        ).exec();
      }
      return issueSession(existingByEmail as unknown as IAccountLike, ctx);
    }
  }

  // 3) A consent identity can never lack a provider-verified email (the
  //    resolution step refuses to hand out consent without one) — re-checked
  //    here so a forged/tampered continuation can never create an email-less
  //    account.
  if (!email) {
    throw conflict(
      "This provider did not share an email address. Sign in with email or use a provider that shares an email.",
    );
  }

  // 4) Still no account → create the CUSTOMER account now that the terms are
  //    explicitly accepted (recorded on the account itself).
  return createCustomerWithSocialLink(provider, profile.providerUserId, profile, email, ctx);
}

/** Creates the social link doc, tolerating duplicate-key races via re-read. */
async function linkSocialAccount(
  provider: SocialProvider,
  providerUserId: string,
  accountId: Types.ObjectId,
  profile: { name: string | null; avatarUrl: string | null },
  email: string | null,
): Promise<void> {
  try {
    await CustomerSocialAccountModel.create({
      provider,
      providerUserId,
      accountId,
      email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      // Lost a race: the identity was linked concurrently. It must point at
      // the SAME account — a link to a different account would be a takeover
      // attempt and must fail loudly instead of silently succeeding.
      const raced = await findSocialAccount(provider, providerUserId);
      if (!raced || raced.accountId.toString() !== accountId.toString()) {
        throw conflict("This social account is already linked to another customer.");
      }
      return;
    }
    throw error;
  }
}

/** Creates a brand-new CUSTOMER account plus its social link (race-safe). */
async function createCustomerWithSocialLink(
  provider: SocialProvider,
  providerUserId: string,
  profile: { name: string | null; avatarUrl: string | null },
  email: string,
  ctx: CustomerAuthContext,
): Promise<CustomerAuthSessionResult> {
  // Unusable random password: social accounts cannot be signed into with a
  // password unless the owner later sets one via the reset flow. The password
  // authentication itself is unchanged.
  const unusablePassword = randomBytes(SOCIAL_PASSWORD_BYTES).toString("base64url");
  const passwordHash = await hashPassword(unusablePassword);

  const name = (profile.name ?? email.split("@")[0] ?? "Customer").slice(0, 120);

  let account;
  try {
    account = await customerAuthRepository.createAccount({
      name,
      email,
      passwordHash,
      // Social-created accounts are provider-verified; mark the email so.
      emailVerifiedAt: new Date(),
      // Terms acceptance was explicitly given in the consent step before this
      // function could run — record when and which version.
      termsAcceptedAt: new Date(),
      termsVersion: CURRENT_TERMS_VERSION,
      customer: null,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      // Duplicate-email race: another request created the account between our
      // findByEmail and create. Re-resolve as a LINK — never a duplicate.
      logger.info("Social sign-in duplicate-email race — re-resolving as a link");
      const raced = await customerAuthRepository.findByEmail(email);
      if (!raced) throw conflict("A customer with this email already exists.");
      assertActive(raced);
      await linkSocialAccount(provider, providerUserId, raced._id, profile, email);
      return issueSession(raced as unknown as IAccountLike, ctx);
    }
    throw error;
  }

  try {
    await linkSocialAccount(provider, providerUserId, account._id, profile, email);
  } catch (error) {
    // Never leave a half-created account behind on a link failure.
    await CustomerAccountModel.deleteOne({ _id: account._id }).exec();
    logger.error({ err: error }, "Social link failed after account creation — account removed");
    throw error;
  }

  return issueSession(account as unknown as IAccountLike, ctx);
}

import { Schema, model, type HydratedDocument, type Types } from "mongoose";

/**
 * OAuth providers supported for CUSTOMER social sign-in. The list is
 * extensible: adding a provider here plus a client in `social/` is enough.
 */
export const SOCIAL_PROVIDERS = ["google", "facebook"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export function isSocialProvider(value: string): value is SocialProvider {
  return (SOCIAL_PROVIDERS as readonly string[]).includes(value);
}

export interface ICustomerSocialAccount {
  _id: Types.ObjectId;
  /** `google` | `facebook` — never used for role/permission decisions. */
  provider: SocialProvider;
  /** Provider's stable subject id (Google `sub`, Facebook user id). */
  providerUserId: string;
  /** Owning CustomerAccount — social accounts are ALWAYS customer accounts. */
  accountId: Types.ObjectId;
  /** Provider-verified email snapshot (may be null when provider omits it). */
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const customerSocialAccountSchema = new Schema<ICustomerSocialAccount>(
  {
    provider: { type: String, enum: [...SOCIAL_PROVIDERS], required: true },
    providerUserId: { type: String, required: true, trim: true, maxlength: 255 },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "CustomerAccount",
      required: true,
      index: true,
    },
    email: { type: String, lowercase: true, trim: true, maxlength: 254, index: true, default: null },
    name: { type: String, trim: true, maxlength: 120, default: null },
    avatarUrl: { type: String, maxlength: 2048, default: null },
  },
  { timestamps: true, versionKey: false },
);

/**
 * One social identity per provider — guarantees the same Google subject can
 * never be linked to two accounts (providerUserId is unique per provider).
 */
customerSocialAccountSchema.index({ provider: 1, providerUserId: 1 }, { unique: true });

/** At most one link per provider per customer account. */
customerSocialAccountSchema.index({ provider: 1, accountId: 1 }, { unique: true });

export type CustomerSocialAccountDoc = HydratedDocument<ICustomerSocialAccount>;

export const CustomerSocialAccountModel = model<ICustomerSocialAccount>(
  "CustomerSocialAccount",
  customerSocialAccountSchema,
);

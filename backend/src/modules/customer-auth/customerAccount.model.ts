import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export const CUSTOMER_ACCOUNT_STATUSES = ["Active", "Suspended"] as const;
export type CustomerAccountStatus = (typeof CUSTOMER_ACCOUNT_STATUSES)[number];

export interface ICustomerAccount {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  /** Linked CRM Customer (owner key for customer-owned resources). */
  customer: Types.ObjectId | null;
  status: CustomerAccountStatus;
  passwordChangedAt?: Date | null;
  emailVerifiedAt?: Date | null;
  /** Password reset infrastructure (single-use, time-bounded). */
  resetRequestId?: string;
  resetTokenHash?: string;
  resetTokenExpiresAt?: Date | null;
  /** Terms & Conditions / Privacy Policy acceptance (null for legacy records). */
  termsAcceptedAt?: Date | null;
  termsVersion?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const customerAccountSchema = new Schema<ICustomerAccount>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true },
    customer: { type: Schema.Types.ObjectId, ref: "Customer", default: null, index: true },
    status: { type: String, enum: [...CUSTOMER_ACCOUNT_STATUSES], default: "Active" },
    passwordChangedAt: { type: Date, default: null },
    emailVerifiedAt: { type: Date, default: null },
    resetRequestId: { type: String, index: true },
    resetTokenHash: { type: String, default: null },
    resetTokenExpiresAt: { type: Date, default: null },
    termsAcceptedAt: { type: Date, default: null },
    termsVersion: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

export type CustomerAccountDoc = HydratedDocument<ICustomerAccount>;

export const CustomerAccountModel = model<ICustomerAccount>(
  "CustomerAccount",
  customerAccountSchema,
);

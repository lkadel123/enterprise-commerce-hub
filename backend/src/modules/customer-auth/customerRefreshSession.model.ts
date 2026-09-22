import { Schema, model, type HydratedDocument, type Types } from "mongoose";

/**
 * Opaque customer refresh-token session. Deliberately separate from the admin
 * RefreshSession so customer sessions can never be confused with administrator
 * sessions and vice-versa.
 */
export interface ICustomerRefreshSession {
  _id: Types.ObjectId;
  customerAccountId: Types.ObjectId;
  tokenHash: string;
  ua?: string;
  ip?: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  rotatedFrom?: string;
  remember: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const customerRefreshSessionSchema = new Schema<ICustomerRefreshSession>(
  {
    customerAccountId: {
      type: Schema.Types.ObjectId,
      ref: "CustomerAccount",
      required: true,
      index: true,
    },
    tokenHash: { type: String, required: true, unique: true },
    ua: { type: String },
    ip: { type: String },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null },
    rotatedFrom: { type: String },
    remember: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

export type CustomerRefreshSessionDoc = HydratedDocument<ICustomerRefreshSession>;

export const CustomerRefreshSessionModel = model<ICustomerRefreshSession>(
  "CustomerRefreshSession",
  customerRefreshSessionSchema,
);

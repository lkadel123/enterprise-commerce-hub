import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface IRefreshSession {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
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

const refreshSessionSchema = new Schema<IRefreshSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
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

export type RefreshSessionDoc = HydratedDocument<IRefreshSession>;

export const RefreshSessionModel = model<IRefreshSession>("RefreshSession", refreshSessionSchema);

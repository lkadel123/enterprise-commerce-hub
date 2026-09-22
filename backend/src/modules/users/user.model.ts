import { Schema, model, type HydratedDocument, type Types } from "mongoose";
import { ROLE_NAMES } from "../../constants/roles.js";
import type { RoleName } from "../../constants/roles.js";
import type { UserStatus } from "./user.types.js";

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: RoleName;
  status: UserStatus;
  lastActiveAt?: Date | null;
  passwordChangedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: [...ROLE_NAMES], required: true, index: true, default: "Manager" },
    status: { type: String, enum: ["Active", "Invited", "Suspended"], default: "Active" },
    lastActiveAt: { type: Date },
    passwordChangedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

export type UserDoc = HydratedDocument<IUser>;

export const UserModel = model<IUser>("User", userSchema);

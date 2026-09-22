import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export const CUSTOMER_GROUPS = ["Retail", "Loyalty", "Wholesale"] as const;
export type CustomerGroup = (typeof CUSTOMER_GROUPS)[number];

export const CUSTOMER_STATUSES = ["Active", "New", "VIP", "Blocked"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export interface ICustomerAddress {
  line1?: string;
  line2?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}

export interface ICustomer {
  _id: Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  group: CustomerGroup;
  status: CustomerStatus;
  city?: string;
  address?: ICustomerAddress;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<ICustomer>(
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
    phone: { type: String, trim: true, maxlength: 40 },
    group: { type: String, enum: [...CUSTOMER_GROUPS], default: "Retail", index: true },
    status: { type: String, enum: [...CUSTOMER_STATUSES], default: "Active", index: true },
    city: { type: String, trim: true, maxlength: 100 },
    address: {
      line1: { type: String },
      line2: { type: String },
      city: { type: String },
      postalCode: { type: String },
      country: { type: String },
    },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false },
);

export type CustomerDoc = HydratedDocument<ICustomer>;

export const CustomerModel = model<ICustomer>("Customer", customerSchema);

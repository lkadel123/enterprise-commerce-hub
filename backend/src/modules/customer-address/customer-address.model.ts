import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface ICustomerAddress {
  _id: Types.ObjectId;
  customerAccountId: Types.ObjectId;
  label: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const customerAddressSchema = new Schema<ICustomerAddress>(
  {
    customerAccountId: {
      type: Schema.Types.ObjectId,
      ref: "CustomerAccount",
      required: true,
      index: true,
    },
    label: { type: String, required: true, trim: true, maxlength: 100 },
    line1: { type: String, required: true, trim: true, maxlength: 255 },
    line2: { type: String, trim: true, maxlength: 255 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    state: { type: String, trim: true, maxlength: 100 },
    postalCode: { type: String, required: true, trim: true, maxlength: 20 },
    country: { type: String, required: true, trim: true, maxlength: 100 },
    isDefault: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, versionKey: false },
);

export type CustomerAddressDoc = HydratedDocument<ICustomerAddress>;

export const CustomerAddressModel = model<ICustomerAddress>(
  "CustomerAddress",
  customerAddressSchema,
);

import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export const COUPON_TYPES = ["Percentage", "Fixed", "Free Shipping"] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export interface ICoupon {
  _id: Types.ObjectId;
  code: string;
  type: CouponType;
  value: number;
  minOrder: number;
  maxDiscount: number;
  usageLimit: number;
  perCustomerLimit: number;
  applicableCategories: Types.ObjectId[];
  startAt: Date;
  endAt: Date;
  used: number;
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<ICoupon>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 50,
    },
    type: { type: String, enum: [...COUPON_TYPES], required: true },
    value: { type: Number, required: true, min: 0 },
    minOrder: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: 0, min: 0 },
    usageLimit: { type: Number, default: 0, min: 0 },
    perCustomerLimit: { type: Number, default: 1, min: 0 },
    applicableCategories: [{ type: Schema.Types.ObjectId, ref: "Category" }],
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    used: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false },
);

couponSchema.index({ startAt: 1, endAt: 1 });

export type CouponDoc = HydratedDocument<ICoupon>;

export const CouponModel = model<ICoupon>("Coupon", couponSchema);

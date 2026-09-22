import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface ICouponRedemption {
  couponId: Types.ObjectId;
  customerId: Types.ObjectId;
  orderId?: Types.ObjectId;
  count: number;
  createdAt: Date;
  updatedAt: Date;
}

const couponRedemptionSchema = new Schema<ICouponRedemption>(
  {
    couponId: {
      type: Schema.Types.ObjectId,
      ref: "Coupon",
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
    },
    count: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  { timestamps: true, versionKey: false },
);

// Unique compound index: one redemption per coupon per customer
couponRedemptionSchema.index({ couponId: 1, customerId: 1 }, { unique: true });

export type CouponRedemptionDoc = HydratedDocument<ICouponRedemption>;

export const CouponRedemptionModel = model<ICouponRedemption>(
  "CouponRedemption",
  couponRedemptionSchema,
);

import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface IWishlistItem {
  product: Types.ObjectId;
  addedAt: Date;
}

export interface IWishlist {
  _id: Types.ObjectId;
  customerAccountId: Types.ObjectId;
  items: IWishlistItem[];
  createdAt: Date;
  updatedAt: Date;
}

const wishlistItemSchema = new Schema<IWishlistItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    addedAt: { type: Date, default: Date.now, required: true },
  },
  { _id: false },
);

const wishlistSchema = new Schema<IWishlist>(
  {
    customerAccountId: {
      type: Schema.Types.ObjectId,
      ref: "CustomerAccount",
      required: true,
      unique: true,
    },
    items: { type: [wishlistItemSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

// Unique index on customerAccountId (via `unique: true` above) ensures one wishlist per customer.

export type WishlistDoc = HydratedDocument<IWishlist>;

export const WishlistModel = model<IWishlist>("Wishlist", wishlistSchema);

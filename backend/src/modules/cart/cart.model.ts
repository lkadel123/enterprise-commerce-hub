import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface ICartItem {
  product: Types.ObjectId;
  quantity: number;
  price: number; // captured server-side at add time; never trust client
  name: string;
  slug: string;
  image: string | null;
}

export interface ICart {
  _id: Types.ObjectId;
  customerAccountId: Types.ObjectId;
  items: ICartItem[];
  createdAt: Date;
  updatedAt: Date;
}

const cartItemSchema = new Schema<ICartItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1, max: 999 },
    price: { type: Number, required: true, min: 0 },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, trim: true, maxlength: 200 },
    image: { type: String, default: null },
  },
  { _id: false },
);

const cartSchema = new Schema<ICart>(
  {
    customerAccountId: {
      type: Schema.Types.ObjectId,
      ref: "CustomerAccount",
      required: true,
      unique: true,
    },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

// Unique index on customerAccountId (via `unique: true` above) ensures one cart per customer.

export type CartDoc = HydratedDocument<ICart>;

export const CartModel = model<ICart>("Cart", cartSchema);

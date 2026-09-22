import { Types } from "mongoose";
import { WishlistModel } from "./wishlist.model.js";
import type { IWishlist } from "./wishlist.model.js";

export const wishlistRepository = {
  async findByCustomer(customerAccountId: string): Promise<IWishlist | null> {
    return (await WishlistModel.findOne({
      customerAccountId: new Types.ObjectId(customerAccountId),
    })
      .lean()
      .exec()) as unknown as IWishlist | null;
  },

  async getOrCreate(customerAccountId: string): Promise<IWishlist> {
    const existing = await this.findByCustomer(customerAccountId);
    if (existing) return existing;

    const doc = await WishlistModel.create({
      customerAccountId: new Types.ObjectId(customerAccountId),
      items: [],
    });
    return doc.toObject() as unknown as IWishlist;
  },

  async addItem(customerAccountId: string, productId: string): Promise<IWishlist> {
    return (await WishlistModel.findOneAndUpdate(
      { customerAccountId: new Types.ObjectId(customerAccountId) },
      {
        $addToSet: {
          items: {
            product: new Types.ObjectId(productId),
            addedAt: new Date(),
          },
        },
      },
      { new: true, upsert: true, runValidators: true },
    )
      .lean()
      .exec()) as unknown as IWishlist;
  },

  async removeItem(customerAccountId: string, productId: string): Promise<IWishlist | null> {
    return (await WishlistModel.findOneAndUpdate(
      { customerAccountId: new Types.ObjectId(customerAccountId) },
      {
        $pull: { items: { product: new Types.ObjectId(productId) } },
      },
      { new: true },
    )
      .lean()
      .exec()) as unknown as IWishlist | null;
  },

  async containsItem(customerAccountId: string, productId: string): Promise<boolean> {
    const result = await WishlistModel.exists({
      customerAccountId: new Types.ObjectId(customerAccountId),
      "items.product": new Types.ObjectId(productId),
    }).exec();
    return !!result;
  },

  async clearWishlist(customerAccountId: string): Promise<void> {
    await WishlistModel.updateOne(
      { customerAccountId: new Types.ObjectId(customerAccountId) },
      { $set: { items: [] } },
    ).exec();
  },

  async deleteWishlist(customerAccountId: string): Promise<void> {
    await WishlistModel.deleteOne({
      customerAccountId: new Types.ObjectId(customerAccountId),
    }).exec();
  },
};

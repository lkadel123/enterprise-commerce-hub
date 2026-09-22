import { Types } from "mongoose";
import { CartModel } from "./cart.model.js";
import type { ICart, ICartItem } from "./cart.model.js";

export const cartRepository = {
  async findByCustomer(customerAccountId: string): Promise<ICart | null> {
    return (await CartModel.findOne({
      customerAccountId: new Types.ObjectId(customerAccountId),
    })
      .lean()
      .exec()) as unknown as ICart | null;
  },

  async getOrCreate(customerAccountId: string): Promise<ICart> {
    const existing = await this.findByCustomer(customerAccountId);
    if (existing) return existing;

    const cart = await CartModel.create({
      customerAccountId: new Types.ObjectId(customerAccountId),
      items: [],
    });
    return cart.toObject() as unknown as ICart;
  },

  async addItem(
    customerAccountId: string,
    item: Omit<ICartItem, "image"> & { image?: string },
  ): Promise<ICart> {
    const cart = await this.getOrCreate(customerAccountId);

    const existingIndex = cart.items.findIndex(
      (i) => i.product.toString() === item.product.toString(),
    );

    let updatedCart: ICart | null;
    if (existingIndex >= 0) {
      const newQuantity = Math.min(cart.items[existingIndex].quantity + item.quantity, 999);
      updatedCart = (await CartModel.findOneAndUpdate(
        {
          customerAccountId: new Types.ObjectId(customerAccountId),
          "items.product": item.product,
        },
        { $set: { "items.$.quantity": newQuantity } },
        { new: true, runValidators: true },
      )
        .lean()
        .exec()) as unknown as ICart | null;
    } else {
      updatedCart = (await CartModel.findOneAndUpdate(
        {
          customerAccountId: new Types.ObjectId(customerAccountId),
        },
        {
          $push: {
            items: {
              product: item.product,
              quantity: item.quantity,
              price: item.price,
              name: item.name,
              slug: item.slug,
              image: item.image ?? null,
            },
          },
        },
        { new: true, runValidators: true },
      )
        .lean()
        .exec()) as unknown as ICart | null;
    }

    return updatedCart!;
  },

  async updateItemQuantity(
    customerAccountId: string,
    productId: string,
    quantity: number,
  ): Promise<ICart | null> {
    return (await CartModel.findOneAndUpdate(
      {
        customerAccountId: new Types.ObjectId(customerAccountId),
        "items.product": new Types.ObjectId(productId),
      },
      {
        $set: { "items.$.quantity": Math.min(quantity, 999) },
      },
      { new: true, runValidators: true },
    )
      .lean()
      .exec()) as unknown as ICart | null;
  },

  async removeItem(customerAccountId: string, productId: string): Promise<ICart | null> {
    return (await CartModel.findOneAndUpdate(
      { customerAccountId: new Types.ObjectId(customerAccountId) },
      {
        $pull: { items: { product: new Types.ObjectId(productId) } },
      },
      { new: true },
    )
      .lean()
      .exec()) as unknown as ICart | null;
  },

  async clearCart(customerAccountId: string): Promise<void> {
    await CartModel.updateOne(
      { customerAccountId: new Types.ObjectId(customerAccountId) },
      { $set: { items: [] } },
    ).exec();
  },

  async deleteCart(customerAccountId: string): Promise<void> {
    await CartModel.deleteOne({
      customerAccountId: new Types.ObjectId(customerAccountId),
    }).exec();
  },
};

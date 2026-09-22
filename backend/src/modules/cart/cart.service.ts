import { ProductModel } from "../products/product.model.js";
import { InventoryModel } from "../inventory/inventory.model.js";
import { notFound, badRequest } from "../../utils/ApiError.js";
import { cartRepository } from "./cart.repository.js";
import type { ICart } from "./cart.model.js";
import type { AddToCartInput, CartDto, CartItemDto, UpdateCartItemInput } from "./cart.types.js";

const MAX_QUANTITY = 999;

/**
 * Fetch product pricing and visibility from the database (server-authoritative).
 * Rejects inactive or non-searchable products, or missing products.
 */
async function fetchProductForCart(productId: string) {
  const product = await ProductModel.findById(productId).lean().exec();
  if (!product) {
    throw notFound("Product not found.");
  }
  // Only active + searchable products are purchasable from the customer site
  if (product.status !== "Active" || (product.searchable ?? true) === false) {
    throw badRequest("This product is not available.");
  }
  return product;
}

export { fetchProductForCart };

/**
 * Sum available stock for a product across all warehouses.
 */
async function getAvailableStock(productId: string): Promise<number> {
  const rows = await InventoryModel.find({ product: productId })
    .select("stock reserved")
    .lean()
    .exec();
  return rows.reduce((sum, row) => sum + Math.max(0, row.stock - row.reserved), 0);
}

/**
 * Remove items from the cart that correspond to products no longer purchasable.
 */
async function sanitizeCart(cart: ICart): Promise<ICart> {
  const productIds = cart.items.map((i) => i.product.toString());
  if (productIds.length === 0) return cart;

  const availableProducts = await ProductModel.find({
    _id: { $in: productIds },
    status: "Active",
    searchable: { $ne: false },
  })
    .lean()
    .exec();

  const availableIds = new Set(availableProducts.map((p) => p._id.toString()));
  const keptItems = cart.items.filter((i) => availableIds.has(i.product.toString()));

  if (keptItems.length !== cart.items.length) {
    await cartRepository.clearCart(cart.customerAccountId.toString());
    for (const item of keptItems) {
      await cartRepository.addItem(cart.customerAccountId.toString(), {
        product: item.product,
        quantity: item.quantity,
        price: item.price,
        name: item.name,
        slug: item.slug,
        image: item.image ?? undefined,
      });
    }
    const refreshed = await cartRepository.findByCustomer(cart.customerAccountId.toString());
    return refreshed!;
  }
  return cart;
}

function emptyCartDto(): CartDto {
  const now = new Date().toISOString();
  return {
    id: "",
    items: [],
    itemCount: 0,
    subtotal: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Transform a stored ICart into the public CartDto, re-fetching current prices
 * and stock server-side so clients cannot manipulate pricing.
 */
async function toCartDto(cart: ICart): Promise<CartDto> {
  const sanitized = await sanitizeCart(cart);
  const productIds = sanitized.items.map((i) => i.product.toString());

  const [products, stockMap] = await Promise.all([
    productIds.length > 0
      ? ProductModel.find({ _id: { $in: productIds } })
          .lean()
          .exec()
      : [],
    productIds.length > 0
      ? InventoryModel.aggregate<{ _id: string; available: number }>([
          { $match: { product: { $in: productIds } } },
          {
            $group: {
              _id: "$product",
              available: { $sum: { $subtract: ["$stock", "$reserved"] } },
            },
          },
        ]).exec()
      : [],
  ]);

  const stockByProduct = new Map<string, number>();
  for (const row of stockMap) {
    stockByProduct.set(row._id.toString(), Math.max(0, row.available));
  }
  const productMap = new Map<string, (typeof products)[number]>();
  for (const prod of products) {
    productMap.set(prod._id.toString(), prod);
  }

  const items: CartItemDto[] = [];
  let subtotal = 0;

  for (const item of sanitized.items) {
    const productId = item.product.toString();
    const product = productMap.get(productId);
    const available = stockByProduct.get(productId) ?? 0;

    if (product && product.status === "Active" && (product.searchable ?? true) !== false) {
      const unitPrice = Math.max(0, product.price);
      items.push({
        id: productId,
        productId,
        quantity: item.quantity,
        price: unitPrice,
        name: item.name,
        slug: item.slug,
        image: item.image ?? null,
        availableStock: available,
      });
      subtotal += unitPrice * item.quantity;
    }
  }

  return {
    id: sanitized._id.toString(),
    items,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    subtotal: Math.round(subtotal * 100) / 100,
    createdAt: new Date(sanitized.createdAt).toISOString(),
    updatedAt: new Date(sanitized.updatedAt).toISOString(),
  };
}

export const cartService = {
  async getCart(customerAccountId: string): Promise<CartDto> {
    const cart = await cartRepository.findByCustomer(customerAccountId);
    if (!cart) return emptyCartDto();
    return toCartDto(cart);
  },

  async addItemToCart(customerAccountId: string, input: AddToCartInput): Promise<CartDto> {
    const product = await fetchProductForCart(input.productId);
    const availableStock = await getAvailableStock(input.productId);

    const quantity = Math.min(input.quantity ?? 1, MAX_QUANTITY);
    if (quantity > availableStock) {
      throw badRequest(`Only ${availableStock} item(s) of this product are available in stock.`);
    }

    const cart = await cartRepository.addItem(customerAccountId, {
      product: product._id,
      quantity,
      price: Math.max(0, product.price),
      name: product.name,
      slug: product.slug,
      image: product.images?.[0]?.url ?? null,
    });
    return toCartDto(cart);
  },

  async updateItemQuantity(
    customerAccountId: string,
    productId: string,
    input: UpdateCartItemInput,
  ): Promise<CartDto> {
    await fetchProductForCart(productId);
    const availableStock = await getAvailableStock(productId);

    const quantity = Math.min(input.quantity, MAX_QUANTITY);
    if (quantity > availableStock) {
      throw badRequest(`Only ${availableStock} item(s) of this product are available in stock.`);
    }

    const cart = await cartRepository.updateItemQuantity(customerAccountId, productId, quantity);
    if (!cart) throw notFound("Cart item not found.");
    return toCartDto(cart);
  },

  async removeItem(customerAccountId: string, productId: string): Promise<CartDto> {
    await fetchProductForCart(productId);
    const cart = await cartRepository.removeItem(customerAccountId, productId);
    if (!cart) throw notFound("Cart not found.");
    return toCartDto(cart);
  },

  async clearCart(customerAccountId: string): Promise<CartDto> {
    await cartRepository.clearCart(customerAccountId);
    const cart = await cartRepository.findByCustomer(customerAccountId);
    if (cart) return toCartDto(cart);
    return emptyCartDto();
  },

  /**
   * Merge a local (client-side) cart into the server cart.
   * Supports "client cart migration": when an anonymous user authenticates,
   * their persisted local cart is merged server-side.
   */
  async mergeCart(
    customerAccountId: string,
    localItems: Array<{ productId: string; quantity: number }>,
  ): Promise<CartDto> {
    const productIds = localItems.map((i) => i.productId);
    const products = await ProductModel.find({
      _id: { $in: productIds },
      status: "Active",
      searchable: { $ne: false },
    })
      .lean()
      .exec();

    const productMap = new Map<string, (typeof products)[number]>();
    for (const prod of products) productMap.set(prod._id.toString(), prod);

    const quantityByProduct = new Map<string, number>();
    for (const localItem of localItems) {
      if (productMap.has(localItem.productId)) {
        const existing = quantityByProduct.get(localItem.productId) ?? 0;
        quantityByProduct.set(
          localItem.productId,
          Math.min(existing + localItem.quantity, MAX_QUANTITY),
        );
      }
    }

    for (const [productId, quantity] of quantityByProduct) {
      const product = productMap.get(productId)!;
      const availableStock = await getAvailableStock(productId);
      const adjustedQuantity = Math.min(quantity, availableStock, MAX_QUANTITY);
      if (adjustedQuantity > 0) {
        await cartRepository.addItem(customerAccountId, {
          product: product._id,
          quantity: adjustedQuantity,
          price: Math.max(0, product.price),
          name: product.name,
          slug: product.slug,
          image: product.images?.[0]?.url ?? null,
        });
      }
    }

    const cart = await cartRepository.findByCustomer(customerAccountId);
    return toCartDto(cart!);
  },
};

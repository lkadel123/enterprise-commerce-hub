import { ProductModel } from "../products/product.model.js";
import { InventoryModel } from "../inventory/inventory.model.js";
import { notFound, badRequest } from "../../utils/ApiError.js";
import { wishlistRepository } from "./wishlist.repository.js";
import type { IWishlistItem, IWishlist } from "./wishlist.model.js";
import type { AddToWishlistInput, WishlistDto, WishlistItemDto } from "./wishlist.types.js";

/**
 * Fetch product for wishlist display: must be visible + purchasable.
 */
async function fetchProductForWishlist(productId: string) {
  const product = await ProductModel.findById(productId).lean().exec();
  if (!product) {
    throw notFound("Product not found.");
  }
  if (product.status !== "Active" || (product.searchable ?? true) === false) {
    throw badRequest("This product is not available.");
  }
  return product;
}

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

export { getAvailableStock };

/**
 * Build a product DTO for wishlist display.
 */
function toWishlistItemDto(
  item: IWishlistItem,
  product: {
    name: string;
    slug: string;
    price: number;
    images?: Array<{ url: string }> | null;
  },
  stock: number,
): WishlistItemDto {
  return {
    id: item.product.toString(),
    productId: item.product.toString(),
    name: product.name,
    slug: product.slug,
    price: Math.max(0, product.price),
    image: product.images?.[0]?.url ?? null,
    inStock: stock > 0,
    addedAt: new Date(item.addedAt).toISOString(),
  };
}

/**
 * Transform a stored IWishlist into the public WishlistDto, re-fetching
 * current product data (prices, names, stock) server-side.
 */
async function toWishlistDto(wishlist: IWishlist): Promise<WishlistDto> {
  const productIds = wishlist.items.map((i) => i.product.toString());
  if (productIds.length === 0) {
    return {
      id: wishlist._id.toString(),
      items: [],
      itemCount: 0,
      createdAt: new Date(wishlist.createdAt).toISOString(),
      updatedAt: new Date(wishlist.updatedAt).toISOString(),
    };
  }

  const [products, stockMap] = await Promise.all([
    ProductModel.find({
      _id: { $in: productIds },
      status: "Active",
      searchable: { $ne: false },
    })
      .lean()
      .exec(),
    InventoryModel.aggregate<{ _id: string; available: number }>([
      { $match: { product: { $in: productIds } } },
      {
        $group: {
          _id: "$product",
          available: { $sum: { $subtract: ["$stock", "$reserved"] } },
        },
      },
    ]).exec(),
  ]);

  const stockByProduct = new Map<string, number>();
  for (const row of stockMap) {
    stockByProduct.set(row._id.toString(), Math.max(0, row.available));
  }

  const productMap = new Map<string, (typeof products)[number]>();
  for (const prod of products) {
    productMap.set(prod._id.toString(), prod);
  }

  const items: WishlistItemDto[] = [];
  for (const item of wishlist.items) {
    const productId = item.product.toString();
    const product = productMap.get(productId);
    if (!product) continue; // product deactivated/deleted — skip

    items.push(toWishlistItemDto(item, product, stockByProduct.get(productId) ?? 0));
  }

  return {
    id: wishlist._id.toString(),
    items,
    itemCount: items.length,
    createdAt: new Date(wishlist.createdAt).toISOString(),
    updatedAt: new Date(wishlist.updatedAt).toISOString(),
  };
}

function emptyWishlistDto(): WishlistDto {
  const now = new Date().toISOString();
  return {
    id: "",
    items: [],
    itemCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export const wishlistService = {
  async getWishlist(customerAccountId: string): Promise<WishlistDto> {
    const wishlist = await wishlistRepository.findByCustomer(customerAccountId);
    if (!wishlist) return emptyWishlistDto();
    return toWishlistDto(wishlist);
  },

  async addItem(customerAccountId: string, input: AddToWishlistInput): Promise<WishlistDto> {
    // Verify the product is purchasable before adding to wishlist
    await fetchProductForWishlist(input.productId);

    const wishlist = await wishlistRepository.addItem(customerAccountId, input.productId);
    return toWishlistDto(wishlist);
  },

  async removeItem(customerAccountId: string, productId: string): Promise<WishlistDto> {
    const wishlist = await wishlistRepository.removeItem(customerAccountId, productId);
    if (!wishlist) throw notFound("Wishlist not found.");
    return toWishlistDto(wishlist);
  },

  async containsItem(
    customerAccountId: string,
    productId: string,
  ): Promise<{ inWishlist: boolean }> {
    const inWishlist = await wishlistRepository.containsItem(customerAccountId, productId);
    return { inWishlist };
  },
};

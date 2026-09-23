import { badRequest, conflict, notFound } from "../../utils/ApiError.js";
import { slugify } from "../../utils/slugify.js";
import { brandRepository } from "../brands/brand.repository.js";
import { categoryRepository } from "../categories/category.repository.js";
import { CartModel } from "../cart/cart.model.js";
import { InventoryModel } from "../inventory/inventory.model.js";
import { ReviewModel } from "../reviews/review.model.js";
import { WishlistModel } from "../wishlist/wishlist.model.js";
import { productRepository, type ProductListParams } from "./product.repository.js";
import type { ProductRecord } from "./product.types.js";
import type { CreateProductInput, ProductDto, UpdateProductInput } from "./product.types.js";

function toDto(product: ProductRecord, stock: number, reserved: number): ProductDto {
  return {
    id: product._id.toString(),
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    description: product.description ?? null,
    category: product.category
      ? { id: product.category._id.toString(), name: product.category.name }
      : null,
    brand: product.brand ? { id: product.brand._id.toString(), name: product.brand.name } : null,
    price: product.price,
    cost: product.cost,
    status: product.status,
    rating: product.rating,
    reviewsCount: product.reviewsCount,
    featured: product.featured,
    searchable: product.searchable,
    stock,
    reserved,
    images: product.images ?? [],
    variations: product.variations ?? [],
    shipping: product.shipping ?? {},
    seo: product.seo ?? {},
    createdAt: new Date(product.createdAt).toISOString(),
    updatedAt: new Date(product.updatedAt).toISOString(),
  };
}

export const productService = {
  async list(params: ProductListParams) {
    const { items, meta } = await productRepository.list(params);
    const totals = await productRepository.inventoryTotals(
      items.map((item) => item._id.toString()),
    );
    return {
      items: items.map((product) => {
        const stock = totals.get(product._id.toString())?.stock ?? 0;
        const reserved = totals.get(product._id.toString())?.reserved ?? 0;
        return toDto(product, stock, reserved);
      }),
      meta,
    };
  },

  async getById(id: string): Promise<ProductDto> {
    const product = await productRepository.findByIdPopulated(id);
    if (!product) throw notFound("Product not found.");
    const totals = await productRepository.inventoryTotals([id]);
    const stock = totals.get(id)?.stock ?? 0;
    const reserved = totals.get(id)?.reserved ?? 0;
    return toDto(product, stock, reserved);
  },

  async create(input: CreateProductInput): Promise<ProductDto> {
    await productService.assertRefs(input.categoryId, input.brandId);

    const product = await productRepository.create({
      name: input.name,
      sku: input.sku.toUpperCase(),
      description: input.description,
      categoryId: input.categoryId ?? null,
      brandId: input.brandId ?? null,
      price: input.price,
      cost: input.cost,
      status: input.status ?? "Draft",
      featured: input.featured ?? false,
      searchable: input.searchable ?? true,
      images: input.images ?? [],
      variations: input.variations ?? [],
      shipping: input.shipping ?? {},
      seo: input.seo ?? {},
      slug: slugify(input.name),
    });

    return toDto(product as unknown as ProductRecord, 0, 0);
  },

  async update(id: string, input: UpdateProductInput): Promise<ProductDto> {
    const existing = await productRepository.findById(id);
    if (!existing) throw notFound("Product not found.");

    await productService.assertRefs(input.categoryId, input.brandId);

    const patch: UpdateProductInput = {};
    if (input.name) patch.name = input.name;
    if (input.sku) patch.sku = input.sku.toUpperCase();
    if ("description" in input) patch.description = input.description;
    if ("categoryId" in input) patch.categoryId = input.categoryId ?? null;
    if ("brandId" in input) patch.brandId = input.brandId ?? null;
    if ("price" in input) patch.price = input.price;
    if ("cost" in input) patch.cost = input.cost;
    if (input.status) patch.status = input.status;
    if ("featured" in input) patch.featured = input.featured;
    if ("searchable" in input) patch.searchable = input.searchable;
    if (input.images) patch.images = input.images;
    if (input.variations) patch.variations = input.variations;
    if (input.shipping) patch.shipping = input.shipping;
    if (input.seo) patch.seo = input.seo;

    const updated = await productRepository.updateById(id, patch);
    if (!updated) throw notFound("Product not found.");

    return productService.getById(id);
  },

  async setStatus(id: string, status: ProductDto["status"]): Promise<ProductDto> {
    const updated = await productRepository.updateById(id, { status });
    if (!updated) throw notFound("Product not found.");
    return productService.getById(id);
  },

  async remove(id: string): Promise<void> {
    const product = await productRepository.findById(id);
    if (!product) throw notFound("Product not found.");

    // Phase 16 — dependency-aware destructive deletion. Orders embed line-item
    // snapshots, so order history survives a delete; but live operational
    // references (inventory, reviews, carts, wishlists) must never be orphaned.
    // Physical delete is permitted ONLY when the product has no dependents;
    // otherwise the caller must archive it instead.
    const [inventoryCount, reviewCount, cartCount, wishlistCount] = await Promise.all([
      InventoryModel.countDocuments({ product: id }).exec(),
      ReviewModel.countDocuments({ product: id }).exec(),
      CartModel.countDocuments({ "items.product": id }).exec(),
      WishlistModel.countDocuments({ "items.product": id }).exec(),
    ]);

    const dependents: string[] = [];
    if (inventoryCount > 0) dependents.push(`${inventoryCount} inventory record(s)`);
    if (reviewCount > 0) dependents.push(`${reviewCount} review(s)`);
    if (cartCount > 0) dependents.push(`${cartCount} cart(s)`);
    if (wishlistCount > 0) dependents.push(`${wishlistCount} wishlist(s)`);

    if (dependents.length > 0) {
      throw conflict(
        `Product has dependent records (${dependents.join(", ")}). ` +
          'Set its status to "Archived" instead of deleting it.',
      );
    }

    await productRepository.deleteById(id);
  },

  async assertRefs(categoryId?: string | null, brandId?: string | null): Promise<void> {
    if (categoryId) {
      const category = await categoryRepository.findById(categoryId);
      if (!category) throw badRequest("Category does not exist.");
    }
    if (brandId) {
      const brand = await brandRepository.findById(brandId);
      if (!brand) throw badRequest("Brand does not exist.");
    }
  },
};

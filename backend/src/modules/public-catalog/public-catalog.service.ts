import { notFound } from "../../utils/ApiError.js";
import { env } from "../../config/env.js";
import type {
  IProduct,
  IProductSeo,
  IProductShipping,
  IProductVariation,
  IProductImage,
} from "../products/product.model.js";
import { mediaRepository } from "../media/media.repository.js";
import type { IMedia } from "../media/media.model.js";
import {
  publicCatalogRepository,
  type PublicProductListParams,
} from "./public-catalog.repository.js";
import type {
  PublicBannerDto,
  PublicBrandDto,
  PublicCategoryDto,
  PublicProductDto,
  PublicRef,
  PublicReviewDto,
  PublicSearchSuggestionDto,
} from "./public-catalog.types.js";

interface PopulatedRef {
  _id: unknown;
  name: string;
  slug?: string;
}

interface PopulatedBannerImage {
  url: string;
  alt: string | null;
  mimeType: string;
}

function refFrom(value: PopulatedRef | null | undefined): PublicRef | null {
  if (!value) return null;
  return { id: String(value._id), name: value.name, slug: value.slug ?? "" };
}

function enrichProductImages(
  images: IProductImage[],
  imageMedia?: Map<string, IMedia>,
): IProductImage[] {
  if (!imageMedia || imageMedia.size === 0) return images as IProductImage[];
  return images.map((img) => {
    const media = imageMedia.get(img.url);
    if (!media) return img;
    return {
      ...img,
      ...(media.width ? { width: media.width } : {}),
      ...(media.height ? { height: media.height } : {}),
      ...(media.variants && media.variants.length ? { variants: media.variants } : {}),
    };
  });
}

/** One batched lookup mapping each product image URL to its Media record (no N+1). */
async function buildImageMediaMap(products: IProduct[]): Promise<Map<string, IMedia>> {
  const urls = Array.from(new Set(products.flatMap((p) => (p.images ?? []).map((i) => i.url))));
  if (urls.length === 0) return new Map();
  const media = await mediaRepository.findByUrls(urls);
  return new Map(media.map((m) => [m.url, m]));
}

function publicProductDto(
  product: IProduct,
  stock: number,
  imageMedia?: Map<string, IMedia>,
): PublicProductDto {
  const seo = (product.seo ?? {}) as IProductSeo;
  const shipping = (product.shipping ?? {}) as IProductShipping;
  return {
    id: product._id.toString(),
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    description: product.description ?? null,
    category: refFrom(product.category as unknown as PopulatedRef | null),
    brand: refFrom(product.brand as unknown as PopulatedRef | null),
    price: product.price,
    stock,
    status: product.status,
    rating: product.rating,
    reviewsCount: product.reviewsCount,
    featured: product.featured,
    images: enrichProductImages(product.images ?? [], imageMedia),
    variations: (product.variations ?? []) as IProductVariation[],
    shipping,
    seo,
    createdAt: new Date(product.createdAt).toISOString(),
    updatedAt: new Date(product.updatedAt).toISOString(),
  };
}

function isPubliclyVisible(product: IProduct): boolean {
  return product.status === "Active" && product.searchable !== false;
}

/** Public origin used to build absolute SEO URLs (reuses the existing configured public base URL). */
function publicSeoBaseUrl(): string {
  return env.PUBLIC_BASE_URL.replace(/\/+$/, "");
}

/** Escape the five XML special characters so malformed data cannot break sitemap.xml. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const publicCatalogService = {
  async listProducts(params: PublicProductListParams) {
    const category = params.category
      ? await publicCatalogRepository.resolveCategory(params.category)
      : null;
    const brand = params.brand ? await publicCatalogRepository.resolveBrand(params.brand) : null;

    const { items, meta } = await publicCatalogRepository.listProducts(
      params,
      category ? category._id.toString() : undefined,
      brand ? brand._id.toString() : undefined,
    );

    const [totals, imageMedia] = await Promise.all([
      publicCatalogRepository.inventoryTotals(items.map((p) => p._id.toString())),
      buildImageMediaMap(items),
    ]);
    return {
      items: items.map((p) =>
        publicProductDto(p, totals.get(p._id.toString())?.available ?? 0, imageMedia),
      ),
      meta,
    };
  },

  async getProduct(identifier: string): Promise<PublicProductDto> {
    const product = await publicCatalogRepository.findProductByIdOrSlug(identifier);
    if (!product || !isPubliclyVisible(product)) throw notFound("Product not found.");
    const [totals, imageMedia] = await Promise.all([
      publicCatalogRepository.inventoryTotals([product._id.toString()]),
      buildImageMediaMap([product]),
    ]);
    return publicProductDto(product, totals.get(product._id.toString())?.available ?? 0, imageMedia);
  },

  async getProductReviews(identifier: string, params: { page?: number; pageSize?: number }) {
    const product = await publicCatalogRepository.findProductByIdOrSlug(identifier);
    if (!product || !isPubliclyVisible(product)) throw notFound("Product not found.");

    const { items, meta } = await publicCatalogRepository.listApprovedReviews(
      product._id.toString(),
      params,
    );
    const reviews: PublicReviewDto[] = items.map((review) => ({
      id: review._id.toString(),
      customer: review.customer
        ? {
            id: String((review.customer as unknown as PopulatedRef)._id),
            name: (review.customer as unknown as PopulatedRef).name,
          }
        : null,
      rating: review.rating,
      title: review.title ?? null,
      body: review.body,
      helpfulCount: review.helpfulCount,
      createdAt: new Date(review.createdAt).toISOString(),
    }));
    return { items: reviews, meta };
  },

  async listCategories(params: { q?: string; page?: number; pageSize?: number; sort?: string }) {
    const { items, meta } = await publicCatalogRepository.listCategories(params);
    const counts = await publicCatalogRepository.productCountsByCategory();
    const publicItems: PublicCategoryDto[] = await Promise.all(
      items.map(async (cat) => {
        const parent = cat.parent
          ? await publicCatalogRepository.findCategoryById(cat.parent.toString())
          : null;
        return {
          id: cat._id.toString(),
          name: cat.name,
          slug: cat.slug,
          parent: parent ? { id: parent._id.toString(), name: parent.name } : null,
          description: cat.description ?? null,
          sort: cat.sort,
          productCount: counts[cat._id.toString()] ?? 0,
        };
      }),
    );
    return { items: publicItems, meta };
  },

  async getCategory(identifier: string): Promise<PublicCategoryDto> {
    const category = await publicCatalogRepository.resolveCategory(identifier);
    if (!category) throw notFound("Category not found.");
    const counts = await publicCatalogRepository.productCountsByCategory();
    const parent = category.parent
      ? await publicCatalogRepository.findCategoryById(category.parent.toString())
      : null;
    return {
      id: category._id.toString(),
      name: category.name,
      slug: category.slug,
      parent: parent ? { id: parent._id.toString(), name: parent.name } : null,
      description: category.description ?? null,
      sort: category.sort,
      productCount: counts[category._id.toString()] ?? 0,
    };
  },

  async listBrands(params: { q?: string; page?: number; pageSize?: number; sort?: string }) {
    const { items, meta } = await publicCatalogRepository.listBrands(params);
    const counts = await publicCatalogRepository.productCountsByBrand();
    const publicItems: PublicBrandDto[] = items.map((brand) => ({
      id: brand._id.toString(),
      name: brand.name,
      slug: brand.slug,
      description: brand.description ?? null,
      logoUrl: brand.logoUrl ?? null,
      productCount: counts[brand._id.toString()] ?? 0,
    }));
    return { items: publicItems, meta };
  },

  async getBrand(identifier: string): Promise<PublicBrandDto> {
    const brand = await publicCatalogRepository.resolveBrand(identifier);
    if (!brand) throw notFound("Brand not found.");
    const counts = await publicCatalogRepository.productCountsByBrand();
    return {
      id: brand._id.toString(),
      name: brand.name,
      slug: brand.slug,
      description: brand.description ?? null,
      logoUrl: brand.logoUrl ?? null,
      productCount: counts[brand._id.toString()] ?? 0,
    };
  },

  async listBanners(): Promise<PublicBannerDto[]> {
    const banners = await publicCatalogRepository.listActiveBanners();
    return banners.map((banner) => ({
      id: banner._id.toString(),
      title: banner.title,
      image: banner.image
        ? {
            url: (banner.image as unknown as PopulatedBannerImage).url,
            alt: (banner.image as unknown as PopulatedBannerImage).alt ?? null,
            mimeType: (banner.image as unknown as PopulatedBannerImage).mimeType,
          }
        : null,
      linkUrl: banner.linkUrl ?? null,
      sortOrder: banner.sortOrder,
      startAt: banner.startAt ? new Date(banner.startAt).toISOString() : null,
      endAt: banner.endAt ? new Date(banner.endAt).toISOString() : null,
    }));
  },

  async searchSuggestions(q: string): Promise<PublicSearchSuggestionDto> {
    const suggestions = await publicCatalogRepository.searchSuggestions(q, 8);
    return { q, suggestions };
  },

  /** Public sitemap built from real, publicly-visible catalog records — products, categories, brands. */
  async sitemap(): Promise<string> {
    const base = publicSeoBaseUrl();
    const [products, categories, brands] = await Promise.all([
      publicCatalogRepository.listPublicProductSlugs(),
      publicCatalogRepository.listPublicCategorySlugs(),
      publicCatalogRepository.listPublicBrandSlugs(),
    ]);

    const locs: string[] = [];
    for (const slug of products) locs.push(`${base}/api/v1/public/products/${slug}`);
    for (const slug of categories) locs.push(`${base}/api/v1/public/categories/${slug}`);
    for (const slug of brands) locs.push(`${base}/api/v1/public/brands/${slug}`);

    const urls = locs.map((loc) => `  <url><loc>${escapeXml(loc)}</loc></url>`).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
  },

  /** robots.txt crawler policy referencing the actual, served sitemap URL. */
  async robotsTxt(): Promise<string> {
    const sitemapUrl = `${publicSeoBaseUrl()}/api/v1/public/sitemap.xml`;
    return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
  },
};

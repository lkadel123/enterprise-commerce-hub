import type { ProductStatus } from "../products/product.model.js";
import type {
  IProductImage,
  IProductVariation,
  IProductShipping,
  IProductSeo,
} from "../products/product.model.js";

export interface PublicRef {
  id: string;
  name: string;
  slug: string;
}

export interface PublicProductDto {
  id: string;
  name: string;
  slug: string;
  sku: string;
  description: string | null;
  category: PublicRef | null;
  brand: PublicRef | null;
  price: number;
  stock: number;
  status: ProductStatus;
  rating: number;
  reviewsCount: number;
  featured: boolean;
  images: IProductImage[];
  variations: IProductVariation[];
  shipping: IProductShipping;
  seo: IProductSeo;
  createdAt: string;
  updatedAt: string;
}

export interface PublicCategoryDto {
  id: string;
  name: string;
  slug: string;
  parent: { id: string; name: string } | null;
  description: string | null;
  sort: number;
  productCount: number;
}

export interface PublicBrandDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  productCount: number;
}

export interface PublicReviewDto {
  id: string;
  customer: { id: string; name: string } | null;
  rating: number;
  title: string | null;
  body: string;
  helpfulCount: number;
  createdAt: string;
}

export interface PublicBannerImageDto {
  url: string;
  alt: string | null;
  mimeType: string;
}

export interface PublicBannerDto {
  id: string;
  title: string;
  image: PublicBannerImageDto | null;
  linkUrl: string | null;
  sortOrder: number;
  startAt: string | null;
  endAt: string | null;
}

export interface PublicSearchSuggestionDto {
  q: string;
  suggestions: string[];
}

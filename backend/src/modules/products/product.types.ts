import type { Types } from "mongoose";
import type {
  IProduct,
  IProductImage,
  IProductSeo,
  IProductShipping,
  IProductVariation,
  ProductStatus,
} from "./product.model.js";

export interface RefDto {
  id: string;
  name: string;
}

export interface ProductDto {
  id: string;
  name: string;
  slug: string;
  sku: string;
  description: string | null;
  category: RefDto | null;
  brand: RefDto | null;
  price: number;
  cost: number;
  status: ProductStatus;
  rating: number;
  reviewsCount: number;
  featured: boolean;
  searchable: boolean;
  stock: number;
  reserved: number;
  images: IProductImage[];
  variations: IProductVariation[];
  shipping: IProductShipping;
  seo: IProductSeo;
  createdAt: string;
  updatedAt: string;
}

export interface PopulatedProductRef {
  _id: Types.ObjectId;
  name: string;
}

/** Product document with category/brand already populated (name only). */
export interface ProductRecord extends Omit<IProduct, "category" | "brand"> {
  category: PopulatedProductRef | null;
  brand: PopulatedProductRef | null;
}

export interface CreateProductInput {
  name: string;
  sku: string;
  description?: string;
  categoryId?: string | null;
  brandId?: string | null;
  price: number;
  cost: number;
  status?: ProductStatus;
  featured?: boolean;
  searchable?: boolean;
  images?: IProductImage[];
  variations?: IProductVariation[];
  shipping?: IProductShipping;
  seo?: IProductSeo;
}

export type UpdateProductInput = Partial<CreateProductInput>;

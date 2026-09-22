import type { BrandStatus } from "./brand.model.js";

export interface BrandDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  status: BrandStatus;
  productCount: number;
  createdAt: string;
}

export interface CreateBrandInput {
  name: string;
  description?: string;
  logoUrl?: string;
  status?: BrandStatus;
}

export interface UpdateBrandInput {
  name?: string;
  description?: string | null;
  logoUrl?: string | null;
  status?: BrandStatus;
}

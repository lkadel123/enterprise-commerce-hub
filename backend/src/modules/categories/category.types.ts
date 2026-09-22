import type { CategoryStatus } from "./category.model.js";

export interface CategoryRef {
  id: string;
  name: string;
}

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  parent: CategoryRef | null;
  description: string | null;
  sort: number;
  status: CategoryStatus;
  productCount: number;
  createdAt: string;
}

export interface CreateCategoryInput {
  name: string;
  description?: string;
  parentId?: string | null;
  sort?: number;
  status?: CategoryStatus;
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string | null;
  parentId?: string | null;
  sort?: number;
  status?: CategoryStatus;
}

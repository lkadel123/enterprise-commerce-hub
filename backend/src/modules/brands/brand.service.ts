import { conflict, notFound } from "../../utils/ApiError.js";
import { slugify } from "../../utils/slugify.js";
import { brandRepository, type BrandListParams } from "./brand.repository.js";
import type { IBrand } from "./brand.model.js";
import type { BrandDto, CreateBrandInput, UpdateBrandInput } from "./brand.types.js";

function toDto(brand: IBrand, productCount: number): BrandDto {
  return {
    id: brand._id.toString(),
    name: brand.name,
    slug: brand.slug,
    description: brand.description ?? null,
    logoUrl: brand.logoUrl ?? null,
    status: brand.status,
    productCount,
    createdAt: new Date(brand.createdAt).toISOString(),
  };
}

export const brandService = {
  async list(params: BrandListParams) {
    const { items, meta } = await brandRepository.list(params);
    const counts = await brandRepository.productCountsByBrand();
    return {
      items: items.map((brand) => toDto(brand, counts[brand._id.toString()] ?? 0)),
      meta,
    };
  },

  async getById(id: string): Promise<BrandDto> {
    const brand = await brandRepository.findById(id);
    if (!brand) throw notFound("Brand not found.");
    const counts = await brandRepository.productCountsByBrand();
    return toDto(brand, counts[id] ?? 0);
  },

  async create(input: CreateBrandInput): Promise<BrandDto> {
    const existing = await brandRepository.findByName(input.name);
    if (existing) throw conflict("A brand with this name already exists.");

    const slug = slugify(input.name);
    const slugClash = await brandRepository.findBySlug(slug);
    if (slugClash) {
      throw conflict(`A brand with the slug "${slug}" already exists. Choose a different name.`);
    }

    const brand = await brandRepository.create({
      name: input.name,
      description: input.description,
      logoUrl: input.logoUrl,
      status: input.status ?? "Active",
      slug: slugify(input.name),
    });

    return toDto(brand, 0);
  },

  async update(id: string, input: UpdateBrandInput): Promise<BrandDto> {
    const existing = await brandRepository.findById(id);
    if (!existing) throw notFound("Brand not found.");

    if (input.name && input.name !== existing.name) {
      const duplicate = await brandRepository.findByName(input.name);
      if (duplicate && duplicate._id.toString() !== id) {
        throw conflict("A brand with this name already exists.");
      }
      // NOTE: the slug stays stable on rename (deliberate policy), so a rename
      // can never collide on slug — no slug pre-check here (Phase 19).
    }

    const patch: UpdateBrandInput = {};
    if (input.name) patch.name = input.name;
    if ("description" in input) patch.description = input.description ?? null;
    if ("logoUrl" in input) patch.logoUrl = input.logoUrl ?? null;
    if (input.status) patch.status = input.status;

    const updated = await brandRepository.updateById(id, patch);
    if (!updated) throw notFound("Brand not found.");

    const counts = await brandRepository.productCountsByBrand();
    return toDto(updated, counts[id] ?? 0);
  },

  async remove(id: string): Promise<void> {
    const brand = await brandRepository.findById(id);
    if (!brand) throw notFound("Brand not found.");

    const counts = await brandRepository.productCountsByBrand();
    if ((counts[id] ?? 0) > 0) {
      throw conflict("Brand has products assigned. Reassign or delete those products first.");
    }

    await brandRepository.deleteById(id);
  },
};

import { conflict, notFound, badRequest } from "../../utils/ApiError.js";
import { slugify } from "../../utils/slugify.js";
import { categoryRepository, type CategoryListParams } from "./category.repository.js";
import type { ICategory } from "./category.model.js";
import type { CreateCategoryInput, UpdateCategoryInput, CategoryDto } from "./category.types.js";

function toDto(category: ICategory, parentName: string | null, productCount: number): CategoryDto {
  return {
    id: category._id.toString(),
    name: category.name,
    slug: category.slug,
    parent: category.parent ? { id: category.parent.toString(), name: parentName ?? "" } : null,
    description: category.description ?? null,
    sort: category.sort,
    status: category.status,
    productCount,
    createdAt: new Date(category.createdAt).toISOString(),
  };
}

export const categoryService = {
  async list(params: CategoryListParams) {
    const { items, meta } = await categoryRepository.list(params);

    const parentIds = items
      .map((item) => item.parent?.toString())
      .filter((id): id is string => Boolean(id));
    const parents = await categoryRepository.findByIds([...new Set(parentIds)]);
    const parentNames = new Map(parents.map((p) => [p._id.toString(), p.name]));
    const counts = await categoryRepository.productCountsByCategory();

    return {
      items: items.map((item) =>
        toDto(
          item,
          parentNames.get(item.parent?.toString() ?? "") ?? null,
          counts[item._id.toString()] ?? 0,
        ),
      ),
      meta,
    };
  },

  async getById(id: string): Promise<CategoryDto> {
    const category = await categoryRepository.findById(id);
    if (!category) throw notFound("Category not found.");

    const parent = category.parent
      ? await categoryRepository.findById(category.parent.toString())
      : null;
    const counts = await categoryRepository.productCountsByCategory();

    return toDto(category, parent?.name ?? null, counts[id] ?? 0);
  },

  async create(input: CreateCategoryInput): Promise<CategoryDto> {
    const existing = await categoryRepository.findByName(input.name);
    if (existing) throw conflict("A category with this name already exists.");

    // Explicit slug pre-check (Phase 19): different names can produce the same
    // slug; the caller must see a precise conflict instead of a generic
    // duplicate-key 409.
    const slug = slugify(input.name);
    const slugClash = await categoryRepository.findBySlug(slug);
    if (slugClash) {
      throw conflict(`A category with the slug "${slug}" already exists. Choose a different name.`);
    }

    if (input.parentId) {
      const parent = await categoryRepository.findById(input.parentId);
      if (!parent) throw badRequest("Parent category does not exist.");
    }

    const category = await categoryRepository.create({
      name: input.name,
      description: input.description,
      parentId: input.parentId ?? null,
      sort: input.sort ?? 0,
      status: input.status ?? "Active",
      slug: slugify(input.name),
    });

    return toDto(
      category,
      input.parentId ? ((await categoryRepository.findById(input.parentId))?.name ?? null) : null,
      0,
    );
  },

  async update(id: string, input: UpdateCategoryInput): Promise<CategoryDto> {
    const existing = await categoryRepository.findById(id);
    if (!existing) throw notFound("Category not found.");

    if (input.name && input.name !== existing.name) {
      const duplicate = await categoryRepository.findByName(input.name);
      if (duplicate && duplicate._id.toString() !== id) {
        throw conflict("A category with this name already exists.");
      }
      // NOTE: the slug stays stable on rename (deliberate policy), so a rename
      // can never collide on slug — no slug pre-check here (Phase 19).
    }

    if (input.parentId) {
      if (input.parentId === id) throw badRequest("A category cannot be its own parent.");
      const parent = await categoryRepository.findById(input.parentId);
      if (!parent) throw badRequest("Parent category does not exist.");
    }

    const patch: UpdateCategoryInput = {};
    if (input.name) patch.name = input.name;
    if ("description" in input) patch.description = input.description ?? null;
    if ("parentId" in input) patch.parentId = input.parentId ?? null;
    if ("sort" in input) patch.sort = input.sort;
    if (input.status) patch.status = input.status;

    const updated = await categoryRepository.updateById(id, patch);
    if (!updated) throw notFound("Category not found.");

    const parent = updated.parent
      ? await categoryRepository.findById(updated.parent.toString())
      : null;
    const counts = await categoryRepository.productCountsByCategory();
    return toDto(updated, parent?.name ?? null, counts[id] ?? 0);
  },

  async remove(id: string): Promise<void> {
    const category = await categoryRepository.findById(id);
    if (!category) throw notFound("Category not found.");

    const counts = await categoryRepository.productCountsByCategory();
    if ((counts[id] ?? 0) > 0) {
      throw conflict("Category has products assigned. Reassign or delete those products first.");
    }

    await categoryRepository.deleteById(id);
  },
};

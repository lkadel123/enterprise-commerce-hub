import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { publicCatalogController } from "./public-catalog.controller.js";
import {
  publicBrandParamsSchema,
  publicBrandListQuerySchema,
  publicCategoryListQuerySchema,
  publicCategoryParamsSchema,
  publicProductListQuerySchema,
  publicProductParamsSchema,
  publicReviewListQuerySchema,
  publicSearchSuggestionsQuerySchema,
} from "./public-catalog.validator.js";

/**
 * Public (unauthenticated) catalog surface.
 *
 * Mounted at /api/v1/public. No admin JWT is required and admin-only
 * fields are stripped in the service layer — only `Active` + `searchable`
 * products, `Active` categories/brands, approved reviews and in-window banners
 * are ever returned.
 */
const router = Router();

router.get(
  "/products",
  validate(publicProductListQuerySchema, "query"),
  publicCatalogController.listProducts,
);
router.get(
  "/products/:slug",
  validate(publicProductParamsSchema, "params"),
  publicCatalogController.getProduct,
);
router.get(
  "/reviews",
  validate(publicReviewListQuerySchema, "query"),
  publicCatalogController.listProductReviews,
);

router.get(
  "/categories",
  validate(publicCategoryListQuerySchema, "query"),
  publicCatalogController.listCategories,
);
router.get(
  "/categories/:slug",
  validate(publicCategoryParamsSchema, "params"),
  publicCatalogController.getCategory,
);

router.get(
  "/brands",
  validate(publicBrandListQuerySchema, "query"),
  publicCatalogController.listBrands,
);
router.get(
  "/brands/:slug",
  validate(publicBrandParamsSchema, "params"),
  publicCatalogController.getBrand,
);

router.get("/banners", publicCatalogController.listBanners);

router.get(
  "/search/suggestions",
  validate(publicSearchSuggestionsQuerySchema, "query"),
  publicCatalogController.searchSuggestions,
);

// Public SEO endpoints (no authentication, no admin authorization).
router.get("/sitemap.xml", publicCatalogController.sitemap);
router.get("/robots.txt", publicCatalogController.robotsTxt);

export { router as publicCatalogRouter };

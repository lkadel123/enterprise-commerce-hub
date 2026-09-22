import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendPaginated, sendSuccess } from "../../utils/ApiResponse.js";
import { publicCatalogService } from "./public-catalog.service.js";

export const publicCatalogController = {
  listProducts: asyncHandler(async (req, res) => {
    const result = await publicCatalogService.listProducts(req.query as Record<string, unknown>);
    sendPaginated(res, result.items, result.meta);
  }),

  getProduct: asyncHandler(async (req, res) => {
    const product = await publicCatalogService.getProduct(req.params.slug as string);
    sendSuccess(res, product);
  }),

  listProductReviews: asyncHandler(async (req, res) => {
    const result = await publicCatalogService.getProductReviews(
      req.query.productId as string,
      req.query as Record<string, unknown>,
    );
    sendPaginated(res, result.items, result.meta);
  }),

  listCategories: asyncHandler(async (req, res) => {
    const result = await publicCatalogService.listCategories(req.query as Record<string, unknown>);
    sendPaginated(res, result.items, result.meta);
  }),

  getCategory: asyncHandler(async (req, res) => {
    const category = await publicCatalogService.getCategory(req.params.slug as string);
    sendSuccess(res, category);
  }),

  listBrands: asyncHandler(async (req, res) => {
    const result = await publicCatalogService.listBrands(req.query as Record<string, unknown>);
    sendPaginated(res, result.items, result.meta);
  }),

  getBrand: asyncHandler(async (req, res) => {
    const brand = await publicCatalogService.getBrand(req.params.slug as string);
    sendSuccess(res, brand);
  }),

  listBanners: asyncHandler(async (_req, res) => {
    const banners = await publicCatalogService.listBanners();
    sendSuccess(res, banners);
  }),

  searchSuggestions: asyncHandler(async (req, res) => {
    const result = await publicCatalogService.searchSuggestions(req.query.q as string);
    sendSuccess(res, result);
  }),

  sitemap: asyncHandler(async (_req, res) => {
    const xml = await publicCatalogService.sitemap();
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.send(xml);
  }),

  robotsTxt: asyncHandler(async (_req, res) => {
    const text = await publicCatalogService.robotsTxt();
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(text);
  }),
};

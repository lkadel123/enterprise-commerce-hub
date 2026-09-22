import type { RequestHandler } from "express";
import { notFound } from "../utils/ApiError.js";

/** 404 fallback middleware — returns the JSON error envelope for unknown routes. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

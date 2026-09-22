import type { NextFunction, Request, RequestHandler, Response } from "express";

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

/** Wraps an async handler so rejections are forwarded to the error middleware. */
export const asyncHandler =
  (fn: AsyncHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";
import { ApiError } from "../utils/ApiError.js";

type ValidationSource = "body" | "query" | "params";

export function validate(schema: ZodTypeAny, source: ValidationSource = "body"): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      }));

      next(new ApiError(422, "VALIDATION_ERROR", "Invalid request data", details));

      return;
    }

    if (source === "query") {
      Object.assign(req.query, result.data);
    } else if (source === "body") {
      req.body = result.data;
    } else {
      req.params = result.data as typeof req.params;
    }

    next();
  };
}

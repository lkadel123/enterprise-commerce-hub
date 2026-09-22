import type { ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { captureError } from "../observability/errorReporter.js";
import { ApiError, type ApiErrorCode, type ApiErrorDetail } from "../utils/ApiError.js";
import type { ApiErrorBody } from "../utils/ApiResponse.js";
import { logger } from "../utils/logger.js";

interface DuplicateKeyError extends Error {
  code?: number;
  keyValue?: Record<string, unknown>;
}

function isDuplicateKeyError(error: unknown): error is DuplicateKeyError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

function isFileSizeError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "LIMIT_FILE_SIZE"
  );
}

/**
 * Central error handler: converts every thrown value into the standard
 * error envelope `{ success:false, error: { code, message, details? } }`.
 *
 * SECURITY: stack traces are NEVER sent to clients in any environment
 * (development included). Detailed diagnostics — including the stack — are
 * written to the SERVER log instead. The log must pass the error under the
 * `err` key: pino special-cases `err` and serializes `type`/`message`/`stack`,
 * whereas `{ error }` collapses to `error: {}` and loses the stack.
 */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  let statusCode = 500;
  let code: ApiErrorCode = "INTERNAL";
  let message = "Something went wrong.";
  let details: ApiErrorDetail[] | undefined;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (isFileSizeError(err)) {
    statusCode = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Uploaded file is too large.";
  } else if (err instanceof ZodError) {
    statusCode = 422;
    code = "VALIDATION_ERROR";
    message = "Invalid request data.";
    details = err.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 422;
    code = "VALIDATION_ERROR";
    message = "Data failed database validation.";
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    code = "BAD_REQUEST";
    message = `Invalid ${String(err.path)} value supplied.`;
  } else if (isDuplicateKeyError(err)) {
    statusCode = 409;
    code = "CONFLICT";
    const field = Object.keys(err.keyValue ?? {})[0];
    message = field ? `A record with this ${field} already exists.` : "Duplicate key conflict.";
  } else if (err instanceof SyntaxError) {
    statusCode = 400;
    code = "BAD_REQUEST";
    message = "Malformed request body.";
  }

  if (statusCode >= 500) {
    logger.error({ err, method: req.method, url: req.originalUrl }, message);
    // Report 5xx to error monitoring when configured (no-op without SENTRY_DSN).
    // Only a path without query string is forwarded — never headers/cookies/PII.
    void captureError(err, {
      method: req.method,
      path: (req.originalUrl ?? "").split("?")[0],
      statusCode,
    });
  } else {
    // 4xx: log at warn. Same `err` key requirement as above — the stack must
    // reach the server log (pino only serializes Error under `err`).
    logger.warn({ err, method: req.method, url: req.originalUrl }, message);
  }

  const body: ApiErrorBody = {
    success: false,
    error: { code, message },
  };
  if (details) body.error.details = details;
  // NOTE: `error.stack` is intentionally NEVER sent to clients — not even in
  // development. Diagnostics stay in the server log (via `err` above) and in
  // the error reporter (Sentry) when configured.

  res.status(statusCode).json(body);
};

import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";

/* eslint-disable @typescript-eslint/no-namespace */

declare global {
  namespace Express {
    interface Request {
      /** Correlation ID propagated through logs and as a response header. */
      id?: string;
    }
  }
}

/** Header used to echo and accept the request correlation id. */
export const REQUEST_ID_HEADER = "X-Request-Id";

/**
 * Assigns a correlation id to every request and echoes it as a response header.
 *
 * A client-supplied `X-Request-Id` is honoured (bounded length and trimmed) so
 * requests can be traced across a CDN/gateway, and a random UUID is generated
 * otherwise. The id is exposed on `req.id` so the pino-http logger and any
 * downstream handler can correlate their log lines without emitting secrets.
 */
export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const incoming = req.headers[REQUEST_ID_HEADER.toLowerCase()];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const id =
    typeof candidate === "string" && candidate.trim().length > 0
      ? candidate.trim().slice(0, 128)
      : randomUUID();
  req.id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
};

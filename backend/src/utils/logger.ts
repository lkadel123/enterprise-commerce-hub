import { pino, type LoggerOptions } from "pino";
import { env, isProduction } from "../config/env.js";

/**
 * Log-redaction policy (Phase 12).
 *
 * Request-scoped fields that must never reach the logs in cleartext. Exported
 * so the HTTP logger wiring and its regression tests share one source of
 * truth: Authorization headers and cookies carry bearer/refresh tokens.
 */
export const LOG_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
] as const;

/** Value substituted for every redacted path. */
export const LOG_REDACT_CENSOR = "***";

const options: LoggerOptions = {
  level: env.LOG_LEVEL,
  base: { service: "enterprise-commerce-hub-api" },
  timestamp: pino.stdTimeFunctions.isoTime,
};

if (!isProduction) {
  options.transport = {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  };
}

export const logger = pino(options);

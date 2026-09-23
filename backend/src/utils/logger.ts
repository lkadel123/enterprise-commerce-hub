import { createRequire } from "node:module";
import { pino, type LoggerOptions } from "pino";
import { env, isProduction } from "../config/env.js";

/**
 * Log-redaction policy (Phase 12).
 *
 * Request-scoped fields that must never reach the logs in cleartext. Exported
 * so the HTTP logger wiring and its regression tests share one source of
 * truth: Authorization headers and cookies carry bearer/refresh tokens.
 */
export const LOG_REDACT_PATHS = ["req.headers.authorization", "req.headers.cookie"] as const;

/** Value substituted for every redacted path. */
export const LOG_REDACT_CENSOR = "***";

/**
 * Bare specifier of the optional, development-only human-readable formatter.
 *
 * `pino-pretty` is a devDependency, so it is NOT present in the install the
 * cPanel/Passenger host runs (`npm ci --omit=dev`). pino resolves a string
 * `transport.target` eagerly — `pino(options)` calls `transport()` immediately
 * (`pino/lib/tools.js`), which runs `createRequire(...).resolve(target)` and
 * throws `unable to determine transport target for "pino-pretty"` when the
 * package is missing (`pino/lib/transport.js`). Because that happens while this
 * module is imported, an unconditional pretty transport does not degrade a log
 * line — it aborts the whole process during startup.
 */
const PRETTY_TRANSPORT_TARGET = "pino-pretty";

/** Options handed to the pretty-print transport when it is enabled. */
const PRETTY_TRANSPORT_OPTIONS = {
  colorize: true,
  translateTime: "SYS:standard",
  ignore: "pid,hostname",
} as const;

/** Environment facts that decide the shape of the log output. */
interface LoggerEnvironment {
  /** `NODE_ENV === "production"` — pretty output is never used in production. */
  production: boolean;
  /** Whether `pino-pretty` is resolvable in the current install. */
  prettyAvailable: boolean;
}

/**
 * Whether `pino-pretty` can be resolved from this module right now.
 *
 * Resolution is probed with a plain `try`/`catch`: a formatter missing from the
 * installed tree (production install, or any host running without dev
 * dependencies) must only disable pretty printing — never crash the process.
 * A module that throws while loading is treated the same way as a missing one.
 */
export function isPinoPrettyAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve(PRETTY_TRANSPORT_TARGET);
    return true;
  } catch {
    return false;
  }
}

/** pino options shared by every environment (single-line JSON on stdout). */
function baseLoggerOptions(): LoggerOptions {
  return {
    level: env.LOG_LEVEL,
    base: { service: "enterprise-commerce-hub-api" },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
}

/**
 * Resolve the pino options for a given environment.
 *
 * Production is decided FIRST and returns before the transport is considered,
 * so a production startup never imports/requires/resolves `pino-pretty`. Off
 * production the pretty transport is used only when the formatter is actually
 * installed; otherwise the log stream stays plain JSON.
 *
 * Exported so the startup guard above is covered by a regression test.
 */
export function resolveLoggerOptions(environment: LoggerEnvironment): LoggerOptions {
  const options = baseLoggerOptions();

  if (environment.production || !environment.prettyAvailable) {
    return options;
  }

  options.transport = {
    target: PRETTY_TRANSPORT_TARGET,
    options: { ...PRETTY_TRANSPORT_OPTIONS },
  };

  return options;
}

export const logger = pino(
  resolveLoggerOptions({
    production: isProduction,
    // The `&&` short-circuit keeps `pino-pretty` off the production startup path
    // entirely: the availability probe only runs when NODE_ENV is not production.
    prettyAvailable: !isProduction && isPinoPrettyAvailable(),
  }),
);

import rateLimit from "express-rate-limit";
import { ApiError } from "../utils/ApiError.js";

/**
 * Rate limits are env-tunable so the integration suite can raise budgets for
 * local/CI runs without weakening production defaults. `env.ts` supplies the
 * values; production deployments keep the strict defaults below unless
 * explicitly overridden (which is NOT recommended — the defaults are hardened).
 */
const {
  AUTH_ACTION_RATE_LIMIT_MAX,
  AUTH_ACTION_RATE_LIMIT_WINDOW_MS,
  AUTH_RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_WINDOW_MS,
  REFRESH_RATE_LIMIT_MAX,
  REFRESH_RATE_LIMIT_WINDOW_MS,
  API_RATE_LIMIT_MAX,
  API_RATE_LIMIT_WINDOW_MS,
  OAUTH_RATE_LIMIT_MAX,
  OAUTH_RATE_LIMIT_WINDOW_MS,
} = process.env;

function envInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Strict limiter for credential-based endpoints (login / registration).
 * Env-tunable like the other limiters, so local/CI runs can raise the budget
 * while production keeps the hardened defaults (20 per 15 min per IP).
 */
export const authRateLimiter = rateLimit({
  windowMs: envInt(AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  limit: envInt(AUTH_RATE_LIMIT_MAX, 20),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new ApiError(429, "RATE_LIMITED", "Too many attempts. Please try again later."));
  },
});

/**
 * Limiter for `/auth/refresh`. Refresh calls are legitimate on every access-token
 * expiry (~15 min), so the budget is higher than the login limiter, but still
 * bounds cookie-replay floods and refresh-chain probing per IP.
 * Env-tunable like the other limiters, so local/CI runs can raise the budget
 * while production keeps the hardened defaults (60 per 15 min per IP).
 */
export const refreshRateLimiter = rateLimit({
  windowMs: envInt(REFRESH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  limit: envInt(REFRESH_RATE_LIMIT_MAX, 60),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new ApiError(429, "RATE_LIMITED", "Too many refresh attempts. Please try again later."));
  },
});

/** Limiter for authenticated account-security actions (change password). */
export const authActionRateLimiter = rateLimit({
  windowMs: envInt(AUTH_ACTION_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  limit: envInt(AUTH_ACTION_RATE_LIMIT_MAX, 20),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new ApiError(429, "RATE_LIMITED", "Too many attempts. Please try again later."));
  },
});

/** General per-IP limiter for authenticated API traffic. */
export const apiRateLimiter = rateLimit({
  windowMs: envInt(API_RATE_LIMIT_WINDOW_MS, 60 * 1000),
  limit: envInt(API_RATE_LIMIT_MAX, 300),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new ApiError(429, "RATE_LIMITED", "Too many requests. Please slow down."));
  },
});

/** Sensitive administration endpoints (suspend, password resets). */
export const adminActionRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new ApiError(429, "RATE_LIMITED", "Too many requests. Please slow down."));
  },
});

/** Social sign-in start/callback endpoints (Google/Facebook redirect flow). */
export const socialOAuthRateLimiter = rateLimit({
  windowMs: envInt(OAUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  limit: envInt(OAUTH_RATE_LIMIT_MAX, 30),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new ApiError(429, "RATE_LIMITED", "Too many sign-in attempts. Please try again later."));
  },
});

import type { CookieOptions } from "express";
import { env } from "../config/env.js";

export const REFRESH_COOKIE_NAME = env.COOKIE_NAME;
export const REFRESH_COOKIE_PATH = "/api/v1/auth";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const REMEMBER_DAYS = 30;

export function refreshTtlDays(remember: boolean): number {
  return remember ? REMEMBER_DAYS : env.REFRESH_TOKEN_TTL_DAYS;
}

export function refreshCookieOptions(remember: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
    domain: env.COOKIE_DOMAIN || undefined,
    path: REFRESH_COOKIE_PATH,
    maxAge: refreshTtlDays(remember) * MS_PER_DAY,
  };
}

export function clearRefreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
    domain: env.COOKIE_DOMAIN || undefined,
    path: REFRESH_COOKIE_PATH,
    maxAge: 0,
  };
}

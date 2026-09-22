import type { Request } from "express";
import { unauthorized } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/ApiResponse.js";
import {
  clearRefreshCookieOptions,
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
} from "../../utils/cookie.js";
import { authService } from "./auth.service.js";

function clientMeta(req: Request) {
  const ua = req.headers["user-agent"];
  return {
    ua: typeof ua === "string" ? ua : undefined,
    ip: req.ip ?? req.socket.remoteAddress,
  };
}

export const authController = {
  login: asyncHandler(async (req, res) => {
    const result = await authService.login(req.body, clientMeta(req));
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions(result.remember));
    sendSuccess(
      res,
      { user: result.user, accessToken: result.accessToken, permissions: result.permissions },
      "Signed in successfully",
    );
  }),

  refresh: asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (typeof token !== "string") throw unauthorized("Refresh token missing.");
    const result = await authService.refresh(token, clientMeta(req));
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions(result.remember));
    sendSuccess(res, {
      user: result.user,
      accessToken: result.accessToken,
      permissions: result.permissions,
    });
  }),

  logout: asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    await authService.logout(typeof token === "string" ? token : undefined);
    res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions());
    sendSuccess(res, { loggedOut: true }, "Signed out successfully");
  }),

  me: asyncHandler(async (req, res) => {
    const profile = await authService.profile(req.user!.id);
    sendSuccess(res, profile);
  }),

  changePassword: asyncHandler(async (req, res) => {
    await authService.changePassword(req.user!.id, req.body);
    sendSuccess(res, { changed: true }, "Password changed. Other sessions were revoked.");
  }),
};

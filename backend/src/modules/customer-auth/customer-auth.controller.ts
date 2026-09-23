import type { Request } from "express";

import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/ApiResponse.js";
import { unauthorized } from "../../utils/ApiError.js";

import {
  clearCustomerRefreshCookieOptions,
  clearCustomerSessionHintCookieOptions,
  CUSTOMER_REFRESH_COOKIE_NAME,
  CUSTOMER_SESSION_HINT_COOKIE_NAME,
  customerRefreshCookieOptions,
  customerSessionHintCookieOptions,
} from "./customer-cookie.js";

import { customerAuthService } from "./customer-auth.service.js";

function clientMeta(req: Request) {
  const ua = req.headers["user-agent"];

  return {
    ua: typeof ua === "string" ? ua : undefined,
    ip: req.ip ?? req.socket.remoteAddress,
  };
}

export const customerAuthController = {
  register: asyncHandler(async (req, res) => {
    const result = await customerAuthService.register(req.body, clientMeta(req));

    res.cookie(
      CUSTOMER_REFRESH_COOKIE_NAME,
      result.refreshToken,
      customerRefreshCookieOptions(result.remember),
    );
    res.cookie(
      CUSTOMER_SESSION_HINT_COOKIE_NAME,
      "1",
      customerSessionHintCookieOptions(result.remember),
    );

    sendSuccess(
      res,
      {
        customer: result.customer,
        accessToken: result.accessToken,
        remember: result.remember,
      },
      "Account created successfully",
      201,
    );
  }),

  login: asyncHandler(async (req, res) => {
    const result = await customerAuthService.login(req.body, clientMeta(req));

    res.cookie(
      CUSTOMER_REFRESH_COOKIE_NAME,
      result.refreshToken,
      customerRefreshCookieOptions(result.remember),
    );
    res.cookie(
      CUSTOMER_SESSION_HINT_COOKIE_NAME,
      "1",
      customerSessionHintCookieOptions(result.remember),
    );

    sendSuccess(
      res,
      {
        customer: result.customer,
        accessToken: result.accessToken,
        remember: result.remember,
      },
      "Signed in successfully",
    );
  }),

  refresh: asyncHandler(async (req, res) => {
    const token = req.cookies?.[CUSTOMER_REFRESH_COOKIE_NAME];

    if (typeof token !== "string") {
      throw unauthorized("Refresh token missing.");
    }

    const result = await customerAuthService.refresh(token, clientMeta(req));

    res.cookie(
      CUSTOMER_REFRESH_COOKIE_NAME,
      result.refreshToken,
      customerRefreshCookieOptions(result.remember),
    );
    res.cookie(
      CUSTOMER_SESSION_HINT_COOKIE_NAME,
      "1",
      customerSessionHintCookieOptions(result.remember),
    );

    sendSuccess(res, {
      customer: result.customer,
      accessToken: result.accessToken,
      remember: result.remember,
    });
  }),

  logout: asyncHandler(async (req, res) => {
    const token = req.cookies?.[CUSTOMER_REFRESH_COOKIE_NAME];

    await customerAuthService.logout(typeof token === "string" ? token : undefined);

    res.clearCookie(CUSTOMER_REFRESH_COOKIE_NAME, clearCustomerRefreshCookieOptions());
    res.clearCookie(CUSTOMER_SESSION_HINT_COOKIE_NAME, clearCustomerSessionHintCookieOptions());

    sendSuccess(res, { loggedOut: true }, "Signed out successfully");
  }),

  me: asyncHandler(async (req, res) => {
    const profile = await customerAuthService.profile(req.customer!.id);

    sendSuccess(res, profile);
  }),

  changePassword: asyncHandler(async (req, res) => {
    await customerAuthService.changePassword(req.customer!.id, req.body);

    sendSuccess(res, { changed: true }, "Password changed. Other sessions were revoked.");
  }),

  updateProfile: asyncHandler(async (req, res) => {
    const profile = await customerAuthService.updateProfile(req.customer!.id, req.body);

    sendSuccess(res, profile, "Profile updated successfully");
  }),

  forgotPassword: asyncHandler(async (req, res) => {
    const result = await customerAuthService.forgotPassword(req.body.email, clientMeta(req));

    sendSuccess(
      res,
      { requestId: result.requestId },
      "If that email is registered, a password reset link has been sent.",
    );
  }),

  resetPassword: asyncHandler(async (req, res) => {
    await customerAuthService.resetPassword(
      req.body.requestId,
      req.body.token,
      req.body.newPassword,
    );

    sendSuccess(res, { reset: true }, "Password has been reset. Other sessions were revoked.");
  }),
};

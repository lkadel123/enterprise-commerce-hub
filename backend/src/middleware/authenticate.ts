import type { RequestHandler } from "express";
import { UserModel } from "../modules/users/user.model.js";
import { ApiError, unauthorized } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { verifyAccessToken } from "../utils/jwt.js";

/**
 * Verifies the `Authorization: Bearer <jwt>` access token and attaches the
 * authenticated admin user to `req.user`. Rejects with 401 when the token is
 * missing, invalid, expired, or the user is no longer active.
 */
export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw unauthorized("Authentication required. Provide a valid access token.");
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw unauthorized("Authentication required. Provide a valid access token.");
  }

  const payload = verifyAccessToken(token);

  const user = await UserModel.findById(payload.sub).select("_id name email role status").lean();

  if (!user) {
    throw new ApiError(401, "UNAUTHENTICATED", "User account no longer exists.");
  }
  if (user.status !== "Active") {
    throw new ApiError(401, "UNAUTHENTICATED", "User account is not active.");
  }

  req.user = {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
  };

  next();
});

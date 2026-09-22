import type { RequestHandler } from "express";
import { CustomerAccountModel } from "../modules/customer-auth/customerAccount.model.js";
import { verifyCustomerAccessToken } from "../modules/customer-auth/customer-token.js";
import { ApiError, unauthorized } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Verifies the `Authorization: Bearer <jwt>` customer access token and attaches
 * the authenticated customer to `req.customer`. Rejects with 401 when the token
 * is missing, invalid, expired, or the account is no longer active.
 *
 * This is the customer-domain gate. It is intentionally separate from the admin
 * `authenticate` middleware so customer tokens can never grant administrator
 * access and admin tokens are never accepted on customer endpoints.
 */
export const customerAuthenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw unauthorized("Authentication required. Provide a valid customer access token.");
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw unauthorized("Authentication required. Provide a valid customer access token.");
  }

  const payload = verifyCustomerAccessToken(token);

  const account = await CustomerAccountModel.findById(payload.sub)
    .select("_id name email status customer")
    .lean();

  if (!account) {
    throw new ApiError(401, "UNAUTHENTICATED", "Customer account no longer exists.");
  }
  if (account.status !== "Active") {
    throw new ApiError(401, "UNAUTHENTICATED", "Customer account is not active.");
  }

  req.customer = {
    id: account._id.toString(),
    customerId: account.customer ? account.customer.toString() : null,
    name: account.name,
    email: account.email,
    status: account.status,
  };

  next();
});

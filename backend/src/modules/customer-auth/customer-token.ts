import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/ApiError.js";

export interface CustomerAccessTokenClaims {
  sub: string;
  type: "customer-access";
}

/**
 * Customer-domain access token. Kept separate from the admin access token so a
 * customer token is never accepted by the admin `authenticate` middleware and
 * never grants RBAC administrative privileges.
 */
export function signCustomerAccessToken(customerAccountId: string): string {
  const claims: CustomerAccessTokenClaims = { sub: customerAccountId, type: "customer-access" };
  return jwt.sign(claims, env.CUSTOMER_JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: env.CUSTOMER_ACCESS_TOKEN_TTL as SignOptions["expiresIn"],
  } satisfies SignOptions);
}

export function verifyCustomerAccessToken(token: string): CustomerAccessTokenClaims {
  try {
    const payload = jwt.verify(token, env.CUSTOMER_JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
    if (typeof payload === "string") throw new Error("Unexpected string token payload");
    if (payload.type !== "customer-access") throw new Error("Not a customer access token");
    return payload as unknown as CustomerAccessTokenClaims;
  } catch {
    throw new ApiError(401, "UNAUTHENTICATED", "Invalid or expired customer access token.");
  }
}

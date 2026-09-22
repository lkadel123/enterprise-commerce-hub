import crypto from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";

import { env } from "../config/env.js";
import { ApiError } from "./ApiError.js";
import type { RequestUser } from "../types/index.js";

/**
 * ---------------------------------------------------------------------------
 * Admin / Staff Access Token
 * ---------------------------------------------------------------------------
 */

export interface AccessTokenClaims {
  sub: string;
  role: string;
  name: string;
  email: string;
  type: "access";
}

export function signAccessToken(user: RequestUser): string {
  const claims: AccessTokenClaims = {
    sub: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    type: "access",
  };

  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions["expiresIn"],
  } satisfies SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
    });

    if (typeof payload === "string") {
      throw new Error("Unexpected string token payload");
    }

    if (payload.type !== "access") {
      throw new Error("Not an access token");
    }

    return payload as unknown as AccessTokenClaims;
  } catch {
    throw new ApiError(401, "UNAUTHENTICATED", "Invalid or expired access token.");
  }
}

/**
 * NOTE (Phase 19 hardening): customer access tokens live exclusively in
 * `modules/customer-auth/customer-token.ts`, which signs them with the DEDICATED
 * `CUSTOMER_JWT_ACCESS_SECRET`. This module must never mint or verify a customer
 * token: doing so with the admin secret would silently unify the two token
 * domains and let an admin token satisfy customer authorization (or vice versa).
 */

/**
 * ---------------------------------------------------------------------------
 * Refresh Token
 * ---------------------------------------------------------------------------
 *
 * Refresh tokens are opaque random values.
 *
 * The raw token is sent to the client through an HttpOnly cookie.
 * Only the SHA-256 hash is stored in MongoDB.
 */

export function generateRefreshToken(): {
  token: string;
  tokenHash: string;
} {
  const token = crypto.randomBytes(48).toString("base64url");

  return {
    token,
    tokenHash: hashToken(token),
  };
}

/**
 * Hash a refresh token before storing/comparing it.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

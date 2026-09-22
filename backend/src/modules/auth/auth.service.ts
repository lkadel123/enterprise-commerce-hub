import { ROLE_PERMISSIONS, type RoleName } from "../../constants/roles.js";
import {
  notFound,
  badRequest,
  forbidden,
  invalidCredentials,
  unauthorized,
} from "../../utils/ApiError.js";
import { refreshTtlDays } from "../../utils/cookie.js";
import { generateRefreshToken, hashToken, signAccessToken } from "../../utils/jwt.js";
import { hashPassword, verifyPassword } from "../../utils/password.js";
import { userRepository } from "../users/user.repository.js";
import { userService } from "../users/user.service.js";
import { authRepository } from "./auth.repository.js";
import type {
  AuthProfileResult,
  AuthSessionResult,
  ChangePasswordInput,
  LoginContext,
  LoginInput,
} from "./auth.types.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function permissionsForRole(role: RoleName) {
  return ROLE_PERMISSIONS[role].map((rule) => ({
    module: rule.module,
    actions: [...rule.actions],
  }));
}

function accessTokenFor(user: {
  _id: { toString(): string };
  name: string;
  email: string;
  role: RoleName;
}): string {
  return signAccessToken({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
  });
}

export const authService = {
  async login(input: LoginInput, ctx: LoginContext): Promise<AuthSessionResult> {
    const user = await userService.findForAuth(input.email);
    if (!user) throw invalidCredentials();

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) throw invalidCredentials();

    if (user.status !== "Active") {
      throw forbidden("This account is not active. Contact an administrator.");
    }

    const remember = input.remember ?? false;
    const { token, tokenHash } = generateRefreshToken();
    const ttlDays = refreshTtlDays(remember);
    const session = await authRepository.createSession({
      userId: user._id,
      tokenHash,
      ua: ctx.ua,
      ip: ctx.ip,
      expiresAt: new Date(Date.now() + ttlDays * MS_PER_DAY),
      remember,
    });

    await userService.touchLastActive(user._id.toString());

    return {
      user: userService.toDto(user),
      accessToken: accessTokenFor(user),
      refreshToken: token,
      remember: session.remember,
      permissions: permissionsForRole(user.role),
    };
  },

  /** Rotates the refresh session on every use and issues a fresh access token. */
  async refresh(refreshToken: string, ctx: LoginContext): Promise<AuthSessionResult> {
    if (!refreshToken) throw unauthorized("Refresh token missing.");

    const tokenHash = hashToken(refreshToken);
    const session = await authRepository.findByTokenHash(tokenHash);

    if (!session) throw unauthorized("Invalid refresh token.");
    if (session.revokedAt) {
      await authRepository.revokeChain(tokenHash);
      throw unauthorized("Invalid refresh token.");
    }
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await authRepository.revokeSession(session._id.toString());
      throw unauthorized("Refresh token expired. Please sign in again.");
    }

    const user = await userRepository.findById(session.userId.toString());
    if (!user) throw unauthorized("User account no longer exists.");
    if (user.status !== "Active") throw unauthorized("User account is not active.");

    // Rotate: revoke current session, create a successor linked to the chain root.
    await authRepository.revokeSession(session._id.toString());
    const next = generateRefreshToken();
    const ttlDays = refreshTtlDays(session.remember);
    const chainRoot = session.rotatedFrom ?? tokenHash;
    const newSession = await authRepository.createSession({
      userId: user._id,
      tokenHash: next.tokenHash,
      ua: ctx.ua,
      ip: ctx.ip,
      expiresAt: new Date(Date.now() + ttlDays * MS_PER_DAY),
      remember: session.remember,
      rotatedFrom: chainRoot,
    });

    await userService.touchLastActive(user._id.toString());

    return {
      user: userService.toDto(user),
      accessToken: accessTokenFor(user),
      refreshToken: next.token,
      remember: newSession.remember,
      permissions: permissionsForRole(user.role),
    };
  },

  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    const session = await authRepository.findByTokenHash(hashToken(refreshToken));
    if (session) await authRepository.revokeSession(session._id.toString());
  },

  async profile(userId: string): Promise<AuthProfileResult> {
    const user = await userRepository.findById(userId);
    if (!user) throw notFound("User not found.");
    return { user: userService.toDto(user), permissions: permissionsForRole(user.role) };
  },

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) throw notFound("User not found.");

    const valid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!valid) throw badRequest("Current password is incorrect.");

    const passwordHash = await hashPassword(input.newPassword);
    await userRepository.updateById(userId, {
      passwordHash,
      passwordChangedAt: new Date(),
    });
    await authRepository.revokeAllForUser(userId);
  },
};

import type { ModulePermission } from "../../types/index.js";
import type { UserDto } from "../users/user.types.js";

export interface LoginInput {
  email: string;
  password: string;
  remember?: boolean;
}

export interface LoginContext {
  ua?: string;
  ip?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface AuthSessionResult {
  user: UserDto;
  accessToken: string;
  refreshToken: string;
  remember: boolean;
  permissions: ModulePermission[];
}

export interface AuthProfileResult {
  user: UserDto;
  permissions: ModulePermission[];
}

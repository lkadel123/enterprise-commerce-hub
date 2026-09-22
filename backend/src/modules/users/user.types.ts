import type { RoleName } from "../../constants/roles.js";
import type { PermissionAction, PermissionModule } from "../../constants/permissions.js";

export type UserStatus = "Active" | "Invited" | "Suspended";

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  status: UserStatus;
  lastActiveAt: string | null;
  createdAt: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: RoleName;
}

export interface UpdateUserInput {
  name?: string;
  role?: RoleName;
  status?: UserStatus;
}

export interface RoleDto {
  name: RoleName;
  permissions: { module: PermissionModule; actions: PermissionAction[] }[];
}

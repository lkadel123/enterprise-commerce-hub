import { ROLE_NAMES, ROLE_PERMISSIONS } from "../../constants/roles.js";
import { badRequest, conflict, notFound } from "../../utils/ApiError.js";
import { hashPassword } from "../../utils/password.js";
import { userRepository, type UserListParams } from "./user.repository.js";
import type { IUser } from "./user.model.js";
import type { CreateUserInput, UpdateUserInput, UserDto } from "./user.types.js";

export const userService = {
  toDto(user: IUser): UserDto {
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      lastActiveAt: user.lastActiveAt ? new Date(user.lastActiveAt).toISOString() : null,
      createdAt: new Date(user.createdAt).toISOString(),
    };
  },

  async list(params: UserListParams) {
    const { items, meta } = await userRepository.list(params);
    return { items: items.map((user) => this.toDto(user)), meta };
  },

  async getById(id: string): Promise<UserDto> {
    const user = await userRepository.findById(id);
    if (!user) throw notFound("User not found.");
    return this.toDto(user);
  },

  async create(input: CreateUserInput): Promise<UserDto> {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) throw conflict("A user with this email already exists.");

    const passwordHash = await hashPassword(input.password);
    const user = await userRepository.create({ ...input, passwordHash });
    return this.toDto(user);
  },

  async update(id: string, patch: UpdateUserInput): Promise<UserDto> {
    const user = await userRepository.updateById(id, patch);
    if (!user) throw notFound("User not found.");
    return this.toDto(user);
  },

  async resetPassword(id: string, newPassword: string): Promise<void> {
    const exists = await userRepository.findById(id);
    if (!exists) throw notFound("User not found.");

    const passwordHash = await hashPassword(newPassword);
    await userRepository.updateById(id, {
      passwordHash,
      passwordChangedAt: new Date(),
    });
  },

  async remove(id: string, actorId: string): Promise<void> {
    if (id === actorId) throw badRequest("You cannot delete your own account.");

    const user = await userRepository.findById(id);
    if (!user) throw notFound("User not found.");

    if (user.role === "Super Admin") {
      const admins = await userRepository.countByRole("Super Admin");
      if (admins <= 1) throw badRequest("Cannot delete the last Super Admin account.");
    }

    await userRepository.deleteById(id);
  },

  listRoles() {
    return ROLE_NAMES.map((name) => ({
      name,
      permissions: ROLE_PERMISSIONS[name].map((rule) => ({
        module: rule.module,
        actions: [...rule.actions],
      })),
    }));
  },

  /** Auth-facing helpers (shared with the auth module). */
  findForAuth(email: string) {
    return userRepository.findByEmail(email);
  },

  touchLastActive(id: string) {
    return userRepository.markLastActive(id);
  },
};

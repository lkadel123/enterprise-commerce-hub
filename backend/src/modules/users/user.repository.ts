import { UserModel, type IUser } from "./user.model.js";
import { paginationMeta, parsePagination, parseSort } from "../../utils/pagination.js";
import type { PaginationMeta } from "../../utils/ApiResponse.js";
import type { UserStatus } from "./user.types.js";

export interface UserListParams {
  q?: string;
  role?: string;
  status?: UserStatus;
  page?: number;
  pageSize?: number;
  sort?: string;
}

export interface UserListResult {
  items: IUser[];
  meta: PaginationMeta;
}

type UserPatch = Partial<Omit<IUser, "_id" | "createdAt" | "updatedAt">>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const userRepository = {
  async list(params: UserListParams): Promise<UserListResult> {
    const { page, pageSize, skip, limit } = parsePagination(params);

    const filter: Record<string, unknown> = {};
    if (params.q) {
      const regex = new RegExp(escapeRegExp(params.q), "i");
      filter.$or = [{ name: { $regex: regex } }, { email: { $regex: regex } }];
    }
    if (params.role) filter.role = params.role;
    if (params.status) filter.status = params.status;

    const sort = parseSort(params.sort, [
      "name",
      "email",
      "role",
      "status",
      "createdAt",
      "lastActiveAt",
    ]);

    const [items, total] = await Promise.all([
      UserModel.find(filter).sort(sort).skip(skip).limit(limit).lean().exec(),
      UserModel.countDocuments(filter).exec(),
    ]);

    return { items: items as unknown as IUser[], meta: paginationMeta(total, page, pageSize) };
  },

  async findById(id: string): Promise<IUser | null> {
    return (await UserModel.findById(id).lean().exec()) as unknown as IUser | null;
  },

  async findByEmail(email: string): Promise<IUser | null> {
    return (await UserModel.findOne({ email: email.toLowerCase() })
      .lean()
      .exec()) as unknown as IUser | null;
  },

  async create(data: {
    name: string;
    email: string;
    passwordHash: string;
    role: IUser["role"];
    status?: IUser["status"];
  }): Promise<IUser> {
    const doc = await UserModel.create(data);
    return doc.toObject() as unknown as IUser;
  },

  async updateById(id: string, patch: UserPatch): Promise<IUser | null> {
    return (await UserModel.findByIdAndUpdate(id, patch, { new: true, runValidators: true })
      .lean()
      .exec()) as unknown as IUser | null;
  },

  async deleteById(id: string): Promise<IUser | null> {
    return (await UserModel.findByIdAndDelete(id).lean().exec()) as unknown as IUser | null;
  },

  async markLastActive(id: string): Promise<void> {
    await UserModel.findByIdAndUpdate(id, { lastActiveAt: new Date() }).exec();
  },

  async countByRole(role: IUser["role"]): Promise<number> {
    return UserModel.countDocuments({ role }).exec();
  },
};

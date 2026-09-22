import type { FilterQuery } from "mongoose";
import { RefreshSessionModel, type IRefreshSession } from "./auth.model.js";

type CreateSessionInput = Omit<IRefreshSession, "_id" | "createdAt" | "updatedAt" | "revokedAt">;

export const authRepository = {
  async findByTokenHash(tokenHash: string): Promise<IRefreshSession | null> {
    return (await RefreshSessionModel.findOne({ tokenHash })
      .lean()
      .exec()) as unknown as IRefreshSession | null;
  },

  async createSession(data: CreateSessionInput): Promise<IRefreshSession> {
    const doc = await RefreshSessionModel.create(data);
    return doc.toObject() as unknown as IRefreshSession;
  },

  async revokeSession(id: string): Promise<void> {
    await RefreshSessionModel.updateOne({ _id: id }, { $set: { revokedAt: new Date() } }).exec();
  },

  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    const filter: FilterQuery<IRefreshSession> = { userId, revokedAt: null };
    if (exceptSessionId) filter._id = { $ne: exceptSessionId };
    await RefreshSessionModel.updateMany(filter, { $set: { revokedAt: new Date() } }).exec();
  },

  /** Reuse detection: revoke the token and everything rotated from it. */
  async revokeChain(tokenHash: string): Promise<void> {
    await RefreshSessionModel.updateMany(
      {
        $or: [{ tokenHash }, { rotatedFrom: tokenHash }],
        revokedAt: null,
      },
      { $set: { revokedAt: new Date() } },
    ).exec();
  },

  async deleteExpired(): Promise<void> {
    await RefreshSessionModel.deleteMany({ expiresAt: { $lt: new Date() } }).exec();
  },
};

import { Types } from "mongoose";
import { CustomerAccountModel, type ICustomerAccount } from "./customerAccount.model.js";
import {
  CustomerRefreshSessionModel,
  type ICustomerRefreshSession,
} from "./customerRefreshSession.model.js";

type CreateSessionInput = Omit<
  ICustomerRefreshSession,
  "_id" | "createdAt" | "updatedAt" | "revokedAt"
>;

export const customerAuthRepository = {
  async findByEmail(email: string): Promise<ICustomerAccount | null> {
    return (await CustomerAccountModel.findOne({ email: email.toLowerCase() })
      .lean()
      .exec()) as unknown as ICustomerAccount | null;
  },

  async findById(id: string): Promise<ICustomerAccount | null> {
    return (await CustomerAccountModel.findById(id)
      .lean()
      .exec()) as unknown as ICustomerAccount | null;
  },

  /**
   * Resolve the CustomerAccount id that is linked to a given CRM Customer id.
   *
   * Customer notifications are keyed by CustomerAccount id (the identity the
   * customer notification HTTP surface authenticates against). Commerce event
   * call sites that only hold a CRM Customer id (e.g. shared admin/customer
   * order flows) use this to route the notification to the correct account.
   * Returns null when no account is linked (e.g. admin-created records with no
   * self-service account), in which case callers skip customer notification.
   */
  async findAccountIdByCrmCustomerId(crmCustomerId: string): Promise<string | null> {
    const account = await CustomerAccountModel.findOne({
      customer: new Types.ObjectId(crmCustomerId),
    })
      .select("_id")
      .lean()
      .exec();
    return account ? account._id.toString() : null;
  },

  async createAccount(data: {
    name: string;
    email: string;
    passwordHash: string;
    customer: unknown;
    emailVerifiedAt?: Date | null;
    termsAcceptedAt?: Date | null;
    termsVersion?: string | null;
  }): Promise<ICustomerAccount> {
    const doc = await CustomerAccountModel.create(data);
    return doc.toObject() as unknown as ICustomerAccount;
  },

  async updateProfile(id: string, patch: { name?: string }): Promise<ICustomerAccount | null> {
    return (await CustomerAccountModel.findByIdAndUpdate(id, patch, {
      new: true,
      runValidators: true,
    })
      .lean()
      .exec()) as unknown as ICustomerAccount | null;
  },

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await CustomerAccountModel.updateOne(
      { _id: id },
      { $set: { passwordHash, passwordChangedAt: new Date() } },
    ).exec();
  },

  async findSessionByTokenHash(tokenHash: string): Promise<ICustomerRefreshSession | null> {
    return (await CustomerRefreshSessionModel.findOne({ tokenHash })
      .lean()
      .exec()) as unknown as ICustomerRefreshSession | null;
  },

  async createSession(data: CreateSessionInput): Promise<ICustomerRefreshSession> {
    const doc = await CustomerRefreshSessionModel.create(data);
    return doc.toObject() as unknown as ICustomerRefreshSession;
  },

  async revokeSession(id: string): Promise<void> {
    await CustomerRefreshSessionModel.updateOne(
      { _id: id },
      { $set: { revokedAt: new Date() } },
    ).exec();
  },

  /** Reuse detection: revoke the token and everything rotated from it. */
  async revokeChain(tokenHash: string): Promise<void> {
    await CustomerRefreshSessionModel.updateMany(
      {
        $or: [{ tokenHash }, { rotatedFrom: tokenHash }],
        revokedAt: null,
      },
      { $set: { revokedAt: new Date() } },
    ).exec();
  },

  async revokeAllForAccount(accountId: string): Promise<void> {
    await CustomerRefreshSessionModel.updateMany(
      { customerAccountId: accountId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    ).exec();
  },
};

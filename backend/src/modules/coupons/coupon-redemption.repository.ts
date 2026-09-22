import { Types } from "mongoose";
import { CouponRedemptionModel } from "./couponRedemption.model.js";

/**
 * Per-customer coupon redemption tracking (Phase 7).
 *
 * One `CouponRedemption` document exists per (Coupon, CRM Customer) pair. Its
 * `count` field records how many times that customer has redeemed the coupon, so
 * `perCustomerLimit > 1` is supported correctly (many coupons/tests default to 1,
 * but the count is always incremented rather than treating a record as "used
 * once ever"). A unique `{ couponId, customerId }` index guarantees a single
 * counter per pair.
 *
 * Customer identity is ALWAYS the resolved CRM Customer id supplied by the
 * caller (derived from `req.customer` via `ensureCrmCustomer`). It is never a
 * client-supplied value.
 */

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

export const couponRedemptionRepository = {
  /**
   * Atomically reserve one redemption for (coupon, customer).
   *
   * `perCustomerLimit <= 0` means "unlimited" (matches the `usageLimit: 0`
   * convention). When a limit applies, a baseline counter is ensured first
   * (a `$setOnInsert` upsert, isolated from the increment to avoid a Mongo
   * "path conflict"; colliding first-use inserts are swallowed as duplicate
   * keys). The actual reservation is a single-document `findOneAndUpdate` that
   * increments `count` ONLY while `count < perCustomerLimit`. Because MongoDB
   * applies the predicate and the `$inc` atomically to the matched document
   * and this increment step has no upsert, concurrent requests can never push
   * the counter past the limit and exactly one request wins the final slot.
   */
  async reserveForCustomer(
    couponId: string,
    customerId: string,
    perCustomerLimit: number,
  ): Promise<boolean> {
    const coupon = new Types.ObjectId(couponId);
    const customer = new Types.ObjectId(customerId);

    if (perCustomerLimit <= 0) {
      await CouponRedemptionModel.updateOne(
        { couponId: coupon, customerId: customer },
        { $inc: { count: 1 } },
        { upsert: true, setDefaultsOnInsert: false },
      ).exec();
      return true;
    }

    // Ensure a baseline counter exists (count 0 on first use). Racing first-use
    // inserts collide on the unique index; that is expected and ignored.
    try {
      await CouponRedemptionModel.updateOne(
        { couponId: coupon, customerId: customer },
        { $setOnInsert: { count: 0 } },
        { upsert: true, setDefaultsOnInsert: false },
      ).exec();
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }

    // Atomic conditional reservation: increment only while below the limit.
    const doc = await CouponRedemptionModel.findOneAndUpdate(
      {
        couponId: coupon,
        customerId: customer,
        count: { $lt: perCustomerLimit },
      },
      { $inc: { count: 1 } },
      { new: true },
    ).exec();
    return !!doc;
  },

  /** Compensate a previous reservation (rollback on failed order creation). */
  async releaseForCustomer(couponId: string, customerId: string): Promise<void> {
    await CouponRedemptionModel.updateOne(
      {
        couponId: new Types.ObjectId(couponId),
        customerId: new Types.ObjectId(customerId),
      },
      [{ $set: { count: { $max: [{ $subtract: ["$count", 1] }, 0] } } }],
    ).exec();
  },

  /** Number of times this customer has redeemed the coupon (0 when none). */
  async getCustomerUsage(couponId: string, customerId: string): Promise<number> {
    const doc = await CouponRedemptionModel.findOne({
      couponId: new Types.ObjectId(couponId),
      customerId: new Types.ObjectId(customerId),
    })
      .lean()
      .exec();
    return doc?.count ?? 0;
  },
};

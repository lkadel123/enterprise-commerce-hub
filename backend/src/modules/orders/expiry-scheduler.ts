import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { orderService } from "./order.service.js";

/**
 * Phase 18 (G18-03) — in-process order-expiry sweep scheduler.
 *
 * Robustness model
 * ---------------
 * - The database `expiresAt` timestamp is the single source of truth; the job
 *   only *discovers* overdue Pending orders and applies a SAFE transition via
 *   the existing atomic `expirePendingById` conditional update. The scheduler
 *   is never authoritative.
 * - Restart / delayed execution / already-expired / already-finalized records:
 *   `listPendingToExpire` only picks Pending, unpaid, past-deadline orders, and
 *   `expirePendingById` only succeeds while the order is still Pending + unpaid
 *   + past-deadline. Re-running over already-expired (or cancelled/paid) orders
 *   is therefore a no-op, so catching up after a restart or a missed tick is
 *   naturally idempotent.
 * - Overlapping executions / multiple instances: each order is expired through
 *   a single atomic `findOneAndUpdate`, so two workers racing on the same order
 *   cannot both finalize it. In-process we also refuse to start a new sweep
 *   while one is still running.
 * - Transient database failures: errors are caught and logged at the sweep
 *   level; the next tick retries. Overdue orders are re-discovered each run, so
 *   a failed sweep loses nothing.
 *
 * No new queue system / Redis / BullMQ is introduced — the atomic per-order
 * transition already guarantees cross-instance correctness.
 */

/** Guards against overlapping sweeps in this process. */
let runInProgress = false;

/** Owned timers so the scheduler can be stopped cleanly (tests/shutdown). */
let activeTimers: (NodeJS.Timeout | number)[] = [];

/**
 * Execute one guarded sweep of the pending-order expiry job. Safe to call
 * directly (or from the timer). Never throws: transient DB failures are logged
 * so the next tick retries.
 */
export async function runOrderExpirySweep(): Promise<void> {
  if (runInProgress) {
    logger.debug("Order expiry sweep skipped — previous sweep still running");
    return;
  }
  runInProgress = true;
  try {
    const { expired } = await orderService.expirePendingOrders();
    if (expired.length > 0) {
      logger.info({ count: expired.length }, "Order expiry sweep expired pending orders");
    }
  } catch (error) {
    // Transient failure — do not crash the process; retry on the next tick.
    logger.error({ error }, "Order expiry sweep failed; will retry on next tick");
  } finally {
    runInProgress = false;
  }
}

/** Start the in-process sweep timer. No-op if already running or disabled. */
export function startOrderExpiryScheduler(): void {
  if (activeTimers.length > 0) return;
  if (env.ORDER_EXPIRY_SWEEP_ENABLED !== "true") {
    logger.info("Order expiry scheduler disabled via ORDER_EXPIRY_SWEEP_ENABLED=false");
    return;
  }
  const intervalMs = env.ORDER_EXPIRY_SWEEP_INTERVAL_MS;
  logger.info(`Order expiry scheduler started (interval ${intervalMs}ms)`);
  // Run once shortly after startup to catch anything that fell behind while the
  // process was down (restart catch-up), then on the interval. `unref` lets the
  // event loop exit cleanly during graceful shutdown.
  const initial: NodeJS.Timeout = setTimeout(() => {
    void runOrderExpirySweep();
  }, Math.min(intervalMs, 1000));
  initial.unref?.();
  const recurring = setInterval(() => {
    void runOrderExpirySweep();
  }, intervalMs);
  recurring.unref?.();
  activeTimers = [initial, recurring];
}

/** Stop the in-process sweep timer (used by graceful shutdown and tests). */
export function stopOrderExpiryScheduler(): void {
  for (const timer of activeTimers) {
    if (typeof timer === "number") clearInterval(timer);
    else {
      clearTimeout(timer);
      clearInterval(timer);
    }
  }
  activeTimers = [];
  logger.info("Order expiry scheduler stopped");
}

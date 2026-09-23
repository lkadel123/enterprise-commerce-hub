import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDB, disconnectDB } from "./database/connection.js";
import { logger } from "./utils/logger.js";
import {
  startOrderExpiryScheduler,
  stopOrderExpiryScheduler,
} from "./modules/orders/expiry-scheduler.js";

async function bootstrap(): Promise<void> {
  await connectDB();

  const app = createApp();
  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(`API listening on http://${env.HOST}:${env.PORT} (${env.NODE_ENV})`);
  });

  // Phase 18 (G18-03): in-process pending-order expiry sweep. The database
  // timestamps remain authoritative; the job only discovers overdue Pending
  // orders and applies an atomic, idempotent transition.
  startOrderExpiryScheduler();

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received — shutting down gracefully`);

    stopOrderExpiryScheduler();

    server.close(() => {
      void disconnectDB()
        .then(() => {
          logger.info("HTTP server and database connection closed");
          process.exit(0);
        })
        .catch((error) => {
          logger.error({ error }, "Error during shutdown");
          process.exit(1);
        });
    });

    // Force-exit if graceful shutdown stalls.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((error) => {
  logger.error({ error }, "Failed to bootstrap server");
  process.exit(1);
});

/**
 * ---------------------------------------------------------------------------
 * Fatal process-level error handling (Phase 19 production hardening).
 * ---------------------------------------------------------------------------
 *
 * Node terminates the process on an unhandled promise rejection (v15+) and on
 * an uncaught exception, but WITHOUT a structured final log entry — the crash
 * then looks like a silent restart in Passenger/cPanel and is nearly impossible
 * to diagnose. These handlers make the failure explicit and observable:
 *
 *  - `logger.fatal(...)` writes the reason into the structured log stream (the
 *    same stream that carries request logs and goes to the app's cPanel log
 *    files), so the cause of the restart is preserved.
 *  - `process.exit(1)` is called ONLY AFTER the log call: continuing to run in
 *    an undefined/unknown state risks corrupting data or serving traffic from a
 *    broken process, and the non-zero code tells the supervisor (Passenger) that
 *    a restart is required.
 *
 * Fatal errors are never swallowed: there is no try/catch around these, and no
 * `return` before the exit. A startup failure (bootstrap rejection) is handled
 * separately above so it does not double-log through the uncaught path.
 */
function handleFatal(kind: string, error: unknown): void {
  // Log at the highest severity so the entry survives any production log level
  // filter (LOG_LEVEL=info/warn still emits "fatal"). The pino logger already
  // redacts credentials/cookies; the error object carries no secrets by design.
  logger.fatal({ error, kind }, `Fatal ${kind} — process will exit`);
}

process.on("unhandledRejection", (reason: unknown) => {
  handleFatal("unhandledRejection", reason);
  process.exit(1);
});

process.on("uncaughtException", (error: Error) => {
  handleFatal("uncaughtException", error);
  process.exit(1);
});

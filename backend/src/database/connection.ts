import mongoose from "mongoose";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

function getMongoErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    error: String(error),
  };
}

export async function connectDB(): Promise<void> {
  mongoose.set("debug", env.MONGO_DEBUG);

  mongoose.connection.on("connected", () => {
    logger.info("MongoDB connected");
  });

  mongoose.connection.on("error", (error) => {
    logger.error(
      {
        mongoError: getMongoErrorDetails(error),
      },
      "MongoDB connection error",
    );
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected");
  });

  try {
    await mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 20,
    });
  } catch (error) {
    logger.error(
      {
        mongoError: getMongoErrorDetails(error),
      },
      "Failed to connect to MongoDB",
    );

    throw error;
  }

  // Make the schema's unique indexes effective before this process serves
  // traffic (see `ensureIndexes` for why this cannot be left to Mongoose).
  await ensureIndexes();
}

/**
 * Awaits every registered model's index build.
 *
 * Mongoose builds `autoIndex` indexes in the background — `mongoose.connect()`
 * resolves (and the API starts accepting writes) before `createIndexes` has
 * run, so a write landing in that window is not constrained by the schema's
 * unique indexes. Worse, if it inserts a duplicate, the index build itself
 * fails with E11000 and the index stays missing until the next attempt, which
 * silently disables uniqueness (e.g. the Phase 16B per-customer order
 * idempotency index).
 *
 * A failing build is reported loudly but does not block boot: the connection
 * itself is healthy, and the idempotency paths additionally recover from
 * duplicate-key errors at the service layer.
 */
export async function ensureIndexes(): Promise<void> {
  try {
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  } catch (error) {
    logger.error(
      { mongoError: getMongoErrorDetails(error) },
      "MongoDB index build failed — unique constraints may not be enforced yet",
    );
  }
}

export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

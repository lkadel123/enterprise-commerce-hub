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
}

export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Shared in-memory MongoDB singleton for the integration test suite.
 *
 * Vitest runs all test files in a single forked process (see vitest.config.ts)
 * so this module-level singleton is shared. Each test file calls `connect()`
 * once in `beforeAll` and clears the database between tests.
 */
let mongod: MongoMemoryServer | null = null;
let connected = false;

export async function connect(): Promise<void> {
  if (connected) return;
  if (!mongod) {
    mongod = await MongoMemoryServer.create();
  }
  await mongoose.connect(mongod.getUri(), {
    serverSelectionTimeoutMS: 30_000,
  });
  connected = true;
}

export async function clearDatabase(): Promise<void> {
  if (!connected) return;
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

export async function disconnect(): Promise<void> {
  if (connected) {
    await mongoose.disconnect();
    connected = false;
  }
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}

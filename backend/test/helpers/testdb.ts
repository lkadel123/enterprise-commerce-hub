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
  // Mongoose builds `autoIndex` indexes in the background: neither this
  // `connect()` nor the first write waits for them, so an early write is NOT
  // constrained by the schema's unique indexes. A duplicate inserted inside that
  // window makes `createIndexes` itself fail with E11000, and the index then
  // stays missing for the rest of the shared in-memory database — silently
  // disabling uniqueness for the whole run (this is what let three concurrent
  // `Idempotency-Key` requests create three orders). Awaiting every model's
  // index build makes uniqueness effective from the very first write.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
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

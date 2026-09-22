// One-off helper: downloads the mongod binary used by mongodb-memory-server
// (cached under node_modules/.cache/mongodb-memory-server) and verifies that an
// in-memory MongoDB can actually boot in this environment.
import { MongoMemoryServer } from "mongodb-memory-server";

const mongod = await MongoMemoryServer.create({
  instance: { storageEngine: "wiredTiger" },
});
console.log(`mongodb-memory-server READY at ${mongod.getUri()}`);
await mongod.stop();
console.log("stopped");

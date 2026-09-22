import { ApiError } from "../utils/ApiError.js";

/**
 * Fail-closed guard against accidental seeding of a production database.
 *
 * Seeding creates default users with known passwords and sample data, none of
 * which must ever run against production by accident. Development and test
 * environments are unaffected (NODE_ENV is not "production" there). To
 * intentionally seed a production database, an operator must explicitly set
 * both NODE_ENV=production AND ALLOW_PROD_SEED=1 in the same environment.
 *
 * Lives in its own module so tests (and any other consumer) can import the
 * guard without importing seed.ts, whose module scope connects to the database
 * and runs the seeder as a side effect.
 */
export function assertSeedAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === "production" && env.ALLOW_PROD_SEED !== "1") {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Refusing to seed: NODE_ENV is 'production'. Seeding creates default users with " +
        "known passwords and sample data. If you REALLY intend to seed a production " +
        "database, re-run with ALLOW_PROD_SEED=1 set in the environment.",
    );
  }
}

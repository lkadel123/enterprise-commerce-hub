/**
 * Backup/restore policy helpers for MongoDB (Phase 12).
 *
 * Pure, framework-free functions so the policy is unit-testable and the CLI
 * (`scripts/backup-restore.ts`) stays thin. No Mongo client / network is used
 * here — the actual `mongodump` / `mongorestore` tools are invoked by the CLI.
 */

export interface MongoTarget {
  /** Connection string, passed verbatim to the mongo tools. */
  uri: string;
  /** Database name extracted from the URI, or null when not present. */
  dbName: string | null;
}

/**
 * Extracts the database name from a MongoDB connection string.
 * Handles `mongodb://[user:pass@]host:port/db?opts` and `mongodb+srv://.../db`.
 * Returns null when no database path segment is present.
 */
export function parseMongoUri(uri: string): MongoTarget {
  const trimmed = uri.trim();
  let dbName: string | null = null;
  // Strip any `?query` / `#fragment` suffix, then take the first path segment
  // after the authority.
  const withoutQuery = (trimmed.split("?")[0] ?? trimmed).split("#")[0] ?? trimmed;
  const schemeEnd = withoutQuery.indexOf("://");
  // Everything before the first `/` after the scheme is the authority.
  const slashIndex = schemeEnd >= 0 ? withoutQuery.indexOf("/", schemeEnd + 3) : -1;
  if (slashIndex >= 0) {
    const path = withoutQuery.slice(slashIndex + 1);
    const segments = path.split("/").filter((s) => s.length > 0);
    if (segments.length > 0) dbName = segments[0];
  }
  return { uri: trimmed, dbName };
}

/** Redacts the password (but keeps the username) in any MongoDB URI found in
 *  the given text — works for a bare URI or one embedded in a longer string
 *  (e.g. a joined command line), so printed output never leaks credentials. */
export function redactUri(text: string): string {
  // mongodb://user:password@host[/...]  →  mongodb://user:***@host[/...]
  return text.replace(
    /((?:mongodb|mongodb\+srv):\/\/[^:/@\s]+:)([^@/\s]+)@/g,
    (_m, userPortion, _password) => `${userPortion}***@`,
  );
}

export interface BackupOptions {
  uri: string;
  dbName: string | null;
  outDir: string;
}

/** Builds the `mongodump` argv (the URI carries credentials — never printed). */
export function buildBackupArgs({ uri, dbName, outDir }: BackupOptions): string[] {
  const args = ["--uri", uri, "--out", outDir];
  if (dbName) args.push("--db", dbName);
  return args;
}

export interface RestoreOptions {
  uri: string;
  dbName: string | null;
  restoreDir: string;
  /** Drop existing collections in the target database before restoring. */
  drop: boolean;
}

/** Builds the `mongorestore` argv. */
export function buildRestoreArgs({ uri, dbName, restoreDir, drop }: RestoreOptions): string[] {
  const args = ["--uri", uri, "--dir", restoreDir];
  if (dbName) args.push("--nsInclude", `${dbName}.*`);
  if (drop) args.push("--drop");
  return args;
}

/** Result of a restore safety check. */
export interface RestoreSafety {
  allowed: boolean;
  reason?: string;
}

/**
 * Decides whether a restore is permitted for the given environment.
 *
 * Restoring into a running database can overwrite production data. Require:
 *  - an explicit confirmation flag, and
 *  - for the production environment an additional `ALLOW_PRODUCTION_RESTORE=1`
 *    opt-out (so a mistyped confirm can never damage prod).
 */
export function restoreSafetyCheck(args: {
  nodeEnv: string;
  confirmRestore: boolean;
  allowProductionRestore: boolean;
}): RestoreSafety {
  const { nodeEnv, confirmRestore, allowProductionRestore } = args;
  if (!confirmRestore) {
    return { allowed: false, reason: "Restore requires --confirm-restore." };
  }
  if (nodeEnv === "production" && !allowProductionRestore) {
    return {
      allowed: false,
      reason:
        "Refusing restore into the 'production' environment. " +
        "Set ALLOW_PRODUCTION_RESTORE=1 (in addition to --confirm-restore) " +
        "only after an explicit, documented and reversible restore plan and a " +
        "verified recent backup exist.",
    };
  }
  return { allowed: true };
}

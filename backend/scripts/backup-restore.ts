#!/usr/bin/env tsx
/**
 * MongoDB backup / restore CLI (Phase 12).
 *
 * Thin wrapper around the official `mongodump` / `mongorestore` tools, using the
 * same connection string the API reads (`MONGO_URI`). Credentials are never
 * hardcoded — they come from the URL and are redacted in any printed output.
 *
 * Usage:
 *   node scripts/backup-restore.ts --command backup --uri "$MONGO_URI" --out ./backups
 *   node scripts/backup-restore.ts --command verify --from ./backups --uri "$MONGO_URI"
 *   node scripts/backup-restore.ts --command restore --from ./backups --uri "$MONGO_URI" \
 *       --confirm-restore                 # non-production
 *   ALLOW_PRODUCTION_RESTORE=1 node scripts/backup-restore.ts --command restore \
 *       --from ./backups --uri "$MONGO_URI" --confirm-restore   # production, explicit only
 *
 * Environment:
 *   MONGO_URI   connection string (required by CLI, or pass --uri)
 *   BACKUP_DIR  default --out / --from directory
 *   NODE_ENV    used by the production-restore safety check
 *
 * Safety:
 *   - `restore` always requires --confirm-restore.
 *   - `restore` into NODE_ENV=production additionally requires
 *     ALLOW_PRODUCTION_RESTORE=1.
 *   - `--dry-run` prints the exact command without executing anything.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import process from "node:process";
import {
  buildBackupArgs,
  buildRestoreArgs,
  parseMongoUri,
  redactUri,
  restoreSafetyCheck,
} from "../src/utils/backupPolicy.js";

type Command = "backup" | "restore" | "verify" | "help";

interface CliArgs {
  command: Command;
  uri: string;
  outDir: string;
  fromDir: string;
  dbName: string | null;
  drop: boolean;
  dryRun: boolean;
  confirmRestore: boolean;
  allowProductionRestore: boolean;
}

function usage(): void {
  console.log(
    [
      "MongoDB backup/restore CLI",
      "  --command backup|restore|verify|help",
      "  --uri <connection-string>      (or env MONGO_URI)",
      "  --out <dir>                    backup output directory (or env BACKUP_DIR)",
      "  --from <dir>                   restore/verify source directory",
      "  --drop                         drop target DB collections before restore",
      "  --dry-run                      print commands only",
      "  --confirm-restore              required for restore",
      "  --allow-production-restore     required for restore when NODE_ENV=production",
    ].join("\n"),
  );
}
function parseArgs(argv: string[]): CliArgs {
  const raw: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      raw[key] = next;
      i++;
    } else {
      raw[key] = "true";
    }
  }

  const command = (raw.command ?? "help") as Command;
  if (!["backup", "restore", "verify", "help"].includes(command)) {
    throw new Error(`Unknown --command '${raw.command}'.`);
  }

  const uri = raw.uri ?? process.env.MONGO_URI ?? "";
  if (!uri && command !== "help") {
    throw new Error("Missing connection string: pass --uri or set MONGO_URI.");
  }

  return {
    command,
    uri,
    outDir: raw.out ?? process.env.BACKUP_DIR ?? "../backups",
    fromDir: raw.from ?? process.env.BACKUP_DIR ?? "../backups",
    dbName: raw.db ? raw.db : parseMongoUri(uri).dbName,
    drop: raw.drop === "true",
    dryRun: raw["dry-run"] === "true",
    confirmRestore: raw["confirm-restore"] === "true",
    allowProductionRestore:
      raw["allow-production-restore"] === "true" || process.env.ALLOW_PRODUCTION_RESTORE === "1",
  };
}

function run(tool: string, args: string[], dryRun: boolean): number {
  if (dryRun) {
    // Never print credentials: pass every argument through the URI redactor.
    const safe = args.map((arg) => redactUri(arg));
    console.log(`[dry-run] ${tool} ${safe.join(" ")}`);
    return 0;
  }
  console.log(`Running ${tool}…`);
  const result = spawnSync(tool, args, { stdio: "inherit" });
  return result.status ?? 1;
}

function main(): void {
  const cli = parseArgs(process.argv.slice(2));

  switch (cli.command) {
    case "help": {
      usage();
      return;
    }
    case "backup": {
      if (!cli.outDir) throw new Error("Backup requires --out (or BACKUP_DIR).");
      mkdirSync(cli.outDir, { recursive: true });
      const args = buildBackupArgs({ uri: cli.uri, dbName: cli.dbName, outDir: cli.outDir });
      console.log(
        `Backing up database '${cli.dbName ?? "<all>"}' from ${redactUri(cli.uri)} into ${cli.outDir}`,
      );
      process.exitCode = run("mongodump", args, cli.dryRun);
      return;
    }
    case "verify": {
      if (!existsSync(cli.fromDir)) {
        throw new Error(`Verify source directory '${cli.fromDir}' does not exist.`);
      }
      const args = ["--uri", cli.uri, "--dir", cli.fromDir, "--dryRun"];
      console.log(`Verifying backup in ${cli.fromDir} (dryRun — reads only, no writes).`);
      process.exitCode = run("mongorestore", args, cli.dryRun);
      return;
    }
    case "restore": {
      // Safety gate FIRST — never touch the filesystem (or leak its state)
      // before the environment/confirmation guard has passed.
      const safety = restoreSafetyCheck({
        nodeEnv: process.env.NODE_ENV ?? "development",
        confirmRestore: cli.confirmRestore,
        allowProductionRestore: cli.allowProductionRestore,
      });
      if (!safety.allowed) {
        console.error(`Restore blocked: ${safety.reason}`);
        process.exitCode = 1;
        return;
      }
      if (!existsSync(cli.fromDir)) {
        throw new Error(`Restore source directory '${cli.fromDir}' does not exist.`);
      }
      const args = buildRestoreArgs({
        uri: cli.uri,
        dbName: cli.dbName,
        restoreDir: cli.fromDir,
        drop: cli.drop,
      });
      console.log(
        `Restoring into ${redactUri(cli.uri)} from ${cli.fromDir}${cli.drop ? " (with --drop)" : ""}.`,
      );
      process.exitCode = run("mongorestore", args, cli.dryRun);
      return;
    }
  }
}

try {
  main();
} catch (error) {
  console.error(`backup-restore: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

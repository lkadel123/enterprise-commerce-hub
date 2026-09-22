import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { getApp } from "./helpers/fixtures.js";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import {
  buildBackupArgs,
  buildRestoreArgs,
  parseMongoUri,
  redactUri,
  restoreSafetyCheck,
} from "../src/utils/backupPolicy.js";
import { getErrorMonitoringStatus } from "../src/observability/errorReporter.js";
import { LOG_REDACT_CENSOR, LOG_REDACT_PATHS } from "../src/utils/logger.js";

/**
 * Phase 12 production-hardening regression tests.
 *
 * Verifies the hardening additions without touching production data:
 *  - security headers + no `x-powered-by`
 *  - request correlation id (X-Request-Id) — echoed, and client values accepted
 *  - liveness / readiness endpoints
 *  - error-monitoring status is disabled when no DSN is configured
 *  - backup/restore policy helpers (URI parsing, redaction, safety checks)
 */
const app = getApp();

describe("Phase 12 production hardening", () => {
  beforeAll(async () => {
    await connect();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await disconnect();
  });

  it("sends security headers and does not leak x-powered-by", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["content-security-policy"]).toBeTruthy();
    expect(res.headers["strict-transport-security"]).toBeTruthy();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });

  it("assigns and echoes a request correlation id", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("honours a client-supplied X-Request-Id and echoes it back", async () => {
    const traceId = "corr-trace-abcdef-1234";
    const res = await request(app).get("/health").set("X-Request-Id", traceId);
    expect(res.headers["x-request-id"]).toBe(traceId);
  });

  it("exposes a liveness endpoint that always reports live", async () => {
    const res = await request(app).get("/health/live");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("live");
  });

  it("readiness reflects database connectivity", async () => {
    // Connected → ready.
    const ok = await request(app).get("/health/ready");
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe("ready");

    // Simulate a DB outage → not ready (503), readiness/liveness keep distinct.
    await disconnect();
    const down = await request(app).get("/health/ready");
    expect(down.status).toBe(503);
    expect(down.body.data.status).toBe("not_ready");
    const liveWhileDown = await request(app).get("/health/live");
    expect(liveWhileDown.status).toBe(200);

    // Restore for the remainder of the suite.
    await connect();
    const restored = await request(app).get("/health/ready");
    expect(restored.status).toBe(200);
  });

  it("reports error-monitoring as disabled when no DSN is configured", async () => {
    const status = await getErrorMonitoringStatus();
    expect(status.dsn).toBe(false);
    expect(status.enabled).toBe(false);
    expect(status.sdkInstalled).toBe(false);
  });

  it("redacts Authorization headers and cookies in request logs", () => {
    // The redaction policy must cover the credential-bearing request fields and
    // substitute a non-reversible censor — bearer/refresh tokens must never be
    // logged in cleartext.
    const paths = LOG_REDACT_PATHS.map((p) => String(p));
    expect(paths).toContain("req.headers.authorization");
    expect(paths).toContain("req.headers.cookie");
    expect(LOG_REDACT_CENSOR).toBe("***");
    expect(LOG_REDACT_CENSOR.length).toBeGreaterThan(0);
  });

  it("never echoes credential headers back in a response body", async () => {
    const secret = "Bearer phase12-secret-token-value";
    const res = await request(app)
      .get("/health")
      .set("Authorization", secret)
      .set("Cookie", `customer_refresh_token=phase12-refresh-secret; HttpOnly`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(secret);
    expect(JSON.stringify(res.body)).not.toContain("phase12-refresh-secret");
  });
});

describe("Phase 12 backup policy", () => {
  it("extracts the database name from plain and srv URIs", () => {
    expect(parseMongoUri("mongodb://127.0.0.1:27017/ech").dbName).toBe("ech");
    expect(
      parseMongoUri("mongodb+srv://user:pass@cluster.example.net/app?retryWrites=true").dbName,
    ).toBe("app");
    expect(parseMongoUri("mongodb://127.0.0.1:27017").dbName).toBeNull();
  });

  it("redacts the password but keeps the username in a URI", () => {
    const redacted = redactUri("mongodb://alice:supersecret@db.example.com/ech");
    expect(redacted).toBe("mongodb://alice:***@db.example.com/ech");
    expect(redacted).not.toContain("supersecret");
  });

  it("builds mongodump args and never prints raw credentials", () => {
    const args = buildBackupArgs({
      uri: "mongodb://alice:supersecret@h/db",
      dbName: "db",
      outDir: "./backups",
    });
    // The tool needs the connection string on its command line…
    expect(args).toContain("--uri");
    expect(args).toContain("mongodb://alice:supersecret@h/db");
    expect(args).toContain("--db");
    expect(args).toContain("db");
    // …but anything *printed* must go through redactUri (no password).
    const printable = redactUri(args.join(" "));
    expect(printable).not.toContain("supersecret");
    expect(printable).toContain("alice:***@h/db");
  });

  it("builds mongorestore args with namespace + optional drop", () => {
    const without = buildRestoreArgs({
      uri: "mongodb://h/db",
      dbName: "db",
      restoreDir: "./backups",
      drop: false,
    });
    expect(without).toContain("--nsInclude");
    expect(without).toContain("db.*");
    expect(without).not.toContain("--drop");

    const withDrop = buildRestoreArgs({
      uri: "mongodb://h/db",
      dbName: "db",
      restoreDir: "./backups",
      drop: true,
    });
    expect(withDrop).toContain("--drop");
  });

  it("requires explicit confirmation for any restore", () => {
    expect(
      restoreSafetyCheck({
        nodeEnv: "development",
        confirmRestore: false,
        allowProductionRestore: false,
      }).allowed,
    ).toBe(false);
    expect(
      restoreSafetyCheck({
        nodeEnv: "development",
        confirmRestore: true,
        allowProductionRestore: false,
      }).allowed,
    ).toBe(true);
  });

  it("refuses production restore unless explicitly allowed", () => {
    expect(
      restoreSafetyCheck({
        nodeEnv: "production",
        confirmRestore: true,
        allowProductionRestore: false,
      }).allowed,
    ).toBe(false);

    const allowed = restoreSafetyCheck({
      nodeEnv: "production",
      confirmRestore: true,
      allowProductionRestore: true,
    });
    expect(allowed.allowed).toBe(true);
  });
});

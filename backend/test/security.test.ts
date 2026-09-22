import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import request from "supertest";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import { getApp, seedUser, userTokenFor, TEST_PASSWORD } from "./helpers/fixtures.js";
import { env } from "../src/config/env.js";

/**
 * Security-focused integration tests (Phase 9 audit).
 *
 * All requests run against the Express app mounted on an in-memory MongoDB, so
 * no production data is touched. These tests document the baseline behaviours
 * the security audit verifies:
 *   - 401 / 403 enforcement (auth + RBAC)
 *   - JWT validation (invalid, wrong-type, expired)
 *   - input validation (ObjectIds, enums, pagination, mass-assignment)
 *   - MongoDB operator-injection attempts
 *   - refresh-token lifecycle (rotation, reuse detection, logout invalidation)
 *   - CORS and security headers
 *   - rate-limit headers on credential endpoints
 */
const app = getApp();

describe("Security", () => {
  beforeAll(async () => {
    await connect();
  });
  beforeEach(async () => {
    await clearDatabase();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("rejects unauthenticated access to protected endpoints with 401", async () => {
    for (const path of [
      "/api/v1/products",
      "/api/v1/orders",
      "/api/v1/customers",
      "/api/v1/users",
      "/api/v1/inventory",
      "/api/v1/coupons",
      "/api/v1/reports/overview",
    ]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(401);
      expect(res.body.error.code, path).toBe("UNAUTHENTICATED");
    }
  });

  it("rejects an invalid JWT with 401", async () => {
    const res = await request(app)
      .get("/api/v1/products")
      .set("Authorization", "Bearer invalid.token.value");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects a JWT signed for a different purpose (type=refresh) with 401", async () => {
    const { user } = await userTokenFor("Super Admin");
    const refreshTyped = jwt.sign(
      {
        sub: user._id.toString(),
        role: user.role,
        name: user.name,
        email: user.email,
        type: "refresh",
      },
      env.JWT_ACCESS_SECRET,
      { algorithm: "HS256", expiresIn: "15m" },
    );
    const res = await request(app)
      .get("/api/v1/products")
      .set("Authorization", `Bearer ${refreshTyped}`);
    expect(res.status).toBe(401);
  });

  it("rejects an expired JWT with 401", async () => {
    const { user } = await userTokenFor("Super Admin");
    const expired = jwt.sign(
      {
        sub: user._id.toString(),
        role: user.role,
        name: user.name,
        email: user.email,
        type: "access",
      },
      env.JWT_ACCESS_SECRET,
      { algorithm: "HS256", expiresIn: -10 },
    );
    const res = await request(app)
      .get("/api/v1/products")
      .set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 422 for a malformed ObjectId on a protected route", async () => {
    const { header } = await userTokenFor("Super Admin");
    const res = await request(app).get("/api/v1/products/not-an-object-id").set(header);
    // Params are schema-validated before reaching the database, so a malformed
    // id is rejected as a validation error (never reaches Mongo).
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for a well-formed but missing ObjectId", async () => {
    const { header } = await userTokenFor("Super Admin");
    const res = await request(app).get("/api/v1/products/000000000000000000000000").set(header);
    expect(res.status).toBe(404);
  });

  it("returns 422 for an invalid request body", async () => {
    const { header } = await userTokenFor("Super Admin");
    const res = await request(app).post("/api/v1/products").set(header).send({ name: "Widget" }); // missing required sku/price/cost
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it("returns 422 for an invalid enum value", async () => {
    const { header } = await userTokenFor("Super Admin");
    const res = await request(app)
      .post("/api/v1/products")
      .set(header)
      .send({ name: "Widget", sku: "WID-1", price: 10, cost: 5, status: "Weird" });
    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid pagination (page=0)", async () => {
    const { header } = await userTokenFor("Super Admin");
    const res = await request(app).get("/api/v1/products?page=0").set(header);
    expect(res.status).toBe(422);
  });

  it("returns 422 for out-of-range pageSize", async () => {
    const { header } = await userTokenFor("Super Admin");
    const res = await request(app).get("/api/v1/products?pageSize=100000").set(header);
    expect(res.status).toBe(422);
  });

  it("rejects MongoDB operator injection in query parameters", async () => {
    const { header } = await userTokenFor("Super Admin");
    // page[$ne]=1 would be a NoSQL operator injection if not validated.
    const res = await request(app).get("/api/v1/products?page[$ne]=1").set(header);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects mass-assignment of non-schema fields", async () => {
    const { header } = await userTokenFor("Super Admin");
    const res = await request(app).post("/api/v1/products").set(header).send({
      name: "Widget",
      sku: "WID-9",
      price: 10,
      cost: 5,
      passwordHash: "pwned",
      isAdmin: true,
      _id: "000000000000000000000000",
    });
    // .strict() schemas reject unknown keys instead of silently storing them.
    expect(res.status).toBe(422);
  });

  it("forbids resource modification without the delete permission (403)", async () => {
    // Accountant can edit orders but has no catalog permissions.
    const { header } = await userTokenFor("Accountant");
    const res = await request(app).delete("/api/v1/products/000000000000000000000000").set(header);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects a refresh with an unknown cookie value", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", "refresh_token=invalid-token-value");
    expect(res.status).toBe(401);
  });

  it("invalidates the session on logout (old cookie cannot refresh again)", async () => {
    await seedUser({ email: "logout@test.com", role: "Super Admin" });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "logout@test.com", password: TEST_PASSWORD });
    expect(login.status).toBe(200);

    const cookie = login.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
    expect(cookie).toContain("refresh_token=");

    const logout = await request(app).post("/api/v1/auth/logout").set("Cookie", cookie);
    expect(logout.status).toBe(200);

    const refresh = await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie);
    expect(refresh.status).toBe(401);
  });

  it("rotates refresh tokens and detects replay of a rotated token", async () => {
    await seedUser({ email: "rotate@test.com", role: "Super Admin" });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "rotate@test.com", password: TEST_PASSWORD });
    const cookie1 = login.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";

    const refresh1 = await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie1);
    expect(refresh1.status).toBe(200);
    const cookie2 = refresh1.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
    expect(cookie2).not.toBe(cookie1);

    // Replaying the already-rotated token must be rejected (reuse detection).
    const replay = await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie1);
    expect(replay.status).toBe(401);

    // The successor chain was revoked as part of reuse detection.
    const refresh3 = await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie2);
    expect(refresh3.status).toBe(401);
  });

  it("does not set CORS headers for an unauthorized origin", async () => {
    const res = await request(app).get("/health").set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sets CORS headers for the configured origin with credentials", async () => {
    const res = await request(app).get("/health").set("Origin", "http://localhost:8080");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:8080");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("returns standard security headers", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("exposes rate-limit headers on credential endpoints", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@test.com", password: "wrong" });
    expect(res.status).toBe(401);
    // express-rate-limit draft-7 standard headers:
    expect(res.headers["ratelimit-policy"]).toBeTruthy();
    expect(res.headers["ratelimit"]).toBeTruthy();
  });

  it("does not return the refresh token in the response body", async () => {
    await seedUser({ email: "body@test.com", role: "Super Admin" });
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "body@test.com", password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).toBeUndefined();
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it("returns 404 JSON for unknown API routes without leaking internals", async () => {
    const res = await request(app).get("/api/v1/definitely-not-a-route");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
    // message must not echo an internal path beyond the requested URL
    expect(String(res.body.error.message)).not.toContain("backend\\src");
  });
});

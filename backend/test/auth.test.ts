import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import { getApp, seedUser, TEST_PASSWORD, userTokenFor } from "./helpers/fixtures.js";

const app = getApp();

describe("Authentication", () => {
  beforeAll(async () => {
    await connect();
  });
  beforeEach(async () => {
    await clearDatabase();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("logs in with valid credentials and returns an access token + user", async () => {
    await seedUser({ email: "login@test.com", role: "Super Admin", status: "Active" });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "login@test.com", password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.email).toBe("login@test.com");
    expect(res.body.data.permissions.length).toBeGreaterThan(0);
    // refresh token is delivered as an httpOnly cookie, never in the body
    expect(res.body.data.refreshToken).toBeUndefined();
    const setCookie = res.headers["set-cookie"] ?? [];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(";") : setCookie;
    expect(cookieHeader).toContain("refresh_token");
  });

  it("rejects an unknown email with 401", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@test.com", password: TEST_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects a wrong password with 401", async () => {
    await seedUser({ email: "pw@test.com", role: "Super Admin" });
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "pw@test.com", password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects a suspended account with 403", async () => {
    await seedUser({ email: "suspended@test.com", role: "Super Admin", status: "Suspended" });
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "suspended@test.com", password: TEST_PASSWORD });
    expect(res.status).toBe(403);
  });

  it("returns the current user via /auth/me", async () => {
    const { header } = await userTokenFor("Super Admin");
    const res = await request(app).get("/api/v1/auth/me").set(header);
    expect(res.status).toBe(200);
    expect(res.body.data.user).toBeTruthy();
    expect(res.body.data.permissions).toBeDefined();
  });

  it("rejects /auth/me without a token", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("changes the current password and revokes existing sessions", async () => {
    const { header, user } = await userTokenFor("Super Admin");
    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .set(header)
      .send({ currentPassword: TEST_PASSWORD, newPassword: "Newpass123!" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // the old password no longer works
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: TEST_PASSWORD });
    expect(login.status).toBe(401);
  });
});

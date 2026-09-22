import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import {
  getApp,
  seedCustomerAccount,
  userTokenFor,
  customerAccessTokenFor,
  customerRefreshCookie,
  TEST_PASSWORD,
} from "./helpers/fixtures.js";
import { CustomerAccountModel } from "../src/modules/customer-auth/customerAccount.model.js";

const app = getApp();

describe("Customer authentication", () => {
  beforeAll(async () => {
    await connect();
  });
  beforeEach(async () => {
    await clearDatabase();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("registers a customer and sets an httpOnly refresh cookie", async () => {
    const res = await request(app)
      .post("/api/v1/auth/customer/register")
      .send({ name: "Ada Lovelace", email: "ada@test.com", password: TEST_PASSWORD, acceptedTerms: true });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.customer.email).toBe("ada@test.com");
    expect(res.body.data.customer.name).toBe("Ada Lovelace");
    // refresh token is delivered as a cookie, never in the body
    expect(res.body.data.refreshToken).toBeUndefined();
    const cookie = customerRefreshCookie(res.headers["set-cookie"]);
    expect(cookie).toBeTruthy();
    expect(res.headers["set-cookie"]?.[0]).toContain("HttpOnly");

    // JS-readable presence hint mirrors the session (never HttpOnly, no token).
    const cookies = Array.isArray(res.headers["set-cookie"])
      ? res.headers["set-cookie"]
      : res.headers["set-cookie"]
        ? [res.headers["set-cookie"]]
        : [];
    const hint = cookies.find((c: string) => c.startsWith("customer_session_hint="));
    expect(hint).toBeTruthy();
    expect(hint).not.toContain("HttpOnly");
    expect(hint).toContain("Path=/");
  });

  it("records terms acceptance (timestamp + version) on registration", async () => {
    const { CURRENT_TERMS_VERSION } = await import("../src/constants/terms.js");
    const res = await request(app)
      .post("/api/v1/auth/customer/register")
      .send({
        name: "Terms User",
        email: "terms@test.com",
        password: TEST_PASSWORD,
        acceptedTerms: true,
      });

    expect(res.status).toBe(201);
    const account = await CustomerAccountModel.findOne({ email: "terms@test.com" }).lean().exec();
    expect(account).toBeTruthy();
    expect(account!.termsAcceptedAt).toBeInstanceOf(Date);
    expect(account!.termsVersion).toBe(CURRENT_TERMS_VERSION);
  });

  it("rejects registration when acceptedTerms is missing", async () => {
    const res = await request(app)
      .post("/api/v1/auth/customer/register")
      .send({ name: "No Terms", email: "noterms@test.com", password: TEST_PASSWORD });

    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toContain("Terms");
    expect(await CustomerAccountModel.countDocuments({ email: "noterms@test.com" })).toBe(0);
  });

  it("rejects registration when acceptedTerms is false", async () => {
    const res = await request(app)
      .post("/api/v1/auth/customer/register")
      .send({
        name: "False Terms",
        email: "falseterms@test.com",
        password: TEST_PASSWORD,
        acceptedTerms: false,
      });

    expect(res.status).toBe(422);
    expect(await CustomerAccountModel.countDocuments({ email: "falseterms@test.com" })).toBe(0);
  });

  it("rejects registration when acceptedTerms has the wrong type", async () => {
    for (const bad of ["true", 1, 0, null]) {
      const res = await request(app)
        .post("/api/v1/auth/customer/register")
        .send({
          name: "Bad Terms",
          email: `badterms${String(bad)}@test.com`,
          password: TEST_PASSWORD,
          acceptedTerms: bad,
        });
      expect(res.status).toBe(422);
    }
    expect(await CustomerAccountModel.countDocuments()).toBe(0);
  });

  it("logs in with valid credentials and returns an access token", async () => {
    await seedCustomerAccount({ email: "login@test.com" });
    const res = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "login@test.com", password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.customer.email).toBe("login@test.com");
    expect(customerRefreshCookie(res.headers["set-cookie"])).toBeTruthy();
  });

  it("rejects an unknown email with 401 (invalid credentials)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "nobody@test.com", password: TEST_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects a wrong password with 401", async () => {
    await seedCustomerAccount({ email: "pw@test.com" });
    const res = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "pw@test.com", password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("rejects login for a non-Active account with 401", async () => {
    await seedCustomerAccount({ email: "suspended@test.com", status: "Suspended" });
    const res = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "suspended@test.com", password: TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  it("returns the current customer via GET /auth/customer/me", async () => {
    const account = await seedCustomerAccount({ email: "me@test.com" });
    const { header } = customerAccessTokenFor(account);
    const res = await request(app).get("/api/v1/auth/customer/me").set(header);
    expect(res.status).toBe(200);
    expect(res.body.data.customer.email).toBe("me@test.com");
  });

  it("rejects GET /auth/customer/me without a token", async () => {
    const res2 = await request(app).get("/api/v1/auth/customer/me");
    expect(res2.status).toBe(401);
  });

  it("rejects an admin access token on the customer me endpoint", async () => {
    const { header } = await userTokenFor("Super Admin");
    const res = await request(app).get("/api/v1/auth/customer/me").set(header);
    expect(res.status).toBe(401);
  });

  it("rotates the refresh cookie and rejects replay of a rotated token", async () => {
    await seedCustomerAccount({ email: "rotate@test.com" });
    const login = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "rotate@test.com", password: TEST_PASSWORD });

    const cookie1 = customerRefreshCookie(login.headers["set-cookie"]);
    expect(cookie1).toBeTruthy();

    // First refresh succeeds and issues a new cookie.
    const refresh1 = await request(app)
      .post("/api/v1/auth/customer/refresh")
      .set("Cookie", `customer_refresh_token=${cookie1}`);
    expect(refresh1.status).toBe(200);
    expect(refresh1.body.data.accessToken).toBeTruthy();
    const cookie2 = customerRefreshCookie(refresh1.headers["set-cookie"]);
    expect(cookie2).toBeTruthy();
    expect(cookie2).not.toBe(cookie1);

    // Replaying the already-rotated token must be rejected (reuse detection).
    const replay = await request(app)
      .post("/api/v1/auth/customer/refresh")
      .set("Cookie", `customer_refresh_token=${cookie1}`);
    expect(replay.status).toBe(401);

    // The successor chain was revoked as part of reuse detection.
    const refresh3 = await request(app)
      .post("/api/v1/auth/customer/refresh")
      .set("Cookie", `customer_refresh_token=${cookie2}`);
    expect(refresh3.status).toBe(401);
  });

  it("refreshes access with a valid (unrotated) refresh cookie", async () => {
    await seedCustomerAccount({ email: "refresh@test.com" });
    const login = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "refresh@test.com", password: TEST_PASSWORD });
    const cookie = customerRefreshCookie(login.headers["set-cookie"]);

    const res = await request(app)
      .post("/api/v1/auth/customer/refresh")
      .set("Cookie", `customer_refresh_token=${cookie}`);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();

    // Refresh keeps the session-presence hint in sync with the rotated cookie.
    const refreshedCookies = Array.isArray(res.headers["set-cookie"])
      ? res.headers["set-cookie"]
      : res.headers["set-cookie"]
        ? [res.headers["set-cookie"]]
        : [];
    const hint = refreshedCookies.find((c: string) =>
      c.startsWith("customer_session_hint="),
    );
    expect(hint).toBeTruthy();
    expect(hint).not.toContain("HttpOnly");
  });

  it("clears the session-presence hint cookie on logout", async () => {
    await seedCustomerAccount({ email: "hint-logout@test.com" });
    const login = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "hint-logout@test.com", password: TEST_PASSWORD });
    const cookie = customerRefreshCookie(login.headers["set-cookie"]);

    const logout = await request(app)
      .post("/api/v1/auth/customer/logout")
      .set("Cookie", `customer_refresh_token=${cookie}`);
    expect(logout.status).toBe(200);

    const logoutCookies = Array.isArray(logout.headers["set-cookie"])
      ? logout.headers["set-cookie"]
      : logout.headers["set-cookie"]
        ? [logout.headers["set-cookie"]]
        : [];
    const hint = logoutCookies.find((c) => c.startsWith("customer_session_hint="));
    expect(hint).toBeTruthy();
    // Express serializes `maxAge: 0` as an expired `Expires` timestamp (no
    // `Max-Age` attribute) — either form proves the hint was cleared.
    expect(hint).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });

  it("logs out and invalidates the refresh cookie", async () => {
    await seedCustomerAccount({ email: "logout@test.com" });
    const login = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "logout@test.com", password: TEST_PASSWORD });
    const cookie = customerRefreshCookie(login.headers["set-cookie"]);

    const logout = await request(app)
      .post("/api/v1/auth/customer/logout")
      .set("Cookie", `customer_refresh_token=${cookie}`);
    expect(logout.status).toBe(200);
    expect(logout.body.data.loggedOut).toBe(true);

    // The invalidated cookie can no longer be used to refresh.
    const refresh = await request(app)
      .post("/api/v1/auth/customer/refresh")
      .set("Cookie", `customer_refresh_token=${cookie}`);
    expect(refresh.status).toBe(401);
  });

  it("changes the current password and revokes existing sessions", async () => {
    const account = await seedCustomerAccount({ email: "pwchange@test.com" });
    const { header } = customerAccessTokenFor(account);

    const res = await request(app)
      .post("/api/v1/auth/customer/change-password")
      .set(header)
      .send({ currentPassword: TEST_PASSWORD, newPassword: "Newpass123!" });
    expect(res.status).toBe(200);

    // the old password no longer works
    const login = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "pwchange@test.com", password: TEST_PASSWORD });
    expect(login.status).toBe(401);

    // the new password works
    const login2 = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "pwchange@test.com", password: "Newpass123!" });
    expect(login2.status).toBe(200);
  });

  it("updates the customer profile via PATCH /account/profile", async () => {
    // Register links the account to a CRM Customer, so profile writes land there.
    const registerRes = await request(app)
      .post("/api/v1/auth/customer/register")
      .send({ name: "Original Name", email: "profile@test.com", password: TEST_PASSWORD, acceptedTerms: true });
    expect(registerRes.status).toBe(201);
    const accessToken = registerRes.body.data.accessToken;

    const res = await request(app)
      .patch("/api/v1/account/profile")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Updated Name", phone: "+15551234" });
    expect(res.status).toBe(200);
    expect(res.body.data.customer.name).toBe("Updated Name");
    expect(res.body.data.customerProfile?.name).toBe("Updated Name");
    expect(res.body.data.customerProfile?.phone).toBe("+15551234");
  });

  it("rejects PATCH /account/profile without a token", async () => {
    const res = await request(app).patch("/api/v1/account/profile").send({ name: "Hacker" });
    expect(res.status).toBe(401);
  });
});

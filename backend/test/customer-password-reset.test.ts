import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import { getApp, seedCustomerAccount, TEST_PASSWORD } from "./helpers/fixtures.js";
import { hashToken } from "../src/utils/jwt.js";
import { CustomerAccountModel } from "../src/modules/customer-auth/customerAccount.model.js";
import { env } from "../src/config/env.js";
import { smtpEnabled, resetMailerForTests } from "../src/utils/mailer.js";

const app = getApp();

/**
 * Phase 9 — customer password reset security & functional tests.
 *
 * Covers the previously-broken chain: forgot-password must persist a
 * resetRequestId (so reset-password can look it up) and reset-password must
 * validate the requestId+token only through the stored hash — the raw token
 * is never returned by the API.
 *
 * Production-hardening coverage: forgot-password now DELIVERS the reset link
 * via SMTP. With SMTP disabled (test default) the endpoint must fail loudly
 * with 503 rather than silently discarding the link. With SMTP enabled the
 * emailed link must be built from the validated PUBLIC_BASE_URL, carry the
 * one-time token, and never be logged.
 */

/**
 * Capture what the mailer sends and give tests control over delivery. The
 * mock mirrors the real contract (throw on failure) without any network I/O.
 */
const sendMailMock = vi.fn(async () => undefined);
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));

vi.mock("nodemailer", () => ({
  default: { createTransport: (...args: unknown[]) => createTransportMock(...(args as [])) },
}));

/**
 * Configure SMTP for a test: sets env directly (env.ts has already been
 * loaded/validated at import time) and resets the cached transport so the
 * next send recreates it from the current values.
 */
function enableTestSmtp(): void {
  env.SMTP_ENABLED = true;
  env.SMTP_HOST = "smtp.test.local";
  env.SMTP_FROM = "no-reply@test.local";
  env.SMTP_USER = "";
  env.SMTP_PASSWORD = "";
  resetMailerForTests();
  sendMailMock.mockClear();
  createTransportMock.mockClear();
}

function disableTestSmtp(): void {
  env.SMTP_ENABLED = false;
  resetMailerForTests();
}

describe("Customer password reset", () => {
  beforeAll(async () => {
    await connect();
    // Default for this suite: SMTP "configured" (mocked transport) so the
    // delivery-dependent flows behave like production. Individual tests may
    // temporarily disable it to prove the loud-failure contract.
    enableTestSmtp();
  });
  afterAll(async () => {
    disableTestSmtp();
    await disconnect();
  });
  beforeEach(async () => {
    await clearDatabase();
    // Fresh mock accounting per test � call counts must never bleed between
    // tests or "not called" assertions would see earlier deliveries.
    sendMailMock.mockClear();
    createTransportMock.mockClear();
  });

  it("forgot-password returns a requestId and stages a reset token on the account", async () => {
    const account = await seedCustomerAccount({ email: "forgot@test.com" });

    const res = await request(app)
      .post("/api/v1/auth/customer/forgot-password")
      .send({ email: "forgot@test.com" });

    expect(res.status).toBe(200);
    const requestId = res.body.data?.requestId;
    expect(typeof requestId).toBe("string");
    expect(requestId).toMatch(/^[0-9a-f]{64}$/i);

    // The requestId + token hash + expiry must be persisted server-side.
    const stored = await CustomerAccountModel.findById(account._id).lean().exec();
    expect(stored?.resetRequestId).toBe(requestId);
    expect(stored?.resetTokenHash).toBeTruthy();
    expect(stored?.resetTokenExpiresAt).toBeTruthy();
    expect(new Date(stored!.resetTokenExpiresAt as Date).getTime()).toBeGreaterThan(Date.now());

    // Exactly one email is delivered � to the account's address.
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mail = sendMailMock.mock.calls[0][0] as {
      to: string;
      subject: string;
      text: string;
      html: string;
    };
    expect(mail.to).toBe("forgot@test.com");
    expect(mail.subject).toContain("Reset");
  });

  it("forgot-password does not leak whether an email exists", async () => {
    const res = await request(app)
      .post("/api/v1/auth/customer/forgot-password")
      .send({ email: "nobody@test.com" });

    expect(res.status).toBe(200);
    // A requestId is still returned so the response shape matches the
    // registered-email case; NO email is sent (nothing to deliver to).
    expect(res.body.data?.requestId).toMatch(/^[0-9a-f]{64}$/i);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("the emailed reset link uses PUBLIC_BASE_URL and carries the one-time token", async () => {
    await seedCustomerAccount({ email: "link@test.com" });

    const res = await request(app)
      .post("/api/v1/auth/customer/forgot-password")
      .send({ email: "link@test.com" });
    expect(res.status).toBe(200);
    const requestId = res.body.data.requestId as string;

    const mail = sendMailMock.mock.calls[0][0] as { text: string; html: string };
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain(`${env.PUBLIC_BASE_URL}/reset-password?requestId=${requestId}&token=`);
      // The token is a high-entropy one-time secret: long enough to resist
      // brute force, embedded only in the email (never the API response).
      const tokenInUrl = body.split("token=")[1]?.split(/[\s"'><]/)[0] ?? "";
      expect(tokenInUrl.length).toBeGreaterThanOrEqual(40);
    }
    // The raw token is never part of the API response body.
    expect(JSON.stringify(res.body)).not.toContain("token=");
  });

  it("fails loudly with 503 and stages nothing when SMTP is disabled", async () => {
    disableTestSmtp();
    try {
      const account = await seedCustomerAccount({ email: "disabled@test.com" });

      const res = await request(app)
        .post("/api/v1/auth/customer/forgot-password")
        .send({ email: "disabled@test.com" });

      // The reset operation must NOT pretend to succeed when the email could
      // not go anywhere � a staged token with no delivered link is a dead end.
      expect(res.status).toBe(503);
      expect(sendMailMock).not.toHaveBeenCalled();
      // Nothing was staged on the account either (the fixture may seed nulls).
      const stored = await CustomerAccountModel.findById(account._id).lean().exec();
      expect(stored?.resetRequestId ?? null).toBeFalsy();
      expect(stored?.resetTokenHash ?? null).toBeFalsy();
    } finally {
      enableTestSmtp();
    }
  });

  it("fails with 503 when the email transport errors � without leaking the token", async () => {
    await seedCustomerAccount({ email: "smtpfail@test.com" });
    sendMailMock.mockImplementationOnce(async () => {
      throw new Error("SMTP connection refused");
    });

    const res = await request(app)
      .post("/api/v1/auth/customer/forgot-password")
      .send({ email: "smtpfail@test.com" });

    expect(res.status).toBe(503);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    // The client-facing error must not echo the reset token or the internal
    // SMTP error details.
    expect(JSON.stringify(res.body)).not.toContain("token=");
    expect(JSON.stringify(res.body)).not.toContain("SMTP connection refused");
  });

  it("resets the password using a valid requestId + token", async () => {
    const account = await seedCustomerAccount({ email: "reset@test.com" });

    const forgot = await request(app)
      .post("/api/v1/auth/customer/forgot-password")
      .send({ email: "reset@test.com" });
    const requestId = forgot.body.data.requestId;

    // The raw token is not returned by the API; stage a known token hash on the
    // persisted request id to drive the reset (SHA-256 is deterministic).
    const knownToken = "a-valid-reset-token";
    await CustomerAccountModel.updateOne(
      { _id: account._id },
      {
        $set: {
          resetRequestId: requestId,
          resetTokenHash: hashToken(knownToken),
          resetTokenExpiresAt: new Date(Date.now() + 60_000),
        },
      },
    ).exec();

    const reset = await request(app)
      .post("/api/v1/auth/customer/reset-password")
      .send({ requestId, token: knownToken, newPassword: "Newpass123!" });
    expect(reset.status).toBe(200);

    // The reset credentials are single-use: all three fields are cleared.
    const cleared = await CustomerAccountModel.findById(account._id).lean().exec();
    expect(cleared?.resetRequestId).toBeUndefined();
    expect(cleared?.resetTokenHash).toBeUndefined();
    expect(cleared?.resetTokenExpiresAt).toBeUndefined();

    // New password authenticates; old password no longer does.
    const ok = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "reset@test.com", password: "Newpass123!" });
    expect(ok.status).toBe(200);

    const bad = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "reset@test.com", password: TEST_PASSWORD });
    expect(bad.status).toBe(401);
  });

  it("rejects reset with a malformed requestId", async () => {
    const res = await request(app)
      .post("/api/v1/auth/customer/reset-password")
      .send({ requestId: "not-a-valid-id", token: "a-token", newPassword: "Newpass123!" });
    expect(res.status).toBe(422);
  });

  it("rejects reset with a weak new password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/customer/reset-password")
      .send({
        requestId: "0".repeat(64),
        token: "a-token",
        newPassword: "123",
      });
    expect(res.status).toBe(422);
  });

  it("rejects a reset with an unknown requestId", async () => {
    const res = await request(app)
      .post("/api/v1/auth/customer/reset-password")
      .send({
        requestId: "f".repeat(64),
        token: "wrong-token",
        newPassword: "Newpass123!",
      });
    expect(res.status).toBe(401);
  });

  it("rejects a reset with a valid requestId but wrong token", async () => {
    const account = await seedCustomerAccount({ email: "wrong-token@test.com" });

    const forgot = await request(app)
      .post("/api/v1/auth/customer/forgot-password")
      .send({ email: "wrong-token@test.com" });
    const requestId = forgot.body.data.requestId;

    await CustomerAccountModel.updateOne(
      { _id: account._id },
      {
        $set: {
          resetRequestId: requestId,
          resetTokenHash: hashToken("the-real-token"),
          resetTokenExpiresAt: new Date(Date.now() + 60_000),
        },
      },
    ).exec();

    const res = await request(app)
      .post("/api/v1/auth/customer/reset-password")
      .send({ requestId, token: "a-different-token", newPassword: "Newpass123!" });
    expect(res.status).toBe(401);
  });
});

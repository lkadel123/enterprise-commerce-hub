import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import { getApp, seedCustomerAccount, customerAccessTokenFor } from "./helpers/fixtures.js";
import { SupportConversationModel } from "../src/modules/support/support-conversation.model.js";
import { SupportMessageModel } from "../src/modules/support/support-message.model.js";
import { Types } from "mongoose";

/**
 * Backend Phase 8 — customer support conversation security & functional tests.
 */
const app = getApp();

describe("Support conversations (Phase 8)", () => {
  beforeAll(async () => {
    await connect();
  });
  beforeEach(async () => {
    await clearDatabase();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/v1/customer/support/conversations");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects an inactive customer with 401", async () => {
    const account = await seedCustomerAccount({ status: "Suspended" });
    const { header } = customerAccessTokenFor(account);
    const res = await request(app).get("/api/v1/customer/support/conversations").set(header);
    expect(res.status).toBe(401);
  });

  it("creates a conversation with an initial message", async () => {
    const account = await seedCustomerAccount({ email: "create@test.com" });
    const { header } = customerAccessTokenFor(account);

    const res = await request(app)
      .post("/api/v1/customer/support/conversations")
      .set(header)
      .send({ subject: "Need help with my order", initialMessage: "My order hasn't arrived." });

    expect(res.status).toBe(201);
    expect(res.body.data.subject).toBe("Need help with my order");
    expect(res.body.data.status).toBe("open");
    expect(res.body.data.messages).toHaveLength(1);
    expect(res.body.data.messages[0].message).toBe("My order hasn't arrived.");
    expect(res.body.data.messages[0].senderType).toBe("customer");
  });

  it("rejects an empty subject or message", async () => {
    const account = await seedCustomerAccount({ email: "empty@test.com" });
    const { header } = customerAccessTokenFor(account);

    const res = await request(app)
      .post("/api/v1/customer/support/conversations")
      .set(header)
      .send({ subject: "", initialMessage: "Hello" });
    expect(res.status).toBe(422);
  });

  it("lists only the authenticated customer's conversations", async () => {
    const accountA = await seedCustomerAccount({ email: "list-a@test.com" });
    const accountB = await seedCustomerAccount({ email: "list-b@test.com" });
    const headerA = customerAccessTokenFor(accountA).header;
    const headerB = customerAccessTokenFor(accountB).header;

    await request(app)
      .post("/api/v1/customer/support/conversations")
      .set(headerA)
      .send({ subject: "A's conversation", initialMessage: "Hi from A" });

    await request(app)
      .post("/api/v1/customer/support/conversations")
      .set(headerB)
      .send({ subject: "B's conversation", initialMessage: "Hi from B" });

    const res = await request(app).get("/api/v1/customer/support/conversations").set(headerA);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].subject).toBe("A's conversation");
  });

  it("does not let a customer read another customer's conversation (IDOR)", async () => {
    const accountA = await seedCustomerAccount({ email: "idor-a@test.com" });
    const accountB = await seedCustomerAccount({ email: "idor-b@test.com" });
    const headerA = customerAccessTokenFor(accountA).header;
    const headerB = customerAccessTokenFor(accountB).header;

    const created = await request(app)
      .post("/api/v1/customer/support/conversations")
      .set(headerB)
      .send({ subject: "B's secret", initialMessage: "Private info" });
    expect(created.status).toBe(201);
    const convBId = created.body.data.id;

    const res = await request(app)
      .get(`/api/v1/customer/support/conversations/${convBId}`)
      .set(headerA);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("does not let a customer send a message to another customer's conversation (IDOR)", async () => {
    const accountA = await seedCustomerAccount({ email: "send-a@test.com" });
    const accountB = await seedCustomerAccount({ email: "send-b@test.com" });
    const headerA = customerAccessTokenFor(accountA).header;
    const headerB = customerAccessTokenFor(accountB).header;

    const created = await request(app)
      .post("/api/v1/customer/support/conversations")
      .set(headerB)
      .send({ subject: "B's conv", initialMessage: "Hello" });
    const convBId = created.body.data.id;

    const res = await request(app)
      .post(`/api/v1/customer/support/conversations/${convBId}/messages`)
      .set(headerA)
      .send({ message: "Intruder!" });
    expect(res.status).toBe(404);
  });

  it("allows a customer to add a message to their own conversation", async () => {
    const account = await seedCustomerAccount({ email: "msg@test.com" });
    const { header } = customerAccessTokenFor(account);

    const created = await request(app)
      .post("/api/v1/customer/support/conversations")
      .set(header)
      .send({ subject: "Follow-up", initialMessage: "First message" });
    const convId = created.body.data.id;

    const res = await request(app)
      .post(`/api/v1/customer/support/conversations/${convId}/messages`)
      .set(header)
      .send({ message: "Second message" });
    expect(res.status).toBe(201);
    expect(res.body.data.messages).toHaveLength(2);
  });

  it("rejects a message over 5000 characters", async () => {
    const account = await seedCustomerAccount({ email: "long@test.com" });
    const { header } = customerAccessTokenFor(account);

    const created = await request(app)
      .post("/api/v1/customer/support/conversations")
      .set(header)
      .send({ subject: "Test", initialMessage: "Hello" });
    const convId = created.body.data.id;

    const res = await request(app)
      .post(`/api/v1/customer/support/conversations/${convId}/messages`)
      .set(header)
      .send({ message: "x".repeat(5001) });
    expect(res.status).toBe(422);
  });

  it("deletes a customer's own conversation", async () => {
    const account = await seedCustomerAccount({ email: "delete@test.com" });
    const { header } = customerAccessTokenFor(account);

    const created = await request(app)
      .post("/api/v1/customer/support/conversations")
      .set(header)
      .send({ subject: "To delete", initialMessage: "Bye" });
    const convId = created.body.data.id;

    const res = await request(app)
      .delete(`/api/v1/customer/support/conversations/${convId}`)
      .set(header);
    expect(res.status).toBe(200);

    const count = await SupportConversationModel.countDocuments({ _id: convId });
    expect(count).toBe(0);
  });

  it("lists messages for the customer's own conversation via GET /:id/messages", async () => {
    const account = await seedCustomerAccount({ email: "msglist@test.com" });
    const { header } = customerAccessTokenFor(account);

    const created = await request(app)
      .post("/api/v1/customer/support/conversations")
      .set(header)
      .send({ subject: "Msg list", initialMessage: "First message" });
    const convId = created.body.data.id;

    await request(app)
      .post(`/api/v1/customer/support/conversations/${convId}/messages`)
      .set(header)
      .send({ message: "Second message" });

    const res = await request(app)
      .get(`/api/v1/customer/support/conversations/${convId}/messages`)
      .set(header);
    expect(res.status).toBe(200);
    expect(res.body.data.messages).toHaveLength(2);
    const messages = res.body.data.messages.map((m: { message: string }) => m.message);
    expect(messages).toContain("First message");
    expect(messages).toContain("Second message");
  });

  it("does not expose another customer's messages via GET /:id/messages (IDOR)", async () => {
    const accountA = await seedCustomerAccount({ email: "msglist-a@test.com" });
    const accountB = await seedCustomerAccount({ email: "msglist-b@test.com" });
    const headerA = customerAccessTokenFor(accountA).header;
    const headerB = customerAccessTokenFor(accountB).header;

    const created = await request(app)
      .post("/api/v1/customer/support/conversations")
      .set(headerB)
      .send({ subject: "B's secret thread", initialMessage: "Private info" });
    const convBId = created.body.data.id;

    const res = await request(app)
      .get(`/api/v1/customer/support/conversations/${convBId}/messages`)
      .set(headerA);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("marks the customer's conversation as read via PATCH /:id/read", async () => {
    const account = await seedCustomerAccount({ email: "markread@test.com" });
    const { header } = customerAccessTokenFor(account);

    const created = await request(app)
      .post("/api/v1/customer/support/conversations")
      .set(header)
      .send({ subject: "Read me", initialMessage: "Hello" });
    const convId = created.body.data.id;

    // Simulate an agent reply that is unread from the customer's perspective.
    await SupportMessageModel.create({
      conversationId: new Types.ObjectId(convId),
      senderType: "agent",
      senderId: new Types.ObjectId(),
      message: "Agent reply",
      read: false,
      readAt: null,
    });

    const res = await request(app)
      .patch(`/api/v1/customer/support/conversations/${convId}/read`)
      .set(header);
    expect(res.status).toBe(200);

    const agentMsg = await SupportMessageModel.findOne({
      conversationId: new Types.ObjectId(convId),
      senderType: "agent",
    }).lean();
    expect(agentMsg?.read).toBe(true);
    expect(agentMsg?.readAt).toBeTruthy();
  });

  it("repeated PATCH /:id/read remains safe and idempotent", async () => {
    const account = await seedCustomerAccount({ email: "read-idem@test.com" });
    const { header } = customerAccessTokenFor(account);

    const created = await request(app)
      .post("/api/v1/customer/support/conversations")
      .set(header)
      .send({ subject: "Idempotent", initialMessage: "Hello" });
    const convId = created.body.data.id;

    const first = await request(app)
      .patch(`/api/v1/customer/support/conversations/${convId}/read`)
      .set(header);
    const second = await request(app)
      .patch(`/api/v1/customer/support/conversations/${convId}/read`)
      .set(header);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it("does not let a customer mark another customer's conversation as read (IDOR)", async () => {
    const accountA = await seedCustomerAccount({ email: "read-a@test.com" });
    const accountB = await seedCustomerAccount({ email: "read-b@test.com" });
    const headerA = customerAccessTokenFor(accountA).header;
    const headerB = customerAccessTokenFor(accountB).header;

    const created = await request(app)
      .post("/api/v1/customer/support/conversations")
      .set(headerB)
      .send({ subject: "B's read", initialMessage: "Hello" });
    const convBId = created.body.data.id;

    const res = await request(app)
      .patch(`/api/v1/customer/support/conversations/${convBId}/read`)
      .set(headerA);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

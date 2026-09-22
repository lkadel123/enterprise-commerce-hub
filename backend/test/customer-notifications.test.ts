import { Types } from "mongoose";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import { getApp, seedCustomerAccount, customerAccessTokenFor } from "./helpers/fixtures.js";
import { NotificationModel } from "../src/modules/notifications/notification.model.js";

/**
 * Backend Phase 8 — customer notification security & functional tests.
 */
const app = getApp();

/** Seeds a customer-scoped notification for a given customer account id. */
async function seedCustomerNotification(
  customerAccountId: string | Types.ObjectId,
  overrides: Record<string, unknown> = {},
) {
  return NotificationModel.create({
    recipientId: customerAccountId,
    recipientType: "customer",
    type: "order",
    title: "Customer notification",
    message: "Your order is ready.",
    priority: "normal",
    read: false,
    ...overrides,
  });
}

describe("Customer notifications (Phase 8)", () => {
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
    const res = await request(app).get("/api/v1/customer/notifications");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("lists only the authenticated customer's notifications", async () => {
    const account = await seedCustomerAccount({ email: "list@test.com" });
    const { header } = customerAccessTokenFor(account);
    await seedCustomerNotification(account._id);
    await seedCustomerNotification(account._id, { read: true });

    const res = await request(app).get("/api/v1/customer/notifications").set(header);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(2);
  });

  it("does not return admin notifications to a customer", async () => {
    const account = await seedCustomerAccount({ email: "admin-mix@test.com" });
    const { header } = customerAccessTokenFor(account);
    await NotificationModel.create({
      recipientId: new Types.ObjectId(),
      type: "order",
      title: "Admin notification",
      read: false,
    });
    await seedCustomerNotification(account._id);

    const res = await request(app).get("/api/v1/customer/notifications").set(header);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("Customer notification");
  });

  it("returns the correct unread count", async () => {
    const account = await seedCustomerAccount({ email: "unread@test.com" });
    const { header } = customerAccessTokenFor(account);
    await seedCustomerNotification(account._id);
    await seedCustomerNotification(account._id);
    await seedCustomerNotification(account._id, { read: true });

    const res = await request(app).get("/api/v1/customer/notifications/unread-count").set(header);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(2);
  });

  it("filters by read status", async () => {
    const account = await seedCustomerAccount({ email: "filter@test.com" });
    const { header } = customerAccessTokenFor(account);
    await seedCustomerNotification(account._id);
    await seedCustomerNotification(account._id, { read: true });

    const unread = await request(app)
      .get("/api/v1/customer/notifications")
      .set(header)
      .query({ read: "false" });
    expect(unread.status).toBe(200);
    expect(unread.body.data).toHaveLength(1);
    expect(unread.body.data[0].read).toBe(false);

    const read = await request(app)
      .get("/api/v1/customer/notifications")
      .set(header)
      .query({ read: "true" });
    expect(read.body.data).toHaveLength(1);
    expect(read.body.data[0].read).toBe(true);
  });

  it("does not expose recipientId, metadata, or internal fields in the DTO", async () => {
    const account = await seedCustomerAccount({ email: "dto@test.com" });
    const { header } = customerAccessTokenFor(account);
    const doc = await seedCustomerNotification(account._id, {
      metadata: { internalAdminNote: "secret" },
    });

    const res = await request(app)
      .get(`/api/v1/customer/notifications/${doc._id.toString()}`)
      .set(header);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(doc._id.toString());
    expect(res.body.data.recipientId).toBeUndefined();
    expect(res.body.data.recipientType).toBeUndefined();
    expect(res.body.data.metadata).toBeUndefined();
  });

  it("returns a notification by id", async () => {
    const account = await seedCustomerAccount({ email: "get@test.com" });
    const { header } = customerAccessTokenFor(account);
    const doc = await seedCustomerNotification(account._id, { type: "review" });

    const res = await request(app)
      .get(`/api/v1/customer/notifications/${doc._id.toString()}`)
      .set(header);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(doc._id.toString());
    expect(res.body.data.type).toBe("review");
  });

  it("returns 404 for a notification that belongs to another customer (IDOR)", async () => {
    const accountA = await seedCustomerAccount({ email: "idor-a@test.com" });
    const accountB = await seedCustomerAccount({ email: "idor-b@test.com" });
    const { header: headerA } = customerAccessTokenFor(accountA);
    const docB = await seedCustomerNotification(accountB._id);

    const res = await request(app)
      .get(`/api/v1/customer/notifications/${docB._id.toString()}`)
      .set(headerA);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a non-existent notification", async () => {
    const account = await seedCustomerAccount({ email: "missing@test.com" });
    const { header } = customerAccessTokenFor(account);
    const fakeId = new Types.ObjectId().toString();
    const res = await request(app).get(`/api/v1/customer/notifications/${fakeId}`).set(header);
    expect(res.status).toBe(404);
  });

  it("rejects a malformed notification id with 422", async () => {
    const account = await seedCustomerAccount({ email: "badid@test.com" });
    const { header } = customerAccessTokenFor(account);
    const res = await request(app).get("/api/v1/customer/notifications/not-a-valid-id").set(header);
    expect(res.status).toBe(422);
  });

  it("marks a notification as read", async () => {
    const account = await seedCustomerAccount({ email: "read@test.com" });
    const { header } = customerAccessTokenFor(account);
    const doc = await seedCustomerNotification(account._id);

    const res = await request(app)
      .patch(`/api/v1/customer/notifications/${doc._id.toString()}/read`)
      .set(header);
    expect(res.status).toBe(200);
    expect(res.body.data.read).toBe(true);
    expect(res.body.data.readAt).toBeTruthy();
  });

  it("does not let a customer mark another customer's notification as read (IDOR)", async () => {
    const accountA = await seedCustomerAccount({ email: "read-a@test.com" });
    const accountB = await seedCustomerAccount({ email: "read-b@test.com" });
    const { header: headerA } = customerAccessTokenFor(accountA);
    const docB = await seedCustomerNotification(accountB._id);

    const res = await request(app)
      .patch(`/api/v1/customer/notifications/${docB._id.toString()}/read`)
      .set(headerA);
    expect(res.status).toBe(404);
  });

  it("marks all unread notifications as read", async () => {
    const account = await seedCustomerAccount({ email: "readall@test.com" });
    const { header } = customerAccessTokenFor(account);
    await seedCustomerNotification(account._id);
    await seedCustomerNotification(account._id);
    await seedCustomerNotification(account._id, { read: true });

    const res = await request(app).post("/api/v1/customer/notifications/read-all").set(header);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(2);

    const unread = await request(app)
      .get("/api/v1/customer/notifications/unread-count")
      .set(header);
    expect(unread.body.data.count).toBe(0);
  });

  it("deletes a customer's own notification", async () => {
    const account = await seedCustomerAccount({ email: "delete@test.com" });
    const { header } = customerAccessTokenFor(account);
    const doc = await seedCustomerNotification(account._id);

    const res = await request(app)
      .delete(`/api/v1/customer/notifications/${doc._id.toString()}`)
      .set(header);
    expect(res.status).toBe(200);

    const followUp = await request(app)
      .get(`/api/v1/customer/notifications/${doc._id.toString()}`)
      .set(header);
    expect(followUp.status).toBe(404);
  });

  it("does not let a customer delete another customer's notification (IDOR)", async () => {
    const accountA = await seedCustomerAccount({ email: "del-a@test.com" });
    const accountB = await seedCustomerAccount({ email: "del-b@test.com" });
    const { header: headerA } = customerAccessTokenFor(accountA);
    const docB = await seedCustomerNotification(accountB._id);

    const res = await request(app)
      .delete(`/api/v1/customer/notifications/${docB._id.toString()}`)
      .set(headerA);
    expect(res.status).toBe(404);

    const stillThere = await NotificationModel.findById(docB._id).lean();
    expect(stillThere).not.toBeNull();
  });
});

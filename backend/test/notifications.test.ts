import { Types } from "mongoose";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import { getApp, userTokenFor } from "./helpers/fixtures.js";
import { NotificationModel } from "../src/modules/notifications/notification.model.js";

const app = getApp();

/** Seeds `count` unread notifications for the given recipient user. */
async function seedNotifications(
  recipientId: string | Types.ObjectId,
  count: number,
  overrides: Record<string, unknown> = {},
) {
  const docs = [];
  for (let i = 0; i < count; i++) {
    docs.push(
      NotificationModel.create({
        recipientId,
        type: "order",
        title: `Notification ${i + 1}`,
        message: `Message ${i + 1}`,
        priority: "high",
        read: false,
        ...overrides,
      }),
    );
  }
  return Promise.all(docs);
}

describe("Notifications", () => {
  beforeAll(async () => {
    await connect();
  });
  beforeEach(async () => {
    await clearDatabase();
  });
  afterAll(async () => {
    await disconnect();
  });

  // ------------------------------------------------------------------
  // Authentication
  // ------------------------------------------------------------------
  describe("authentication", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const res = await request(app).get("/api/v1/notifications");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("rejects a malformed bearer token with 401", async () => {
      const res = await request(app)
        .get("/api/v1/notifications")
        .set("Authorization", "Bearer not-a-real-token");
      expect(res.status).toBe(401);
    });

    it("rejects an inactive user's token with 401", async () => {
      const { header } = await userTokenFor("Super Admin", "Suspended");
      const res = await request(app).get("/api/v1/notifications").set(header);
      expect(res.status).toBe(401);
    });
  });

  // ------------------------------------------------------------------
  // Authorization (RBAC)
  // ------------------------------------------------------------------
  describe("authorization", () => {
    it("allows Super Admin to list notifications", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      await seedNotifications(user._id, 1);
      const res = await request(app).get("/api/v1/notifications").set(header);
      expect(res.status).toBe(200);
    });

    it("forbids Customer Support (no administration:view) from listing", async () => {
      const { header } = await userTokenFor("Customer Support");
      const res = await request(app).get("/api/v1/notifications").set(header);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("forbids Customer Support from reading unread count", async () => {
      const { header } = await userTokenFor("Customer Support");
      const res = await request(app).get("/api/v1/notifications/unread-count").set(header);
      expect(res.status).toBe(403);
    });

    it("allows Admin to view and create but not delete", async () => {
      const { header, user } = await userTokenFor("Admin");
      await seedNotifications(user._id, 1);

      // view
      const listRes = await request(app).get("/api/v1/notifications").set(header);
      expect(listRes.status).toBe(200);

      // create
      const createRes = await request(app).post("/api/v1/notifications").set(header).send({
        recipientId: user._id.toString(),
        type: "system",
        title: "Admin-created",
      });
      expect(createRes.status).toBe(201);

      // delete — Admin lacks administration:delete
      const deleteRes = await request(app)
        .delete(`/api/v1/notifications/${user._id.toString()}`)
        .set(header);
      expect(deleteRes.status).toBe(403);
    });
  });

  // ------------------------------------------------------------------
  // List & pagination
  // ------------------------------------------------------------------
  describe("list and pagination", () => {
    it("returns paginated notifications for the authenticated user", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      await seedNotifications(user._id, 25);

      const res = await request(app)
        .get("/api/v1/notifications")
        .set(header)
        .query({ page: 1, pageSize: 10 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(10);
      expect(res.body.meta.total).toBe(25);
      expect(res.body.meta.totalPages).toBe(3);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.pageSize).toBe(10);
    });

    it("defaults to page 1 with 20 items when no params given", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      await seedNotifications(user._id, 3);

      const res = await request(app).get("/api/v1/notifications").set(header);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.meta.pageSize).toBe(20);
    });

    it("only returns notifications belonging to the authenticated user", async () => {
      const { header: adminHeader, user: admin } = await userTokenFor("Super Admin");
      const { user: otherAdmin } = await userTokenFor("Admin");

      await seedNotifications(admin._id, 3);
      await seedNotifications(otherAdmin._id, 5);

      const res = await request(app).get("/api/v1/notifications").set(adminHeader);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.meta.total).toBe(3);
    });

    it("respects pageSize cap of 100", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      await seedNotifications(user._id, 5);

      const res = await request(app)
        .get("/api/v1/notifications")
        .set(header)
        .query({ pageSize: 999 });

      expect(res.body.meta.pageSize).toBe(100);
      expect(res.body.data).toHaveLength(5);
    });
  });

  // ------------------------------------------------------------------
  // Filtering
  // ------------------------------------------------------------------
  describe("filtering", () => {
    it("filters by type", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      await seedNotifications(user._id, 1, { type: "order" });
      await seedNotifications(user._id, 1, { type: "inventory" });

      const res = await request(app)
        .get("/api/v1/notifications")
        .set(header)
        .query({ type: "inventory" });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].type).toBe("inventory");
    });

    it("filters by priority", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      await seedNotifications(user._id, 1, { priority: "low" });
      await seedNotifications(user._id, 1, { priority: "critical" });

      const res = await request(app)
        .get("/api/v1/notifications")
        .set(header)
        .query({ priority: "critical" });

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].priority).toBe("critical");
    });

    it("filters by read status", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      await seedNotifications(user._id, 1);
      await seedNotifications(user._id, 1, { read: true });

      const unread = await request(app)
        .get("/api/v1/notifications")
        .set(header)
        .query({ read: "false" });

      expect(unread.body.data).toHaveLength(1);
      expect(unread.body.data[0].read).toBe(false);

      const read = await request(app)
        .get("/api/v1/notifications")
        .set(header)
        .query({ read: "true" });

      expect(read.body.data).toHaveLength(1);
      expect(read.body.data[0].read).toBe(true);
    });

    it("filters by search query (q)", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      await seedNotifications(user._id, 1, { title: "Payment received" });
      await seedNotifications(user._id, 1, { title: "Stock alert" });

      const res = await request(app)
        .get("/api/v1/notifications")
        .set(header)
        .query({ q: "payment" });

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe("Payment received");
    });

    it("rejects an invalid type enum with 422", async () => {
      const { header } = await userTokenFor("Super Admin");
      const res = await request(app)
        .get("/api/v1/notifications")
        .set(header)
        .query({ type: "invalid-type" });
      expect(res.status).toBe(422);
    });

    it("rejects an invalid priority enum with 422", async () => {
      const { header } = await userTokenFor("Super Admin");
      const res = await request(app)
        .get("/api/v1/notifications")
        .set(header)
        .query({ priority: "urgent" });
      expect(res.status).toBe(422);
    });
  });

  // ------------------------------------------------------------------
  // Unread count
  // ------------------------------------------------------------------
  describe("unread count", () => {
    it("returns the correct unread count", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      await seedNotifications(user._id, 3);
      await seedNotifications(user._id, 2, { read: true });

      const res = await request(app).get("/api/v1/notifications/unread-count").set(header);

      expect(res.status).toBe(200);
      expect(res.body.data.count).toBe(3);
    });

    it("returns 0 when all notifications are read", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      await seedNotifications(user._id, 2, { read: true });

      const res = await request(app).get("/api/v1/notifications/unread-count").set(header);

      expect(res.body.data.count).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  // Create
  // ------------------------------------------------------------------
  describe("create", () => {
    it("creates a notification with valid data", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      const res = await request(app)
        .post("/api/v1/notifications")
        .set(header)
        .send({
          recipientId: user._id.toString(),
          type: "order",
          title: "New order placed",
          message: "Order ORD-1001 has been created.",
          priority: "high",
          entityType: "order",
          entityId: "ORD-1001",
          actionUrl: "/orders/ORD-1001",
          metadata: { orderId: "ORD-1001" },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe("New order placed");
      expect(res.body.data.type).toBe("order");
      expect(res.body.data.priority).toBe("high");
      expect(res.body.data.read).toBe(false);
      expect(res.body.data.entityType).toBe("order");
      expect(res.body.data.entityId).toBe("ORD-1001");
      expect(res.body.data.metadata.orderId).toBe("ORD-1001");
    });

    it("applies default priority 'normal' when omitted", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      const res = await request(app).post("/api/v1/notifications").set(header).send({
        recipientId: user._id.toString(),
        type: "system",
        title: "System maintenance",
      });

      expect(res.status).toBe(201);
      expect(res.body.data.priority).toBe("normal");
    });

    it("rejects missing recipientId with 422", async () => {
      const { header } = await userTokenFor("Super Admin");
      const res = await request(app)
        .post("/api/v1/notifications")
        .set(header)
        .send({ type: "system", title: "Test" });
      expect(res.status).toBe(422);
    });

    it("rejects an invalid recipientId with 422", async () => {
      const { header } = await userTokenFor("Super Admin");
      const res = await request(app).post("/api/v1/notifications").set(header).send({
        recipientId: "not-a-valid-object-id",
        type: "system",
        title: "Test",
      });
      expect(res.status).toBe(422);
    });

    it("rejects a missing title with 422", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      const res = await request(app).post("/api/v1/notifications").set(header).send({
        recipientId: user._id.toString(),
        type: "system",
      });
      expect(res.status).toBe(422);
    });

    it("rejects an invalid type enum with 422", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      const res = await request(app).post("/api/v1/notifications").set(header).send({
        recipientId: user._id.toString(),
        type: "unknown-type",
        title: "Test",
      });
      expect(res.status).toBe(422);
    });

    it("rejects an overly long title with 422", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      const res = await request(app)
        .post("/api/v1/notifications")
        .set(header)
        .send({
          recipientId: user._id.toString(),
          type: "system",
          title: "x".repeat(201),
        });
      expect(res.status).toBe(422);
    });
  });

  // ------------------------------------------------------------------
  // Mark as read
  // ------------------------------------------------------------------
  describe("mark as read", () => {
    it("marks a single notification as read", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      const doc = await NotificationModel.create({
        recipientId: user._id,
        type: "order",
        title: "Test",
        read: false,
      });

      const res = await request(app)
        .patch(`/api/v1/notifications/${doc._id.toString()}/read`)
        .set(header);

      expect(res.status).toBe(200);
      expect(res.body.data.read).toBe(true);
      expect(res.body.data.readAt).toBeTruthy();
    });

    it("returns 404 for a non-existent notification id", async () => {
      const { header } = await userTokenFor("Super Admin");
      const fakeId = new Types.ObjectId().toString();
      const res = await request(app).patch(`/api/v1/notifications/${fakeId}/read`).set(header);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("returns 404 when the notification belongs to another user", async () => {
      const { header: adminHeader } = await userTokenFor("Super Admin");
      const { user: otherAdmin } = await userTokenFor("Admin");

      const doc = await NotificationModel.create({
        recipientId: otherAdmin._id,
        type: "order",
        title: "Other user's notification",
        read: false,
      });

      const res = await request(app)
        .patch(`/api/v1/notifications/${doc._id.toString()}/read`)
        .set(adminHeader);
      expect(res.status).toBe(404);
    });

    it("rejects a malformed id with 422", async () => {
      const { header } = await userTokenFor("Super Admin");
      const res = await request(app).patch("/api/v1/notifications/not-a-valid-id/read").set(header);
      expect(res.status).toBe(422);
    });
  });

  // ------------------------------------------------------------------
  // Mark all as read
  // ------------------------------------------------------------------
  describe("mark all as read", () => {
    it("marks all of the user's unread notifications as read", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      await seedNotifications(user._id, 3);

      const res = await request(app).patch("/api/v1/notifications/read-all").set(header);

      expect(res.status).toBe(200);
      expect(res.body.data.count).toBe(3);

      const countRes = await request(app).get("/api/v1/notifications/unread-count").set(header);
      expect(countRes.body.data.count).toBe(0);
    });

    it("returns 0 when there are no unread notifications", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      await seedNotifications(user._id, 2, { read: true });

      const res = await request(app).patch("/api/v1/notifications/read-all").set(header);
      expect(res.status).toBe(200);
      expect(res.body.data.count).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  // Get by ID
  // ------------------------------------------------------------------
  describe("get by id", () => {
    it("returns a notification by id", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      const doc = await NotificationModel.create({
        recipientId: user._id,
        type: "product",
        title: "Price changed",
        message: "SKU-001 price updated.",
        priority: "normal",
        read: false,
      });

      const res = await request(app).get(`/api/v1/notifications/${doc._id.toString()}`).set(header);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(doc._id.toString());
      expect(res.body.data.title).toBe("Price changed");
      expect(res.body.data.type).toBe("product");
    });

    it("returns 404 for a non-existent notification", async () => {
      const { header } = await userTokenFor("Super Admin");
      const fakeId = new Types.ObjectId().toString();
      const res = await request(app).get(`/api/v1/notifications/${fakeId}`).set(header);
      expect(res.status).toBe(404);
    });

    it("returns 404 when the notification belongs to another user", async () => {
      const { header: adminHeader } = await userTokenFor("Super Admin");
      const { user: otherAdmin } = await userTokenFor("Admin");

      const doc = await NotificationModel.create({
        recipientId: otherAdmin._id,
        type: "order",
        title: "Other user's notification",
        read: false,
      });

      const res = await request(app)
        .get(`/api/v1/notifications/${doc._id.toString()}`)
        .set(adminHeader);
      expect(res.status).toBe(404);
    });
  });

  // ------------------------------------------------------------------
  // Delete
  // ------------------------------------------------------------------
  describe("delete", () => {
    it("deletes a notification owned by the authenticated user", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      const doc = await NotificationModel.create({
        recipientId: user._id,
        type: "system",
        title: "Delete me",
        read: false,
      });

      const res = await request(app)
        .delete(`/api/v1/notifications/${doc._id.toString()}`)
        .set(header);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(doc._id.toString());

      const followUp = await request(app)
        .get(`/api/v1/notifications/${doc._id.toString()}`)
        .set(header);
      expect(followUp.status).toBe(404);
    });

    it("returns 404 when deleting a non-existent notification", async () => {
      const { header } = await userTokenFor("Super Admin");
      const fakeId = new Types.ObjectId().toString();
      const res = await request(app).delete(`/api/v1/notifications/${fakeId}`).set(header);
      expect(res.status).toBe(404);
    });

    it("does not delete notifications owned by another user", async () => {
      const { header: adminHeader } = await userTokenFor("Super Admin");
      const { user: otherAdmin } = await userTokenFor("Admin");

      const doc = await NotificationModel.create({
        recipientId: otherAdmin._id,
        type: "order",
        title: "Other user's notification",
        read: false,
      });

      const res = await request(app)
        .delete(`/api/v1/notifications/${doc._id.toString()}`)
        .set(adminHeader);
      expect(res.status).toBe(404);

      const stillThere = await NotificationModel.findById(doc._id).lean();
      expect(stillThere).not.toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // Sorting
  // ------------------------------------------------------------------
  describe("sorting", () => {
    it("sorts by createdAt descending by default", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      await NotificationModel.create({
        recipientId: user._id,
        type: "order",
        title: "First",
        read: false,
        createdAt: new Date("2026-08-01T10:00:00Z"),
      });
      await NotificationModel.create({
        recipientId: user._id,
        type: "order",
        title: "Second",
        read: false,
        createdAt: new Date("2026-08-02T10:00:00Z"),
      });

      const res = await request(app)
        .get("/api/v1/notifications")
        .set(header)
        .query({ sort: "-createdAt" });

      expect(res.status).toBe(200);
      expect(res.body.data[0].title).toBe("Second");
    });

    it("sorts by priority ascending when requested", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      await NotificationModel.create({
        recipientId: user._id,
        type: "order",
        title: "High",
        priority: "high",
        read: false,
      });
      await NotificationModel.create({
        recipientId: user._id,
        type: "order",
        title: "Low",
        priority: "low",
        read: false,
      });

      const res = await request(app)
        .get("/api/v1/notifications")
        .set(header)
        .query({ sort: "priority" });

      expect(res.status).toBe(200);
      expect(res.body.data[0].title).toBe("Low");
    });

    it("ignores sort fields not in the allowlist", async () => {
      const { header, user } = await userTokenFor("Super Admin");
      await seedNotifications(user._id, 2);

      const res = await request(app)
        .get("/api/v1/notifications")
        .set(header)
        .query({ sort: "nonexistentField" });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });
});

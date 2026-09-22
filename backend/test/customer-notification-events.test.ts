import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import {
  getApp,
  seedCustomerAccount,
  customerAccessTokenFor,
  seedCatalog,
  seedProduct,
  seedInventory,
} from "./helpers/fixtures.js";
import { NotificationModel } from "../src/modules/notifications/notification.model.js";

const app = getApp();

/**
 * Phase 9 — customer notification identity end-to-end test.
 *
 * Proves the event -> store -> GET chain: an order placed by a customer must
 * produce an `order_created` notification that is visible to that customer via
 * GET /api/v1/customer/notifications, keyed by the CustomerAccount id (not the
 * CRM Customer id). Before the fix the notification was stored under the CRM id
 * and was therefore invisible to the account-keyed read surface.
 */
describe("Customer notification event chain", () => {
  beforeAll(async () => {
    await connect();
  });
  beforeEach(async () => {
    await clearDatabase();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("surfaces an order_created notification to the ordering customer", async () => {
    const { category, brand } = await seedCatalog();
    const product = await seedProduct(category._id, brand._id, {
      sku: "EV-SKU",
      price: 100,
    });
    await seedInventory(product._id, "EV-SKU");

    const account = await seedCustomerAccount({ email: "notify@test.com" });
    const { header } = customerAccessTokenFor(account);

    const order = await request(app)
      .post("/api/v1/customer/orders")
      .set(header)
      .send({ items: [{ productId: product._id.toString(), quantity: 1 }] });

    expect(order.status).toBe(201);
    expect(order.body.success).toBe(true);
    const orderId: string = order.body.data.id;

    // Direct DB assertion: stored under the account id, not a CRM id.
    const stored = await NotificationModel.findOne({
      recipientType: "customer",
      type: "order_created",
    })
      .lean()
      .exec();
    expect(stored).not.toBeNull();
    expect(stored?.recipientId.toString()).toBe(account._id.toString());
    expect(stored?.read).toBe(false);
    expect(stored?.metadata?.orderId).toBe(orderId);

    // Read surface assertion: visible via GET /customer/notifications.
    const res = await request(app).get("/api/v1/customer/notifications").set(header);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);

    const notification = res.body.data[0];
    expect(notification.type).toBe("order_created");
    expect(notification.read).toBe(false);
    // G17-02 regression: lifecycle notifications deep-link to the real
    // storefront order-detail route (/account/orders/:id), not the obsolete
    // /customer/orders/:id path.
    expect(notification.actionUrl).toBe(`/account/orders/${orderId}`);

    // Unread count must reflect the new notification.
    const count = await request(app).get("/api/v1/customer/notifications/unread-count").set(header);
    expect(count.status).toBe(200);
    expect(count.body.data.count).toBe(1);
  });
});

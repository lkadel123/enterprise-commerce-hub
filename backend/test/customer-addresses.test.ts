import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import { getApp, seedCustomerAccount, customerAccessTokenFor } from "./helpers/fixtures.js";
import { CustomerAddressModel } from "../src/modules/customer-address/customer-address.model.js";

const app = getApp();

/**
 * Phase 9 — customer address book (self-service) surface.
 *
 * Verifies the previously-missing /api/v1/customer/addresses routes are mounted,
 * authenticated, validated and ownership-scoped (IDOR-safe).
 */
describe("Customer address book", () => {
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
    const res = await request(app).get("/api/v1/customer/addresses");
    expect(res.status).toBe(401);
  });

  it("creates, lists, fetches, updates and deletes a customer's address", async () => {
    const account = await seedCustomerAccount({ email: "addr@test.com" });
    const { header } = customerAccessTokenFor(account);

    const created = await request(app).post("/api/v1/customer/addresses").set(header).send({
      label: "Home",
      line1: "123 Main St",
      city: "Springfield",
      postalCode: "01101",
      country: "US",
      isDefault: true,
    });
    expect(created.status).toBe(201);
    expect(created.body.success).toBe(true);
    expect(created.body.data.label).toBe("Home");
    const addressId = created.body.data.id;

    const listed = await request(app).get("/api/v1/customer/addresses").set(header);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].id).toBe(addressId);

    const fetched = await request(app).get(`/api/v1/customer/addresses/${addressId}`).set(header);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.line1).toBe("123 Main St");

    const updated = await request(app)
      .patch(`/api/v1/customer/addresses/${addressId}`)
      .set(header)
      .send({ city: "Shelbyville" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.city).toBe("Shelbyville");

    const removed = await request(app)
      .delete(`/api/v1/customer/addresses/${addressId}`)
      .set(header);
    expect(removed.status).toBe(200);

    const gone = await request(app).get(`/api/v1/customer/addresses/${addressId}`).set(header);
    expect(gone.status).toBe(404);
  });

  it("validates the create payload (422 on missing required field)", async () => {
    const account = await seedCustomerAccount({ email: "val@test.com" });
    const { header } = customerAccessTokenFor(account);

    const res = await request(app).post("/api/v1/customer/addresses").set(header).send({
      label: "Work",
      city: "Springfield",
      postalCode: "01101",
      country: "US",
    });
    expect(res.status).toBe(422);
  });

  it("rejects a malformed address id with 422", async () => {
    const account = await seedCustomerAccount({ email: "badid@test.com" });
    const { header } = customerAccessTokenFor(account);

    const res = await request(app).get("/api/v1/customer/addresses/not-a-valid-id").set(header);
    expect(res.status).toBe(422);
  });

  it("does not let a customer access another customer's address (IDOR)", async () => {
    const accountA = await seedCustomerAccount({ email: "idor-a@test.com" });
    const accountB = await seedCustomerAccount({ email: "idor-b@test.com" });
    const { header: headerB } = customerAccessTokenFor(accountB);

    const addr = await CustomerAddressModel.create({
      customerAccountId: accountA._id,
      label: "Home",
      line1: "123 Main St",
      city: "Springfield",
      postalCode: "01101",
      country: "US",
      isDefault: false,
    });

    const res = await request(app)
      .get(`/api/v1/customer/addresses/${addr._id.toString()}`)
      .set(headerB);
    expect(res.status).toBe(404);

    // The record still belongs to A and is untouched.
    const stillThere = await CustomerAddressModel.findById(addr._id).lean().exec();
    expect(stillThere).not.toBeNull();
    expect(stillThere?.customerAccountId.toString()).toBe(accountA._id.toString());
  });

  it("sets a new default and clears the previous default", async () => {
    const account = await seedCustomerAccount({ email: "def@test.com" });
    const { header } = customerAccessTokenFor(account);

    const first = await request(app).post("/api/v1/customer/addresses").set(header).send({
      label: "Home",
      line1: "123 Main St",
      city: "Springfield",
      postalCode: "01101",
      country: "US",
      isDefault: true,
    });
    const firstId = first.body.data.id;

    const second = await request(app).post("/api/v1/customer/addresses").set(header).send({
      label: "Work",
      line1: "456 Oak Ave",
      city: "Springfield",
      postalCode: "01101",
      country: "US",
      isDefault: true,
    });
    const secondId = second.body.data.id;

    const both = await CustomerAddressModel.find({ customerAccountId: account._id }).lean().exec();
    const defaults = both.filter((a) => a.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]._id.toString()).toBe(secondId);
    // The first is no longer default.
    const firstAfter = await CustomerAddressModel.findById(firstId).lean().exec();
    expect(firstAfter?.isDefault).toBe(false);
  });
});

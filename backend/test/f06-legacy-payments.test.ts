import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import {
  getApp,
  seedCustomerAccount,
  seedCatalog,
  seedProduct,
  seedInventory,
  customerAccessTokenFor,
  userTokenFor,
} from "./helpers/fixtures.js";
import { Types } from "mongoose";
import { OrderModel } from "../src/modules/orders/order.model.js";
import { InventoryModel } from "../src/modules/inventory/inventory.model.js";
import { paymentProviderMap } from "../src/modules/payments/payment.providers.js";
import { paymentService } from "../src/modules/payments/payment.service.js";
import type { PaymentProviderInterface } from "../src/modules/payments/payment.provider.js";

const app = getApp();

const realProvider = paymentProviderMap.FONEPAY;
let initiateMock = vi.fn();
let verifyMock = vi.fn();

function installStub() {
  paymentProviderMap.FONEPAY = {
    initiate: initiateMock,
    verify: verifyMock,
    refundCapability: () => "UNSUPPORTED",
  } as unknown as PaymentProviderInterface;
}

beforeAll(async () => {
  await connect();
  installStub();
});

beforeEach(async () => {
  await clearDatabase();
  initiateMock = vi.fn().mockResolvedValue({
    paymentId: "pb_sess_1",
    providerTransactionId: "pb_sess_1",
    paymentUrl: "https://pb.test/pb_sess_1",
    expiresAt: new Date(Date.now() + 3_600_000),
    currency: "NPR",
  });
  verifyMock = vi.fn();
  installStub();
});

afterAll(async () => {
  if (realProvider) paymentProviderMap.FONEPAY = realProvider;
  await disconnect();
});

async function seedCommerce() {
  const { category, brand } = await seedCatalog();
  const product = await seedProduct(category._id, brand._id, {
    sku: "LEG-SKU",
    price: 100,
    cost: 50,
  });
  await seedInventory(product._id, "LEG-SKU");
  return { product };
}

/** Places a real customer order (server-priced) and returns its id. */
async function placeOrder(productId: string): Promise<string> {
  const account = await seedCustomerAccount();
  const { header } = customerAccessTokenFor(account);
  const res = await request(app)
    .post("/api/v1/customer/orders")
    .set(header)
    .send({ items: [{ productId, quantity: 1 }], paymentMethod: "Digital Wallet" });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

async function adminHeader(role: "Super Admin" | "Marketing Manager" = "Super Admin") {
  const { header } = await userTokenFor(role);
  return header;
}

async function initiate(
  orderId: string,
  header?: Record<string, string>,
  extra: Record<string, unknown> = {},
) {
  return request(app)
    .post("/api/v1/payments/initiate")
    .set(header ?? (await adminHeader()))
    .send({ orderId, provider: "FONEPAY", ...extra });
}

async function verify(
  txId: string,
  header?: Record<string, string>,
  extra: Record<string, unknown> = {},
) {
  return request(app)
    .post("/api/v1/payments/verify")
    .set(header ?? (await adminHeader()))
    .send({ providerTransactionId: txId, provider: "FONEPAY", ...extra });
}

async function orderDoc(orderId: string) {
  const doc = await OrderModel.findById(orderId).lean().exec();
  expect(doc).not.toBeNull();
  return doc!;
}

/** Forces an arbitrary order/payment state combination directly in the DB. */
async function setOrderState(orderId: string, set: Record<string, unknown>) {
  await OrderModel.findByIdAndUpdate(orderId, { $set: set });
}

function paidVerify(orderTotal: number, overrides: Record<string, unknown> = {}) {
  verifyMock.mockResolvedValue({
    status: "Paid",
    amount: orderTotal,
    verifiedAt: new Date(),
    metadata: { fonepay: { referenceLabel: "fp_1" }, currency: "NPR" },
    ...overrides,
  });
}

/** Places an order and initiates a live FONEPAY session through the legacy endpoint. */
async function initiateLive(product: { _id: { toString(): string } }) {
  const orderId = await placeOrder(product._id.toString());
  const doc = await orderDoc(orderId);
  const total = doc.amounts.total;
  const res = await initiate(orderId);
  expect(res.status).toBe(200);
  return { orderId, total };
}
describe("F-08 — legacy POST /payments/initiate", () => {
  it("I1: initiates a valid payment using the server-authoritative amount", async () => {
    const { product } = await seedCommerce();
    const { orderId, total } = await initiateLive(product);
    const doc = await orderDoc(orderId);
    expect(doc.payment.status).toBe("Initiated");
    expect(doc.payment.amount).toBe(total);
    expect(doc.payment.providerTransactionId).toBe("pb_sess_1");
    // The gateway was invoked with the server total, never a client value.
    expect(initiateMock).toHaveBeenCalledWith(total, orderId, expect.any(Object));
  });

  it("I2: a client-supplied amount can never override the server order total", async () => {
    const { product } = await seedCommerce();
    const orderId = await placeOrder(product._id.toString());
    const total = (await orderDoc(orderId)).amounts.total;

    const res = await initiate(orderId, undefined, { amount: 1 });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("Initiated");

    const doc = await orderDoc(orderId);
    expect(doc.payment.amount).toBe(total);
    expect(doc.payment.amount).not.toBe(1);
    expect(initiateMock).toHaveBeenCalledWith(total, orderId, expect.any(Object));

    // Service-level defense in depth: even a direct caller cannot desync the amount.
    await expect(paymentService.initiatePayment(orderId, "FONEPAY", 1, {})).rejects.toThrow(
      /mismatch/i,
    );
    expect(initiateMock).toHaveBeenCalledTimes(1);
  });

  it("I3: rejects initiation for an unknown order (404)", async () => {
    const res = await initiate(new Types.ObjectId().toString());
    expect(res.status).toBe(404);
  });

  it("I4: rejects initiation for a cancelled order", async () => {
    const { product } = await seedCommerce();
    const orderId = await placeOrder(product._id.toString());
    await setOrderState(orderId, { status: "Cancelled" });

    const res = await initiate(orderId);
    expect(res.status).toBe(400);
    expect(initiateMock).not.toHaveBeenCalled();
  });

  it("I5: rejects initiation for an expired order", async () => {
    const { product } = await seedCommerce();
    const orderId = await placeOrder(product._id.toString());
    await setOrderState(orderId, { status: "Expired" });

    const res = await initiate(orderId);
    expect(res.status).toBe(400);
    expect(initiateMock).not.toHaveBeenCalled();
  });

  it("I6: an already-paid order returns Paid without a new gateway session", async () => {
    const { product } = await seedCommerce();
    const orderId = await placeOrder(product._id.toString());
    const total = (await orderDoc(orderId)).amounts.total;
    await setOrderState(orderId, { "payment.status": "Paid", "payment.amount": total });

    const res = await initiate(orderId);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("Paid");
    expect(initiateMock).not.toHaveBeenCalled();
  });

  it("I7: rejects unsafe payment states; allows documented Expired re-initiation", async () => {
    const { product } = await seedCommerce();
    for (const paymentStatus of ["Failed", "Cancelled", "Refunded"]) {
      const orderId = await placeOrder(product._id.toString());
      await setOrderState(orderId, { "payment.status": paymentStatus });
      const res = await initiate(orderId);
      expect(res.status).toBe(400);
    }

    // Expired session = documented retry path.
    const orderId = await placeOrder(product._id.toString());
    await setOrderState(orderId, { "payment.status": "Expired" });
    const res = await initiate(orderId);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("Initiated");
  });

  it("I8: rejects retired/unregistered legacy providers (422 validation)", async () => {
    const { product } = await seedCommerce();
    const orderId = await placeOrder(product._id.toString());
    const res = await initiate(orderId, undefined, { provider: "PAYBRIDGE" });
    expect(res.status).toBe(422);
    expect(initiateMock).not.toHaveBeenCalled();
  });
});
describe("F-06 — legacy POST /payments/verify", () => {
  it("V8: marks a pending payment Paid only after authoritative provider verification", async () => {
    const { product } = await seedCommerce();
    const { orderId, total } = await initiateLive(product);
    paidVerify(total);

    const res = await verify("pb_sess_1");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("Paid");
    expect(res.body.data.duplicate).toBe(false);

    const doc = await orderDoc(orderId);
    expect(doc.payment.status).toBe("Paid");
    expect(doc.payment.amount).toBe(total);
    // The settled transaction reference is the verified provider session
    // reference bound at initiation (never a client value).
    expect(doc.payment.transactionId).toBe("pb_sess_1");
    expect(doc.payment.paidAt).toBeTruthy();
  });

  it("V9: client-supplied status/amount fields are rejected outright (strict schema)", async () => {
    const { product } = await seedCommerce();
    const { orderId } = await initiateLive(product);
    verifyMock.mockResolvedValue({ status: "Paid", amount: 1 });

    const res = await verify("pb_sess_1", undefined, { status: "Paid", amount: 1 });
    expect(res.status).toBe(422);
    expect(verifyMock).not.toHaveBeenCalled();

    const doc = await orderDoc(orderId);
    expect(doc.payment.status).toBe("Initiated");
  });

  it("V10: a provider amount mismatch can never become Paid", async () => {
    const { product } = await seedCommerce();
    const { orderId, total } = await initiateLive(product);
    paidVerify(total + 100);

    const res = await verify("pb_sess_1");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("Failed");

    const doc = await orderDoc(orderId);
    expect(doc.payment.status).toBe("Failed");
    expect(doc.payment.failureReason).toBe("Payment amount mismatch.");
  });

  it("V11: a provider currency mismatch can never become Paid", async () => {
    const { product } = await seedCommerce();
    const { orderId, total } = await initiateLive(product);
    paidVerify(total, {
      metadata: { fonepay: { referenceLabel: "fp_1" }, currency: "USD" },
    });

    const res = await verify("pb_sess_1");
    expect(res.body.data.status).toBe("Failed");

    const doc = await orderDoc(orderId);
    expect(doc.payment.status).toBe("Failed");
    expect(doc.payment.failureReason).toBe("Payment currency mismatch.");
  });

  it("V12: an unbound transaction id is rejected before contacting the provider", async () => {
    await seedCommerce();
    const res = await verify("unknown-tx");
    expect(res.status).toBe(404);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("V13: a provider-reported failure is recorded verbatim and never becomes Paid", async () => {
    const { product } = await seedCommerce();
    const { orderId } = await initiateLive(product);
    verifyMock.mockResolvedValue({ status: "Failed", amount: 0, metadata: { error: "declined" } });

    const res = await verify("pb_sess_1");
    expect(res.body.data.status).toBe("Failed");

    const doc = await orderDoc(orderId);
    expect(doc.payment.status).toBe("Failed");
    expect(doc.payment.failureReason).toBe("declined");
  });

  it("V14: provider uncertainty returns 503 and leaves the payment unpaid", async () => {
    const { product } = await seedCommerce();
    const { orderId } = await initiateLive(product);
    verifyMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await verify("pb_sess_1");
    expect(res.status).toBe(503);

    const doc = await orderDoc(orderId);
    expect(doc.payment.status).toBe("Initiated");
  });

  it("V15: a cancelled order can never be verified to Paid", async () => {
    const { product } = await seedCommerce();
    const { orderId, total } = await initiateLive(product);
    await setOrderState(orderId, { status: "Cancelled" });
    paidVerify(total);

    const res = await verify("pb_sess_1");
    expect(res.status).toBe(400);
    expect(verifyMock).not.toHaveBeenCalled();
    expect((await orderDoc(orderId)).payment.status).toBe("Initiated");
  });

  it("V16: an expired order can never be verified to Paid", async () => {
    const { product } = await seedCommerce();
    const { orderId, total } = await initiateLive(product);
    await setOrderState(orderId, { status: "Expired" });
    paidVerify(total);

    const res = await verify("pb_sess_1");
    expect(res.status).toBe(400);
    expect((await orderDoc(orderId)).payment.status).toBe("Initiated");
  });

  it("V17: a refunded order can never be verified to Paid", async () => {
    const { product } = await seedCommerce();
    const { orderId, total } = await initiateLive(product);
    await setOrderState(orderId, { status: "Refunded" });
    paidVerify(total);

    const res = await verify("pb_sess_1");
    expect(res.status).toBe(400);
    expect((await orderDoc(orderId)).payment.status).toBe("Initiated");
  });

  it("V18: an already-Paid payment is idempotent (no provider round-trip)", async () => {
    const { product } = await seedCommerce();
    const { orderId, total } = await initiateLive(product);
    const paidAt = new Date("2026-01-01T00:00:00Z");
    await setOrderState(orderId, { "payment.status": "Paid", "payment.paidAt": paidAt });
    paidVerify(total);

    const res = await verify("pb_sess_1");
    expect(res.status).toBe(200);
    expect(res.body.data.duplicate).toBe(true);
    expect(verifyMock).not.toHaveBeenCalled();

    const doc = await orderDoc(orderId);
    expect(new Date(doc.payment.paidAt as Date).toISOString()).toBe(paidAt.toISOString());
    // The forced state had no timeline event and the duplicate added none.
    const paidEvents = (doc.timeline ?? []).filter(
      (t: { label: string }) => t.label === "Payment Paid",
    );
    expect(paidEvents).toHaveLength(0);
  });

  it("V19: a customer token cannot reach the admin verification endpoint", async () => {
    const { product } = await seedCommerce();
    await initiateLive(product);
    const account = await seedCustomerAccount();
    const { header } = customerAccessTokenFor(account);

    const res = await verify("pb_sess_1", header);
    expect(res.status).toBe(401);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("V20: unauthenticated requests are rejected", async () => {
    const { product } = await seedCommerce();
    await initiateLive(product);

    const res = await request(app)
      .post("/api/v1/payments/verify")
      .send({ providerTransactionId: "pb_sess_1", provider: "FONEPAY" });
    expect(res.status).toBe(401);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("V21: an admin without orders:edit permission is rejected (403)", async () => {
    const { product } = await seedCommerce();
    await initiateLive(product);

    const res = await verify("pb_sess_1", await adminHeader("Marketing Manager"));
    expect(res.status).toBe(403);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("V22/V23/V24: duplicate verification is idempotent — no double effects", async () => {
    const { product } = await seedCommerce();
    const { orderId, total } = await initiateLive(product);
    paidVerify(total);

    const first = await verify("pb_sess_1");
    expect(first.body.data.duplicate).toBe(false);

    const second = await verify("pb_sess_1");
    expect(second.body.data.duplicate).toBe(true);
    expect(verifyMock).toHaveBeenCalledTimes(1);

    const doc = await orderDoc(orderId);
    expect(doc.payment.status).toBe("Paid");
    const paidEvents = (doc.timeline ?? []).filter(
      (t: { label: string }) => t.label === "Payment Paid",
    );
    expect(paidEvents).toHaveLength(1);
    // Payment success consumes no stock: the reservation stays for fulfillment.
    const inv = await InventoryModel.findOne({ sku: "LEG-SKU" }).lean();
    expect(inv?.reserved).toBe(1);
    expect(inv?.stock).toBe(100);
  });
});

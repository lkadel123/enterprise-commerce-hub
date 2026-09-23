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
} from "./helpers/fixtures.js";
import { NotificationModel } from "../src/modules/notifications/notification.model.js";
import { OrderModel } from "../src/modules/orders/order.model.js";
import { orderRepository } from "../src/modules/orders/order.repository.js";
import { notificationService } from "../src/modules/notifications/notification.service.js";
import { paymentProviderMap } from "../src/modules/payments/payment.providers.js";
import type { PaymentProviderInterface } from "../src/modules/payments/payment.provider.js";

/**
 * Customer payments security tests.
 *
 * These cover the mandatory security cases that can be exercised without a
 * live gateway: authentication, IDOR (ownership), tampering/validation, and
 * the state guards. Successful gateway initiation/verification runs against
 * a stubbed provider in the registry so the tests stay deterministic and
 * offline. Settlement is decided exclusively by server-side verification.
 */
const app = getApp();

async function seedCommerce() {
  const { category, brand } = await seedCatalog();
  const product = await seedProduct(category._id, brand._id, {
    sku: "PAY-SKU",
    price: 100,
    cost: 50,
  });
  await seedInventory(product._id, "PAY-SKU");
  return { product };
}

async function placeOrder(account: { _id: { toString(): string } }, productId: string) {
  const { header } = customerAccessTokenFor(account);
  const res = await request(app)
    .post("/api/v1/customer/orders")
    .set(header)
    .send({ items: [{ productId, quantity: 1 }], paymentMethod: "Digital Wallet" });
  return res;
}

// File-level lifecycle hooks (shared by both describes below): ONE shared
// in-memory Mongo boot per file. Previously each sibling describe ran its own
// connect/disconnect pair, forcing a second full mongod boot mid-file (slow
// and timeout-prone in the full parallel suite).
beforeAll(async () => {
  await connect();
});
beforeEach(async () => {
  await clearDatabase();
});
afterAll(async () => {
  await disconnect();
});

describe("Customer payments", () => {
  it("rejects unauthenticated initiate/verify/status with 401", async () => {
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount({ email: "payer@test.com" });
    const orderRes = await placeOrder(account, product._id.toString());
    const orderId = orderRes.body.data.id;

    const initiate = await request(app).post(`/api/v1/customer/payments/${orderId}/initiate`);
    expect(initiate.status).toBe(401);
    expect(initiate.body.error.code).toBe("UNAUTHENTICATED");

    const verify = await request(app).post(`/api/v1/customer/payments/${orderId}/verify`);
    expect(verify.status).toBe(401);

    const status = await request(app).get(`/api/v1/customer/payments/${orderId}/status`);
    expect(status.status).toBe(401);
  });

  it("returns 404 (never reveals ownership) when customer A touches customer B's order", async () => {
    const { product } = await seedCommerce();
    const accountB = await seedCustomerAccount({ email: "owner-b@test.com" });
    const orderResB = await placeOrder(accountB, product._id.toString());
    const orderBId = orderResB.body.data.id;

    const accountA = await seedCustomerAccount({ email: "attacker-a@test.com" });
    const { header } = customerAccessTokenFor(accountA);

    const initiate = await request(app)
      .post(`/api/v1/customer/payments/${orderBId}/initiate`)
      .set(header)
      .send({ gateway: "FONEPAY" });
    expect(initiate.status).toBe(404);
    expect(initiate.body.error.code).toBe("NOT_FOUND");

    const status = await request(app)
      .get(`/api/v1/customer/payments/${orderBId}/status`)
      .set(header);
    expect(status.status).toBe(404);

    const verify = await request(app)
      .post(`/api/v1/customer/payments/${orderBId}/verify`)
      .set(header)
      .send({ gateway: "FONEPAY", providerTransactionId: "tx-any" });
    expect(verify.status).toBe(404);
  });

  it("rejects a tampered amount payload on initiate with 422", async () => {
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount({ email: "amount@test.com" });
    const orderRes = await placeOrder(account, product._id.toString());
    const orderId = orderRes.body.data.id;
    const { header } = customerAccessTokenFor(account);

    const res = await request(app)
      .post(`/api/v1/customer/payments/${orderId}/initiate`)
      .set(header)
      .send({ gateway: "FONEPAY", amount: 1, total: 1, status: "Paid" });
    // Financial fields are rejected at the validation boundary â€” never used.
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects financial fields in a verify payload with 422", async () => {
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount({ email: "verify-amount@test.com" });
    const orderRes = await placeOrder(account, product._id.toString());
    const orderId = orderRes.body.data.id;
    const { header } = customerAccessTokenFor(account);

    const res = await request(app)
      .post(`/api/v1/customer/payments/${orderId}/verify`)
      .set(header)
      .send({ gateway: "FONEPAY", providerTransactionId: "tx", amount: 9999 });
    expect(res.status).toBe(422);
  });

  it("rejects an unsupported gateway with 422", async () => {
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount({ email: "gateway@test.com" });
    const orderRes = await placeOrder(account, product._id.toString());
    const orderId = orderRes.body.data.id;
    const { header } = customerAccessTokenFor(account);

    const res = await request(app)
      .post(`/api/v1/customer/payments/${orderId}/initiate`)
      .set(header)
      .send({ gateway: "STRIPE" });
    expect(res.status).toBe(422);
  });

  it("rejects a malformed orderId param", async () => {
    const account = await seedCustomerAccount({ email: "malformed@test.com" });
    const { header } = customerAccessTokenFor(account);
    const res = await request(app)
      .post("/api/v1/customer/payments/not-an-object-id/initiate")
      .set(header)
      .send({ gateway: "FONEPAY" });
    expect(res.status).toBe(422);
  });

  it("refuses to verify an order that was never initiated (400)", async () => {
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount({ email: "never-init@test.com" });
    const orderRes = await placeOrder(account, product._id.toString());
    const orderId = orderRes.body.data.id;
    const { header } = customerAccessTokenFor(account);

    const res = await request(app)
      .post(`/api/v1/customer/payments/${orderId}/verify`)
      .set(header)
      .send({ gateway: "FONEPAY", providerTransactionId: "tx-abc" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  it("returns a customer-safe payment status DTO", async () => {
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount({ email: "status@test.com" });
    const orderRes = await placeOrder(account, product._id.toString());
    const orderId = orderRes.body.data.id;
    const { header } = customerAccessTokenFor(account);

    const res = await request(app).get(`/api/v1/customer/payments/${orderId}/status`).set(header);
    expect(res.status).toBe(200);
    const payment = res.body.data.payment;
    expect(payment.orderId).toBe(orderId);
    expect(payment.status).toBe("Pending");
    // No secrets and no internal fields exposed.
    expect(payment).not.toHaveProperty("secretKey");
    expect(payment).not.toHaveProperty("rawResponse");
  });
});

/**
 * Phase 8 Blockers ï¿½ payment_initiated ordering.
 *
 * The notification must be emitted ONLY AFTER provider initiation succeeds AND
 * the Initiated state is persisted. It must NOT be emitted when ownership fails,
 * the payment is terminal, the provider fails, or persistence fails ï¿½ and a
 * notification failure must never fail a successful initiation.
 */
describe("Customer payment_initiated ordering (Phase 8)", () => {
  function installFakeGateway(initiate?: PaymentProviderInterface["initiate"]) {
    paymentProviderMap.FONEPAY = {
      initiate:
        initiate ??
        (async () => ({
          providerTransactionId: "EC-order123-abc123",
          expiresAt: new Date(Date.now() + 3_600_000),
          currency: "NPR",
        })),
      verify: async () => ({
        status: "Pending",
        amount: 0,
        verifiedAt: new Date(),
        metadata: {},
      }),
      getStatus: async () => ({ status: "Pending", amount: 0, metadata: {} }),
      refundCapability: () => "UNSUPPORTED",
    } as unknown as PaymentProviderInterface;
  }

  function countPaymentInitiated() {
    return NotificationModel.countDocuments({ type: "payment_initiated" }).exec();
  }

  it("emits payment_initiated only after provider initiation and Initiated persistence", async () => {
    installFakeGateway();
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount({ email: "pi-ok@test.com" });
    const orderRes = await placeOrder(account, product._id.toString());
    const orderId = orderRes.body.data.id;
    const { header } = customerAccessTokenFor(account);

    expect(await countPaymentInitiated()).toBe(0);

    const res = await request(app)
      .post(`/api/v1/customer/payments/${orderId}/initiate`)
      .set(header)
      .send({ gateway: "FONEPAY" });
    expect(res.status).toBe(200);
    expect(res.body.data.payment.status).toBe("Initiated");
    expect(res.body.data.payment.providerTransactionId).toBe("EC-order123-abc123");

    const order = await OrderModel.findById(orderId).lean();
    expect(order?.payment.status).toBe("Initiated");
    expect(order?.payment.providerTransactionId).toBe("EC-order123-abc123");

    expect(await countPaymentInitiated()).toBe(1);
    const notif = await NotificationModel.findOne({ type: "payment_initiated" }).lean();
    expect(notif?.recipientType).toBe("customer");
  });

  it("does not emit payment_initiated when ownership lookup fails (IDOR)", async () => {
    installFakeGateway();
    const { product } = await seedCommerce();
    const ownerB = await seedCustomerAccount({ email: "pi-ownerb@test.com" });
    const orderResB = await placeOrder(ownerB, product._id.toString());
    const orderBId = orderResB.body.data.id;

    const attackerA = await seedCustomerAccount({ email: "pi-attackera@test.com" });
    const { header } = customerAccessTokenFor(attackerA);

    const res = await request(app)
      .post(`/api/v1/customer/payments/${orderBId}/initiate`)
      .set(header)
      .send({ gateway: "FONEPAY" });
    expect(res.status).toBe(404);
    expect(await countPaymentInitiated()).toBe(0);
  });

  it("does not emit payment_initiated for a terminal (cancelled) order", async () => {
    installFakeGateway();
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount({ email: "pi-cancel@test.com" });
    const orderRes = await placeOrder(account, product._id.toString());
    const orderId = orderRes.body.data.id;
    const { header } = customerAccessTokenFor(account);

    await OrderModel.updateOne({ _id: orderId }, { $set: { status: "Cancelled" } }).exec();

    const res = await request(app)
      .post(`/api/v1/customer/payments/${orderId}/initiate`)
      .set(header)
      .send({ gateway: "FONEPAY" });
    expect(res.status).toBe(400);
    expect(await countPaymentInitiated()).toBe(0);
  });

  it("does not emit payment_initiated when provider.initiate fails", async () => {
    installFakeGateway(async () => {
      throw new Error("gateway down");
    });
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount({ email: "pi-provfail@test.com" });
    const orderRes = await placeOrder(account, product._id.toString());
    const orderId = orderRes.body.data.id;
    const { header } = customerAccessTokenFor(account);

    const res = await request(app)
      .post(`/api/v1/customer/payments/${orderId}/initiate`)
      .set(header)
      .send({ gateway: "FONEPAY" });
    expect(res.status).toBe(503);
    expect(await countPaymentInitiated()).toBe(0);

    const order = await OrderModel.findById(orderId).lean();
    expect(order?.payment.status).toBe("Pending");
  });

  it("does not emit payment_initiated when Initiated persistence fails", async () => {
    installFakeGateway();
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount({ email: "pi-persist@test.com" });
    const orderRes = await placeOrder(account, product._id.toString());
    const orderId = orderRes.body.data.id;
    const { header } = customerAccessTokenFor(account);

    const original = orderRepository.updateById;
    (orderRepository as unknown as { updateById: unknown }).updateById = async () => {
      throw new Error("db write failed");
    };

    try {
      const res = await request(app)
        .post(`/api/v1/customer/payments/${orderId}/initiate`)
        .set(header)
        .send({ gateway: "FONEPAY" });
      expect(res.status).toBe(500);
      expect(await countPaymentInitiated()).toBe(0);

      const order = await OrderModel.findById(orderId).lean();
      expect(order?.payment.status).toBe("Pending");
    } finally {
      (orderRepository as unknown as { updateById: unknown }).updateById = original;
    }
  });

  it("does not fail a successful initiation when notification creation fails", async () => {
    installFakeGateway();
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount({ email: "pi-notifyfail@test.com" });
    const orderRes = await placeOrder(account, product._id.toString());
    const orderId = orderRes.body.data.id;
    const { header } = customerAccessTokenFor(account);

    const spy = vi
      .spyOn(notificationService, "notifyCustomer")
      .mockRejectedValue(new Error("notifications down"));

    try {
      const res = await request(app)
        .post(`/api/v1/customer/payments/${orderId}/initiate`)
        .set(header)
        .send({ gateway: "FONEPAY" });
      expect(res.status).toBe(200);
      expect(res.body.data.payment.status).toBe("Initiated");
    } finally {
      spy.mockRestore();
    }
  });
});
/**
 * Gateway payment lifecycle (offline, stubbed FONEPAY provider).
 *
 * Settlement is decided exclusively by server-side verification — the
 * browser never confirms a payment. Each case installs a stub FONEPAY
 * provider in the registry; no live gateway API call is ever made.
 */
describe("Gateway payment lifecycle (offline)", () => {
  /** Installs a stub FONEPAY provider whose `verify` returns the given result. */
  function stubGatewayVerify(
    verifyImpl: (txn: string) => Promise<{
      status: string;
      amount: number;
      verifiedAt: Date;
      metadata?: Record<string, unknown>;
    }>,
  ) {
    paymentProviderMap.FONEPAY = {
      initiate: async () => ({
        providerTransactionId: "fp_test_reference",
        expiresAt: new Date(Date.now() + 3_600_000),
        currency: "NPR",
      }),
      verify: verifyImpl,
      getStatus: async () => ({ status: "Pending", amount: 0, metadata: {} }),
      refundCapability: () => "UNSUPPORTED",
    } as unknown as PaymentProviderInterface;
  }

  /** Seed a gateway order (Digital Wallet) and initiate a FONEPAY payment against the stub. */
  async function seedGatewayOrder(email = "gw@test.com") {
    const { product } = await seedCommerce();
    const account = await seedCustomerAccount({ email });
    const orderRes = await placeOrder(account, product._id.toString());
    const orderId = orderRes.body.data.id;
    const { header } = customerAccessTokenFor(account);
    // A real initiation stamps payment.provider=FONEPAY and a stored
    // providerTransactionId — both are required for verification to
    // consider the order payable/known.
    const init = await request(app)
      .post(`/api/v1/customer/payments/${orderId}/initiate`)
      .set(header)
      .send({ gateway: "FONEPAY" });
    expect(init.status).toBe(200);
    return { orderId, header };
  }

  /** Reads the stored provider transaction reference for an order. */
  async function storedReference(orderId: string): Promise<string> {
    const seeded = (await OrderModel.findById(orderId).lean()) as {
      payment?: { providerTransactionId?: string };
    } | null;
    const ref = seeded?.payment?.providerTransactionId;
    if (!ref) throw new Error("order has no stored providerTransactionId");
    return ref;
  }

  it("1. marks an order Paid via server-side verification of the exact amount", async () => {
    // The stub MUST be installed before seedGatewayOrder so initiation runs
    // against the stub (and stores a providerTransactionId). The authoritative
    // payable amount is the server-side order total (price + tax + shipping),
    // NOT the product price — it is only known after the order is seeded, so
    // the verify closure reads it via captured variables.
    let totalMajor = 0;
    stubGatewayVerify(async () => ({
      status: "Paid",
      amount: totalMajor,
      verifiedAt: new Date(),
      metadata: { currency: "NPR", transactionId: "pay_ok" },
    }));
    const { orderId, header } = await seedGatewayOrder("ok@test.com");
    const seeded = await OrderModel.findById(orderId).lean();
    totalMajor = Number(seeded?.amounts?.total);
    const ref = await storedReference(orderId);

    const verify = await request(app)
      .post(`/api/v1/customer/payments/${orderId}/verify`)
      .set(header)
      .send({ gateway: "FONEPAY", providerTransactionId: ref });
    expect(verify.status).toBe(200);

    const order = await OrderModel.findById(orderId).lean();
    expect(order?.payment.status).toBe("Paid");
    expect(order?.status).toBe("Pending");
    expect(order?.payment.paidAt).toBeInstanceOf(Date);
    // The gateway's own transaction id (from the verified provider response's
    // metadata) is stored — not the per-attempt merchant reference, which stays
    // in providerTransactionId.
    expect(order?.payment.transactionId).toBe("pay_ok");
    expect(order?.payment.providerTransactionId).toBe(ref);
  });

  it("2. rejects an amount mismatch on verify — marks Failed, never Paid", async () => {
    stubGatewayVerify(async () => ({
      status: "Paid",
      amount: 100, // does not match the server-side order total
      verifiedAt: new Date(),
      metadata: { currency: "NPR" },
    }));
    const { orderId, header } = await seedGatewayOrder("amt@test.com");
    const ref = await storedReference(orderId);

    const verify = await request(app)
      .post(`/api/v1/customer/payments/${orderId}/verify`)
      .set(header)
      .send({ gateway: "FONEPAY", providerTransactionId: ref });
    expect(verify.status).toBe(200);
    const order = await OrderModel.findById(orderId).lean();
    expect(order?.payment.status).toBe("Failed");
    expect(order?.payment.transactionId).toBeUndefined();
  });

  it("3. never settles via the verify path when the gateway status is not Paid", async () => {
    stubGatewayVerify(async () => ({
      status: "Pending",
      amount: 100,
      verifiedAt: new Date(),
      metadata: {},
    }));
    const { orderId, header } = await seedGatewayOrder("notpaid@test.com");
    const ref = await storedReference(orderId);

    const verify = await request(app)
      .post(`/api/v1/customer/payments/${orderId}/verify`)
      .set(header)
      .send({ gateway: "FONEPAY", providerTransactionId: ref });
    expect(verify.status).toBe(200);
    const order = await OrderModel.findById(orderId).lean();
    expect(order?.payment.status).not.toBe("Paid");
  });

  it("4. already-paid order is never re-paid (idempotent duplicate on initiate)", async () => {
    stubGatewayVerify(async () => ({
      status: "Paid",
      amount: 100,
      verifiedAt: new Date(),
      metadata: { currency: "NPR" },
    }));
    const { orderId, header } = await seedGatewayOrder("paid@test.com");
    await OrderModel.updateOne({ _id: orderId }, { $set: { "payment.status": "Paid" } }).exec();

    const initAgain = await request(app)
      .post(`/api/v1/customer/payments/${orderId}/initiate`)
      .set(header)
      .send({ gateway: "FONEPAY" });
    expect(initAgain.status).toBe(200);
    expect(initAgain.body.data.duplicate).toBe(true);
    expect(initAgain.body.data.payment.status).toBe("Paid");
    const order = await OrderModel.findById(orderId).lean();
    expect(order?.payment.status).toBe("Paid");
  });

  it("5. non-existent order → 404 from the payment surface", async () => {
    const account = await seedCustomerAccount({ email: "nonexistent@test.com" });
    const { header } = customerAccessTokenFor(account);
    const res = await request(app)
      .post("/api/v1/customer/payments/507f1f77bcf86cd799439011/initiate")
      .set(header)
      .send({ gateway: "FONEPAY" });
    expect(res.status).toBe(404);
  });

  it("6. unauthorized (another customer) → 404 without revealing ownership", async () => {
    const owner = await seedCustomerAccount({ email: "owner6@test.com" });
    const { product } = await seedCommerce();
    const orderRes = await placeOrder(owner, product._id.toString());
    const orderId = orderRes.body.data.id;

    const intruder = await seedCustomerAccount({ email: "intruder@test.com" });
    const { header } = customerAccessTokenFor(intruder);
    const res = await request(app)
      .post(`/api/v1/customer/payments/${orderId}/initiate`)
      .set(header)
      .send({ gateway: "FONEPAY" });
    expect(res.status).toBe(404);
  });

  it("7. invalid payment reference on verify is rejected (never Paid)", async () => {
    const { orderId, header } = await seedGatewayOrder("badref@test.com");
    const res = await request(app)
      .post(`/api/v1/customer/payments/${orderId}/verify`)
      .set(header)
      .send({ gateway: "FONEPAY", providerTransactionId: "totally-wrong-ref" });
    expect(res.status).toBe(400);
    const order = await OrderModel.findById(orderId).lean();
    expect(order?.payment.status).not.toBe("Paid");
  });
});

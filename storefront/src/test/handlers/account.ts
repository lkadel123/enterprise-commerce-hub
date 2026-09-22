/**
 * Account-domain MSW handlers (Phase 11): addresses, notifications, support,
 * reviews and coupons. Paths/shapes mirror the real backend customer routers
 * mounted under `/api/v1/customer/*` — no invented endpoints.
 */
import { http, HttpResponse } from "msw";
import type { DefaultBodyType } from "msw";

import { API_BASE_URL } from "@/config/env";
import { fail, ok } from "../fixtures/catalog";

/** Bodies recorded for security assertions in tests (financial-field exclusion). */
export const recordedAccountBodies: Record<string, DefaultBodyType[]> = {};

function record(key: string, body: DefaultBodyType): void {
  recordedAccountBodies[key] = [...(recordedAccountBodies[key] ?? []), body];
}

export function resetAccountState(): void {
  for (const key of Object.keys(recordedAccountBodies)) delete recordedAccountBodies[key];
}

function requireAuth(request: Request): boolean {
  return request.headers.get("authorization") !== null;
}

function unauthorized() {
  return HttpResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
}

const ADDRESS = {
  id: "addr-1",
  label: "Home",
  line1: "12 Thamel Road",
  city: "Kathmandu",
  state: "Bagmati",
  postalCode: "44600",
  country: "Nepal",
  isDefault: true,
};

const NOTIFICATION = {
  id: "ntf-1",
  type: "order_created",
  title: "Order confirmed",
  read: false,
  priority: "normal",
  createdAt: "2026-08-01T10:00:00.000Z",
};

const CONVERSATION = {
  id: "conv-1",
  subject: "Where is my order?",
  status: "open",
  priority: "normal",
  category: "delivery",
  createdAt: "2026-08-02T09:00:00.000Z",
};

const MESSAGE = {
  id: "msg-1",
  conversationId: "conv-1",
  senderType: "customer",
  message: "Hello, I need help.",
  createdAt: "2026-08-02T09:01:00.000Z",
};

const REVIEW = {
  id: "rev-1",
  productId: "prod-1",
  rating: 5,
  title: "Great monitor",
  comment: "Excellent colours.",
  status: "Pending",
  createdAt: "2026-08-03T12:00:00.000Z",
};

const a = `${API_BASE_URL}/customer/addresses`;
const n = `${API_BASE_URL}/customer/notifications`;
const s = `${API_BASE_URL}/customer/support/conversations`;
const r = `${API_BASE_URL}/customer/reviews`;
const cp = `${API_BASE_URL}/customer/coupons`;

export const addressHandlers = [
  http.get(a, ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    return HttpResponse.json(ok([ADDRESS]));
  }),

  http.post(a, async ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    const body = (await request.json()) as Record<string, unknown>;
    record("address/create", body);
    // The backend schema is strict — unknown fields are rejected.
    const allowed = [
      "label",
      "line1",
      "line2",
      "city",
      "state",
      "postalCode",
      "country",
      "isDefault",
    ];
    for (const key of Object.keys(body)) {
      if (!allowed.includes(key)) {
        return HttpResponse.json(fail("VALIDATION_ERROR", `Unknown field: ${key}`), {
          status: 422,
        });
      }
    }
    return HttpResponse.json(ok({ ...ADDRESS, ...body, id: "addr-2" }), { status: 201 });
  }),

  http.get(`${a}/:id`, ({ request }) =>
    requireAuth(request) ? HttpResponse.json(ok(ADDRESS)) : unauthorized(),
  ),

  http.patch(`${a}/:id`, async ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    const body = (await request.json()) as Record<string, unknown>;
    record("address/update", body);
    return HttpResponse.json(ok({ ...ADDRESS, ...body }));
  }),

  http.delete(`${a}/:id`, ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    return HttpResponse.json(ok({ deleted: true }));
  }),
];

export const notificationHandlers = [
  http.get(n, ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    return HttpResponse.json({
      ...ok([NOTIFICATION]),
      meta: { page: 1, pageSize: 20, total: 1 },
    });
  }),

  http.get(`${n}/unread-count`, ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    return HttpResponse.json(ok({ count: 1 }));
  }),

  http.get(`${n}/:id`, ({ request }) =>
    requireAuth(request) ? HttpResponse.json(ok(NOTIFICATION)) : unauthorized(),
  ),

  http.patch(`${n}/:id/read`, ({ request }) =>
    requireAuth(request) ? HttpResponse.json(ok({ ...NOTIFICATION, read: true })) : unauthorized(),
  ),

  http.post(`${n}/read-all`, ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    return HttpResponse.json(ok({ updated: 1 }));
  }),

  http.delete(`${n}/:id`, ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    return HttpResponse.json(ok({ deleted: true }));
  }),
];

export const supportHandlers = [
  http.post(s, async ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    const body = (await request.json()) as Record<string, unknown>;
    record("support/create", body);
    // senderType/customerId are forced server-side; the client must not send them.
    if ("senderType" in body || "customerId" in body) {
      return HttpResponse.json(fail("VALIDATION_ERROR", "Unrecognized key"), { status: 422 });
    }
    return HttpResponse.json(ok(CONVERSATION), { status: 201 });
  }),

  http.get(s, ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    return HttpResponse.json({ ...ok([CONVERSATION]), meta: { page: 1, pageSize: 10, total: 1 } });
  }),

  http.get(`${s}/:id/messages`, ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    return HttpResponse.json(ok([MESSAGE]));
  }),

  http.post(`${s}/:id/messages`, async ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    const body = (await request.json()) as Record<string, unknown>;
    record("support/message", body);
    return HttpResponse.json(ok(MESSAGE), { status: 201 });
  }),
];

export const reviewHandlers = [
  http.get(r, ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    return HttpResponse.json({ ...ok([REVIEW]), meta: { page: 1, pageSize: 10, total: 1 } });
  }),

  http.post(r, async ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    const body = (await request.json()) as Record<string, unknown>;
    record("review/create", body);
    return HttpResponse.json(ok({ ...REVIEW, ...body, status: "Pending" }), { status: 201 });
  }),
];

export const couponHandlers = [
  http.post(`${cp}/validate`, async ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    const body = (await request.json()) as Record<string, unknown>;
    record("coupon/validate", body);
    // Strict backend contract: only {code, items?} are accepted.
    const allowed = ["code", "items"];
    for (const key of Object.keys(body)) {
      if (!allowed.includes(key)) {
        return HttpResponse.json(fail("VALIDATION_ERROR", "Unrecognized key"), { status: 422 });
      }
    }
    if (body.code === "SAVE10") {
      return HttpResponse.json(ok({ valid: true, code: "SAVE10" }));
    }
    return HttpResponse.json(fail("COUPON_INVALID", "Coupon is invalid or expired."), {
      status: 404,
    });
  }),

  http.get(cp, ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    return HttpResponse.json({
      ...ok([{ id: "cpn-1", code: "SAVE10", discountType: "Percentage", value: 10 }]),
      meta: { page: 1, pageSize: 10, total: 1 },
    });
  }),
];

export const accountHandlers = [
  ...addressHandlers,
  ...notificationHandlers,
  ...supportHandlers,
  ...reviewHandlers,
  ...couponHandlers,
];

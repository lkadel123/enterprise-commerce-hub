import { http, HttpResponse } from "msw";
import type { DefaultBodyType } from "msw";

import { API_BASE_URL } from "@/config/env";
import type { CustomerPaymentGatewayOption } from "@/types";
import { fail, ok } from "../fixtures/catalog";

interface CartItem {
  productId: string;
  quantity: number;
}

const carts = new Map<string, CartItem[]>();
const wishlists = new Map<string, string[]>();

/** Recorded request bodies for security assertions in tests. */
export const recordedBodies: Record<string, DefaultBodyType[]> = {};

export function resetCommerceState(): void {
  carts.clear();
  wishlists.clear();
  paymentGateways = defaultPaymentGateways();
  for (const key of Object.keys(recordedBodies)) delete recordedBodies[key];
}

function customerId(request: Request): string {
  const auth = request.headers.get("authorization") ?? "";
  // The bearer token doubles as the owner key in the mock.
  return auth.replace(/^Bearer\s+/i, "") || "anonymous";
}

function requireAuth(request: Request): boolean {
  return request.headers.get("authorization") !== null;
}

function unauthorized() {
  return HttpResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
}

const c = `${API_BASE_URL}/cart`;
const w = `${API_BASE_URL}/wishlist`;
const o = `${API_BASE_URL}/customer/orders`;
const pay = `${API_BASE_URL}/customer/payments`;

/**
 * Payment options the mock backend reports at `GET /customer/payments/gateways`.
 *
 * Mirrors the production default: COD is always available, Cybersource is
 * configured in the mock environment, and Fonepay is DISABLED — a test that
 * needs Fonepay must opt in via {@link setPaymentGatewaysForTests}, exactly as
 * an operator would have to enable it server-side.
 */
function defaultPaymentGateways(): CustomerPaymentGatewayOption[] {
  return [
    {
      gateway: "COD",
      label: "Cash on Delivery",
      hint: "Pay in cash when your order arrives.",
      method: "Cash on Delivery",
      available: true,
    },
    {
      gateway: "FONEPAY",
      label: "Fonepay QR",
      hint: "Scan a payment QR with any Fonepay-supported banking app.",
      method: "Bank Transfer",
      available: false,
    },
    {
      gateway: "CYBERSOURCE",
      label: "Credit / Debit Card",
      hint: "Pay securely by card with Cybersource Unified Checkout.",
      method: "Credit Card",
      available: true,
    },
  ];
}

let paymentGateways = defaultPaymentGateways();

/** Replace the gateways the mock backend reports (e.g. to enable Fonepay). */
export function setPaymentGatewaysForTests(options: CustomerPaymentGatewayOption[]): void {
  paymentGateways = options;
}

/* ---------------------------------- cart ---------------------------------- */
const cartHandlers = [
  http.get(c, ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    return HttpResponse.json(ok({ items: carts.get(customerId(request)) ?? [] }));
  }),

  http.post(`${c}/items`, async ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    const body = (await request.json()) as CartItem;
    const id = customerId(request);
    const items = carts.get(id) ?? [];
    const existing = items.find((i) => i.productId === body.productId);
    if (existing) existing.quantity += body.quantity ?? 1;
    else items.push({ productId: body.productId, quantity: body.quantity ?? 1 });
    carts.set(id, items);
    return HttpResponse.json(ok({ items }), { status: 201 });
  }),

  http.patch(`${c}/items/:productId`, async ({ request, params }) => {
    if (!requireAuth(request)) return unauthorized();
    const body = (await request.json()) as { quantity: number };
    const id = customerId(request);
    const items = carts.get(id) ?? [];
    const item = items.find((i) => i.productId === String(params.productId));
    if (!item) {
      return HttpResponse.json(fail("NOT_FOUND", "Cart item not found."), { status: 404 });
    }
    item.quantity = body.quantity;
    return HttpResponse.json(ok({ items }));
  }),
];

const cartDeleteMergeHandlers = [
  http.delete(`${c}/items/:productId`, ({ request, params }) => {
    if (!requireAuth(request)) return unauthorized();
    const id = customerId(request);
    const items = (carts.get(id) ?? []).filter((i) => i.productId !== String(params.productId));
    carts.set(id, items);
    return HttpResponse.json(ok({ items }));
  }),

  http.post(`${c}/merge`, async ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    const body = (await request.json()) as { items: CartItem[] };
    recordedBodies["cart/merge"] = [...(recordedBodies["cart/merge"] ?? []), body];
    const id = customerId(request);
    const items = carts.get(id) ?? [];
    for (const incoming of body.items) {
      const existing = items.find((i) => i.productId === incoming.productId);
      if (existing) existing.quantity += incoming.quantity;
      else items.push(incoming);
    }
    carts.set(id, items);
    return HttpResponse.json(ok({ items }));
  }),
];

/* -------------------------------- wishlist -------------------------------- */
const wishlistHandlers = [
  http.get(w, ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    const ids = wishlists.get(customerId(request)) ?? [];
    return HttpResponse.json(ok({ items: ids.map((id) => ({ productId: id })) }));
  }),

  http.post(w, async ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    const body = (await request.json()) as { productId: string };
    const id = customerId(request);
    const ids = wishlists.get(id) ?? [];
    if (!ids.includes(body.productId)) ids.push(body.productId);
    wishlists.set(id, ids);
    return HttpResponse.json(ok({ items: ids.map((pid) => ({ productId: pid })) }), {
      status: 201,
    });
  }),

  http.delete(`${w}/:productId`, ({ request, params }) => {
    if (!requireAuth(request)) return unauthorized();
    const id = customerId(request);
    const ids = (wishlists.get(id) ?? []).filter((pid) => pid !== String(params.productId));
    wishlists.set(id, ids);
    return HttpResponse.json(ok({ items: ids.map((pid) => ({ productId: pid })) }));
  }),
];

/* --------------------------------- orders --------------------------------- */
const orderHandlers = [
  http.post(o, async ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    const body = (await request.json()) as DefaultBodyType;
    recordedBodies["order/create"] = [...(recordedBodies["order/create"] ?? []), body];
    const b = body as { paymentMethod?: string };
    return HttpResponse.json(
      ok({
        id: "order-1",
        status: "Pending",
        paymentMethod: b.paymentMethod ?? "Cash on Delivery",
        total: 54900,
      }),
      { status: 201 },
    );
  }),

  http.get(o, ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    return HttpResponse.json(
      ok([{ id: "order-1", status: "Paid", total: 54900 }], {
        meta: { page: 1, pageSize: 10, total: 1 },
      }),
    );
  }),

  http.get(`${o}/:orderId`, ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    return HttpResponse.json(ok({ id: "order-1", status: "Paid", total: 54900 }));
  }),
];

/* -------------------------------- payments -------------------------------- */
const paymentHandlers = [
  http.get(`${pay}/gateways`, ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    return HttpResponse.json(ok({ gateways: paymentGateways }));
  }),

  http.post(`${pay}/:orderId/initiate`, async ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    const body = (await request.json()) as DefaultBodyType;
    recordedBodies["payment/initiate"] = [...(recordedBodies["payment/initiate"] ?? []), body];
    return HttpResponse.json(
      ok({
        order: { id: "order-1", status: "Pending" },
        payment: {
          gateway: "CYBERSOURCE",
          status: "Initiated",
        },
      }),
    );
  }),

  http.post(`${pay}/:orderId/verify`, async ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    const body = (await request.json()) as DefaultBodyType;
    recordedBodies["payment/verify"] = [...(recordedBodies["payment/verify"] ?? []), body];
    return HttpResponse.json(
      ok({ order: { id: "order-1", status: "Paid" }, payment: { status: "Paid" } }),
    );
  }),

  http.get(`${pay}/:orderId/status`, ({ request }) => {
    if (!requireAuth(request)) return unauthorized();
    return HttpResponse.json(ok({ payment: { status: "Initiated", gateway: "CYBERSOURCE" } }));
  }),
];

export const commerceHandlers = [
  ...cartHandlers,
  ...cartDeleteMergeHandlers,
  ...wishlistHandlers,
  ...orderHandlers,
  ...paymentHandlers,
];

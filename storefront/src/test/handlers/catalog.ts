/**
 * Catalog handlers mirroring the public-catalog routes (`/api/v1/public/*`).
 */
import { http, HttpResponse } from "msw";

import { API_BASE_URL } from "@/config/env";
import { PRODUCT_A, PRODUCT_B, ok } from "../fixtures/catalog";

const p = `${API_BASE_URL}/public`;

export const catalogHandlers = [
  http.get(`${p}/products`, ({ request }) => {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    const items = [PRODUCT_A, PRODUCT_B].filter((product) =>
      product.name.toLowerCase().includes(q.toLowerCase()),
    );
    return HttpResponse.json(ok(items, { meta: { page: 1, pageSize: 24, total: items.length } }));
  }),

  http.get(`${p}/products/:slug`, ({ params }) => {
    const slug = String(params.slug);
    const product = [PRODUCT_A, PRODUCT_B].find((item) => item.slug === slug);
    if (!product) {
      return HttpResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Product not found." } },
        { status: 404 },
      );
    }
    return HttpResponse.json(ok(product));
  }),

  http.get(`${p}/categories`, () =>
    HttpResponse.json(ok([PRODUCT_A.category], { meta: { page: 1, pageSize: 50, total: 1 } })),
  ),

  http.get(`${p}/brands`, () =>
    HttpResponse.json(ok([PRODUCT_A.brand], { meta: { page: 1, pageSize: 50, total: 1 } })),
  ),
];

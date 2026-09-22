/**
 * Shared MSW server for storefront tests.
 *
 * Suites that perform HTTP call `server.listen()` in `beforeAll` and
 * `server.close()` in `afterAll`; `resetHandlers`/`resetCommerceState` run
 * between tests so state never leaks. `onUnhandledRequest: "error"` makes any
 * request without an explicit handler fail loudly instead of silently
 * returning bogus data.
 */
import { setupServer } from "msw/node";

import { authHandlers } from "./handlers/auth";
import { catalogHandlers } from "./handlers/catalog";
import { commerceHandlers } from "./handlers/commerce";
import { accountHandlers } from "./handlers/account";

export const server = setupServer(
  ...authHandlers,
  ...catalogHandlers,
  ...commerceHandlers,
  ...accountHandlers,
);

// Loud, precise failure for any request without a handler — including the
// request URL so regressions are diagnosable at a glance.
server.events.on("request:unhandled", ({ request }) => {
  console.warn(`[MSW] unhandled request: ${request.method} ${request.url}`);
});

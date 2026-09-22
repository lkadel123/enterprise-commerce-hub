import compression from "compression";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env, isProduction } from "./config/env.js";
import { isDbConnected } from "./database/connection.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFoundHandler } from "./middleware/notFound.js";
import { apiRateLimiter } from "./middleware/rateLimiter.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { customerAuthRouter } from "./modules/customer-auth/customer-auth.routes.js";
import { accountRouter } from "./modules/account/account.routes.js";
import { publicCatalogRouter } from "./modules/public-catalog/public-catalog.routes.js";
import { brandsRouter } from "./modules/brands/brand.routes.js";
import { categoriesRouter } from "./modules/categories/category.routes.js";
import { couponsRouter } from "./modules/coupons/coupon.routes.js";
import { customersRouter } from "./modules/customers/customer.routes.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import { ordersRouter } from "./modules/orders/order.routes.js";
import { productsRouter } from "./modules/products/product.routes.js";
import { notificationsRouter } from "./modules/notifications/notification.routes.js";
import { messagesRouter } from "./modules/messages/message.routes.js";
import { reportsRouter } from "./modules/reports/report.routes.js";
import { reviewsRouter } from "./modules/reviews/review.routes.js";
import { usersRouter } from "./modules/users/user.routes.js";
import { paymentsRouter } from "./modules/payments/payment.routes.js";
import { mediaRouter } from "./modules/media/media.routes.js";
import { bannersRouter } from "./modules/banners/banner.routes.js";
// Customer storefront (self-service) routes. Each router enforces its own
// customerAuthenticate + ownership/IDOR scoping — no app-level customer auth here.
import { cartRouter } from "./modules/cart/cart.routes.js";
import { wishlistRouter } from "./modules/wishlist/wishlist.routes.js";
import { customerOrdersRouter } from "./modules/customer-orders/customer-order.routes.js";
import { customerReviewsRouter } from "./modules/customer-reviews/customer-review.routes.js";
import { customerNotificationsRouter } from "./modules/customer-notifications/customer-notification.routes.js";
import { customerCouponsRouter } from "./modules/customer-coupons/customer-coupon.routes.js";
import { customerPaymentsRouter } from "./modules/customer-payments/customer-payment.routes.js";
import { customerAddressesRouter } from "./modules/customer-address/customer-address.routes.js";
import { supportCustomerRouter, supportAdminRouter } from "./modules/support/support.routes.js";
import { localMediaStorageRoot } from "./storage/mediaStorage.js";
import { LOG_REDACT_CENSOR, LOG_REDACT_PATHS, logger } from "./utils/logger.js";

const API_PREFIX = "/api/v1";

/**
 * Builds and configures the Express application. Exported as a factory so the
 * server can be bootstrapped and integration tests can mount their own instance.
 */
export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");

  // ---------------------------------------------------------------------------
  // Reverse-proxy trust (Phase 19 production hardening).
  //
  // In production the app never sees the browser socket directly: Apache/Passenger
  // on cPanel (or nginx/a load balancer) terminates the connection and forwards
  // the real client address in X-Forwarded-For. Express only derives `req.ip`
  // from that header for hops it has been told to trust. Left at the default
  // (no trust), `req.ip` is the PROXY socket address, so every visitor shares a
  // single express-rate-limit bucket: one noisy client locks out the whole site
  // and per-IP throttling is meaningless.
  //
  // TRUST_PROXY is validated by the env schema and is deliberately narrow:
  // "loopback" (default, matches Apache/Passenger connecting from the local
  // machine) or an explicit hop count / trusted subnet list. Trusting every hop
  // ("true"/"*") would let any client forge X-Forwarded-For and evade rate
  // limits, so production boot rejects it (see env.ts production guard).
  //
  // NOTE: this only changes how the client address is DERIVED. TLS, cookies,
  // authentication and the payment verification path are unaffected.
  // ---------------------------------------------------------------------------
  app.set("trust proxy", env.TRUST_PROXY);

  // Correlation id (echoed as X-Request-Id, propagated into pino logs via req.id).
  app.use(requestIdMiddleware);

  // Security & transport basics
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(
    cors((req, cb) => {
      const allowedOrigins = env.CLIENT_ORIGIN.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
      const origin = req.headers.origin ?? "";
      // Only permit credentials from listed origins. Unauthorized origins get
      // neither Access-Control-Allow-Origin nor Access-Control-Allow-Credentials
      // (the default cors behaviour would still emit the credentials header).
      const allowed = allowedOrigins.includes(origin);
      cb(null, { origin: allowedOrigins, credentials: allowed });
    }),
  );
  app.use(compression());

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(cookieParser());

  // Request logging (redact auth headers/cookies)
  app.use(
    pinoHttp({
      logger,
      // Reuse the correlation id assigned by requestIdMiddleware so every log
      // line for a request shares one id (falls back to a fresh UUID).
      genReqId: (req) => (req as { id?: string }).id ?? randomUUID(),
      redact: {
        paths: [...LOG_REDACT_PATHS],
        censor: LOG_REDACT_CENSOR,
      },
      autoLogging: {
        ignore: (req) => {
          const url = req.url ?? "";
          return (
            url === `${API_PREFIX}/health` ||
            url === "/health" ||
            url === "/health/live" ||
            url === "/health/ready"
          );
        },
      },
    }),
  );

  // Liveness — the process is up and handling requests. No dependencies.
  app.get("/health/live", (_req, res) => {
    res.status(200).json({
      success: true,
      data: { status: "live", service: "enterprise-commerce-hub-api" },
    });
  });

  // Readiness — healthy only when its dependencies (database) are reachable.
  // Used by orchestrators / load balancers to route traffic only after the
  // service is fully ready; returns 503 when the DB connection is down.
  app.get("/health/ready", (_req, res) => {
    const ready = isDbConnected();
    res.status(ready ? 200 : 503).json({
      success: ready,
      data: {
        status: ready ? "ready" : "not_ready",
        service: "enterprise-commerce-hub-api",
        database: isDbConnected() ? "connected" : "disconnected",
        timestamp: new Date().toISOString(),
      },
    });
  });

  // Health check (public)
  app.get("/health", (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        status: "ok",
        service: "enterprise-commerce-hub-api",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        environment: env.NODE_ENV,
        node: process.version,
        database: isDbConnected() ? "connected" : "disconnected",
      },
    });
  });

  // API routes
  app.use(`${API_PREFIX}/health`, (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        status: "ok",
        service: "enterprise-commerce-hub-api",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        environment: env.NODE_ENV,
        node: process.version,
        database: isDbConnected() ? "connected" : "disconnected",
      },
    });
  });

  // General rate limiter for all authenticated API traffic
  app.use(`${API_PREFIX}`, apiRateLimiter);

  // IMPORTANT: register the customer-auth subtree BEFORE the admin auth router.
  // authRouter registers a catch-all `router.use(authenticate)` (auth.routes.ts)
  // that, mounted under the wider `/api/v1/auth` prefix, would intercept and 401
  // every `/api/v1/auth/customer/*` request (incl. public register/login) if it
  // were matched first. Mounting the more-specific `/customer` prefix first lets
  // customer-auth routes win the prefix match; admin routes under `/api/v1/auth`
  // (login/refresh/logout/me/change-password) still fall through to authRouter.
  app.use(`${API_PREFIX}/auth/customer`, customerAuthRouter);
  app.use(`${API_PREFIX}/auth`, authRouter);
  app.use(`${API_PREFIX}/account`, accountRouter);
  app.use(`${API_PREFIX}/public`, publicCatalogRouter);
  app.use(`${API_PREFIX}/users`, usersRouter);
  app.use(`${API_PREFIX}/products`, productsRouter);
  app.use(`${API_PREFIX}/categories`, categoriesRouter);
  app.use(`${API_PREFIX}/brands`, brandsRouter);
  app.use(`${API_PREFIX}/inventory`, inventoryRouter);
  app.use(`${API_PREFIX}/orders`, ordersRouter);
  app.use(`${API_PREFIX}/payments`, paymentsRouter);
  app.use(`${API_PREFIX}/customers`, customersRouter);
  app.use(`${API_PREFIX}/coupons`, couponsRouter);
  app.use(`${API_PREFIX}/reviews`, reviewsRouter);
  app.use(`${API_PREFIX}/notifications`, notificationsRouter);
  app.use(`${API_PREFIX}/messages`, messagesRouter);
  app.use(`${API_PREFIX}/reports`, reportsRouter);
  app.use(`${API_PREFIX}/media`, mediaRouter);
  app.use(`${API_PREFIX}/banners`, bannersRouter);

  // Customer storefront (self-service) routes — each router enforces its own
  // customerAuthenticate + ownership/IDOR checks; admin support routes require
  // authenticate + requirePermission("support", "view") at the router level.
  app.use(`${API_PREFIX}/cart`, cartRouter);
  app.use(`${API_PREFIX}/wishlist`, wishlistRouter);
  app.use(`${API_PREFIX}/customer/orders`, customerOrdersRouter);
  app.use(`${API_PREFIX}/customer/reviews`, customerReviewsRouter);
  app.use(`${API_PREFIX}/customer/notifications`, customerNotificationsRouter);
  app.use(`${API_PREFIX}/customer/coupons`, customerCouponsRouter);
  app.use(`${API_PREFIX}/customer/payments`, customerPaymentsRouter);
  app.use(`${API_PREFIX}/customer/addresses`, customerAddressesRouter);
  app.use(`${API_PREFIX}/customer/support/conversations`, supportCustomerRouter);
  app.use(`${API_PREFIX}/admin/support/conversations`, supportAdminRouter);

  // Uploads are served from an application-owned directory; storage keys are
  // generated server-side and never derived from a request path.
  // In local mode, static files are served from the local upload root with
  // security headers. In S3/CDN mode, the media route is served by the CDN.
  if (env.STORAGE_PROVIDER === "local") {
    app.use(
      "/media-files",
      express.static(localMediaStorageRoot, {
        index: false,
        fallthrough: true,
        dotfiles: "deny",
        // Long-lived immutable cache for media. Media URLs are effectively
        // immutable (UUID keys, wx/no-clobber writes, new-UUID-per-replacement),
        // so browsers/CDNs may cache for the full TTL. `send` interprets maxAge
        // as milliseconds and derives max-age (seconds) from it, so pass 1 year
        // in ms to emit `Cache-Control: public, max-age=31536000, immutable`.
        maxAge: 31536000 * 1000,
        immutable: true,
        setHeaders: (res) => {
          res.setHeader("X-Content-Type-Options", "nosniff");
        },
      }),
    );
  }

  // Unknown routes â†’ JSON 404
  app.use(notFoundHandler);

  // Central error handler (last)
  app.use(errorHandler);

  return app;
}

export { isProduction, API_PREFIX };

import "dotenv/config";
import { z } from "zod";

/**
 * Environment configuration, validated at startup with Zod.
 * Fails fast when required variables are missing or malformed.
 */

/**
 * Fonepay placeholder detection. Template values copied from .env.example
 * ("your-fonepay-username", "your-fonepay-terminal-id", ...) mean NO real
 * Fonepay credentials exist. When any of them is present the whole Fonepay
 * gateway is treated as DISABLED: the terminal id is not validated and the
 * credential values are normalized to empty (below) so the provider stays
 * unregistered and Fonepay attempts fail fast with 503 at payment time.
 * Real credentials never match this pattern and are fully validated.
 */
const FONEPAY_PLACEHOLDER_RE = /^your-fonepay-/i;

interface FonepayEnvParts {
  FONEPAY_USERNAME: string;
  FONEPAY_PASSWORD: string;
  FONEPAY_PRIVATE_KEY: string;
  FONEPAY_TERMINAL_ID: string;
}

/** True when Fonepay carries template placeholder values (i.e. is unused). */
function fonepayIsDisabled(value: FonepayEnvParts): boolean {
  return (
    FONEPAY_PLACEHOLDER_RE.test(value.FONEPAY_USERNAME) ||
    FONEPAY_PLACEHOLDER_RE.test(value.FONEPAY_PASSWORD) ||
    FONEPAY_PLACEHOLDER_RE.test(value.FONEPAY_PRIVATE_KEY) ||
    FONEPAY_PLACEHOLDER_RE.test(value.FONEPAY_TERMINAL_ID)
  );
}

const envSchema = z
  .object({
    // Server
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    HOST: z.string().default("0.0.0.0"),

    PORT: z.coerce.number().int().positive().default(4000),

    // MongoDB
    MONGO_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/enterprise-commerce-hub"),

    MONGO_DEBUG: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),

    // JWT
    JWT_ACCESS_SECRET: z.string().min(16).default("dev-access-secret-change-me-0123456789abcdef"),

    JWT_REFRESH_SECRET: z.string().min(16).default("dev-refresh-secret-change-me-fedcba9876543210"),

    ACCESS_TOKEN_TTL: z.string().min(2).default("15m"),

    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().positive().default(7),

    // Cookies
    COOKIE_NAME: z.string().min(1).default("refresh_token"),

    COOKIE_DOMAIN: z.string().optional(),

    COOKIE_SECURE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),

    // Customer (storefront) JWT + sessions
    CUSTOMER_JWT_ACCESS_SECRET: z
      .string()
      .min(16)
      .default("dev-customer-access-secret-0123456789abcdef"),

    CUSTOMER_ACCESS_TOKEN_TTL: z.string().min(2).default("15m"),

    CUSTOMER_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().positive().default(7),

    CUSTOMER_COOKIE_NAME: z.string().min(1).default("customer_refresh_token"),

    // CORS
    CLIENT_ORIGIN: z.string().default("http://localhost:8080"),

    // ---------------------------------------------------------------------------
    // Reverse-proxy trust (Phase 19 production hardening).
    //
    // cPanel/Apache + Passenger, nginx and load balancers all terminate the
    // connection and forward the real client address in X-Forwarded-For. Express
    // must be told exactly which hop(s) to trust, otherwise `req.ip` is the
    // proxy's socket address: every request shares one rate-limit bucket (a
    // site-wide lockout instead of per-client throttling).
    //
    // Accepted values (Express `trust proxy` semantics): a hop count ("1", "2"),
    // a trusted subnet/IP list, or a preset ("loopback", "linklocal",
    // "uniquelocal"). The default "loopback" matches the cPanel topology
    // (Apache/Passenger connects to the app from the local machine) and is SAFE
    // for direct connections too, because a remote client's socket address is
    // never loopback and therefore its forged X-Forwarded-For is ignored.
    //
    // NEVER set this to "true"/"*": trusting every hop lets any client spoof
    // X-Forwarded-For and bypass all IP-based rate limiting (rejected in
    // production by the guard below).
    // ---------------------------------------------------------------------------
    TRUST_PROXY: z.string().trim().default("loopback"),

    // Logging
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    // Error monitoring (optional — Phase 12). Integration is a no-op when
    // SENTRY_DSN is absent, so development never requires Sentry credentials.
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
    // Media storage (local is for development; uploaded files are gitignored).
    STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
    UPLOAD_DIR: z.string().min(1).default("uploads"),
    MEDIA_PUBLIC_URL: z.string().url().default("http://localhost:4000/media-files"),
    MEDIA_MAX_FILE_SIZE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(25 * 1024 * 1024)
      .default(5 * 1024 * 1024),
    // Decompression-bomb guard: maximum decoded pixels (width * height) accepted.
    MEDIA_MAX_IMAGE_PIXELS: z.coerce.number().int().positive().default(60_000_000),
    // S3-compatible object storage (only used when STORAGE_PROVIDER=s3).
    S3_ENDPOINT: z.string().default(""),
    S3_REGION: z.string().default("us-east-1"),
    S3_BUCKET: z.string().default(""),
    S3_ACCESS_KEY_ID: z.string().default(""),
    S3_SECRET_ACCESS_KEY: z.string().default(""),
    S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
    // ---------------------------------------------------------------------------
    // Payment defaults (provider-neutral).
    //
    // The application's online gateways are contacted DIRECTLY — there is no
    // intermediary payment aggregator. The active set is:
    //   - COD          offline (no gateway call at all)
    //   - FONEPAY      QR / Intent Checkout (NPR)
    //   - CYBERSOURCE  Unified Checkout card payments
    //
    // PAYMENT_DEFAULT_CURRENCY is the currency used for orders and for the
    // non-gateway (COD) payment record. Each gateway reports the currency it
    // actually settled in; a gateway amount in a different currency is rejected
    // rather than silently converted (see customer-payment.service.ts).
    // ---------------------------------------------------------------------------
    PAYMENT_DEFAULT_CURRENCY: z.string().trim().length(3).default("NPR"),

    // ---------------------------------------------------------------------------
    // Fonepay QR / Intent Checkout — online payment gateway (Nepal, NPR only).
    //
    // SECURITY:
    // - Server-side only. NEVER expose via VITE_*/NEXT_PUBLIC_* or send to the
    //   browser. Credentials (username/password/RSA private key) live exclusively
    //   in environment variables and are never logged.
    // - Optional at boot so the server starts for non-payment
    //   work; the provider fails fast (503) at payment time when unconfigured.
    //   The production check below enforces all-or-nothing configuration.
    // - The private key is PKCS8, supplied either Base64- or HEX-encoded WITHOUT
    //   PEM headers (matching Fonepay's Postman collection normalization).
    // - FONEPAY_BASE_URL examples (never hardcoded in source):
    //     UAT/dev : https://uat-new-merchant-api.fonepay.com
    //               (Postman dev gateway: https://dev-external-gateway-new.fonepay.com/merchantThirdparty)
    //     prod    : supplied by Fonepay merchant onboarding — do not invent.
    //   API paths are appended in code: /api/merchant/third-party/v2/... and
    //   /api/merchant/merchantDetailsForThirdParty/v2/login.
    // ---------------------------------------------------------------------------
    FONEPAY_BASE_URL: z.string().trim().default(""),
    FONEPAY_USERNAME: z.string().trim().default(""),
    FONEPAY_PASSWORD: z.string().trim().default(""),
    FONEPAY_PRIVATE_KEY: z.string().trim().default(""),
    /**
     * Merchant terminal id — sent as `terminalId` / verified as `merchantCode`.
     * Conditionally validated (1..16 chars, Fonepay requirement) ONLY when
     * Fonepay is otherwise configured (see superRefine below). When Fonepay is
     * disabled — no credentials configured/used — this may be empty or carry a
     * stale placeholder; it is simply ignored because the gateway stays
     * unregistered and fails fast with 503 at payment time.
     */
    FONEPAY_TERMINAL_ID: z.string().trim().default(""),
    /** Outbound Fonepay API request timeout (login / QR / status calls). */
    FONEPAY_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),

    // ---------------------------------------------------------------------------
    // Cybersource card payments — Unified Checkout (Sessions API capture context).
    //
    // SECURITY:
    // - Server-side only. NEVER expose via VITE_*/NEXT_PUBLIC_* or send to the
    //   browser. Credentials (HTTP-Signature key id + shared secret from the
    //   Cybersource Business Center → Payment Configuration → Key Management)
    //   live exclusively in environment variables and are never logged. The
    //   Business Center dashboard username/password must never be used here.
    // - Optional at boot (like Fonepay) so the server starts for non-payment
    //   work; the provider is only REGISTERED when fully configured
    //   and otherwise fails fast (503) at payment time. The production check
    //   below enforces all-or-nothing configuration.
    // - CYBERSOURCE_CURRENCY must match the currency actually enabled on the
    //   Cybersource merchant account (NPR orders settled in a non-NPR currency
    //   are reported by the provider — never converted silently).
    // ---------------------------------------------------------------------------
    CYBERSOURCE_ENVIRONMENT: z.enum(["test", "production"]).default("test"),
    CYBERSOURCE_MERCHANT_ID: z.string().trim().default(""),
    CYBERSOURCE_KEY_ID: z.string().trim().default(""),
    CYBERSOURCE_SHARED_SECRET: z.string().trim().default(""),
    /** Optional portfolio/organization id (multi-org merchant configurations). */
    CYBERSOURCE_ORGANIZATION_ID: z.string().trim().default(""),
    /** Settlement currency configured on the Cybersource merchant account. */
    CYBERSOURCE_CURRENCY: z.string().trim().length(3).default("USD"),
    CYBERSOURCE_LOCALE: z.string().trim().default("en_US"),
    CYBERSOURCE_COUNTRY: z.string().trim().length(2).default("US"),
    /** Comma-separated card networks / payment types offered in Unified Checkout. */
    CYBERSOURCE_ALLOWED_CARD_NETWORKS: z.string().trim().default("VISA,MASTERCARD"),
    CYBERSOURCE_ALLOWED_PAYMENT_TYPES: z.string().trim().default("CARD"),
    /** Unified Checkout client library version requested from the Sessions API. */
    CYBERSOURCE_CLIENT_VERSION: z.string().trim().default("1.0"),
    /** Outbound Cybersource Sessions API request timeout. */
    CYBERSOURCE_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    /** Complete Mandate (automatic processing); "false" degrades to transient-token mode. */
    CYBERSOURCE_COMPLETE_MANDATE_ENABLED: z.enum(["true", "false"]).default("true"),
    /** HTTPS origins allowed to render Unified Checkout (overrides CLIENT_ORIGIN). */
    CYBERSOURCE_TARGET_ORIGINS: z.string().trim().default(""),

    // Public base URL of THIS backend API (absolute URLs for OAuth callbacks and
    // public links). Point it at a tunnel (e.g. ngrok) for local development —
    // no URL is ever hardcoded.
    BACKEND_PUBLIC_URL: z.string().url().default("http://localhost:4000"),

    // Public base URL of the storefront (absolute URLs for SEO/payment flows).
    PUBLIC_BASE_URL: z.string().url().default("http://localhost:8090"),

    // ---------------------------------------------------------------------------
    // Customer social sign-in (Google / Facebook) — CUSTOMER accounts only.
    //
    // SECURITY:
    // - Secrets are server-side only. NEVER expose them via VITE_*/NEXT_PUBLIC_*
    //   or send them to the browser.
    // - Optional at boot so the server starts for non-payment
    //   work; the social routes fail fast (503 →
    //   friendly redirect) when the provider credentials are absent, so
    //   development/CI never requires OAuth credentials.
    // - Redirect URIs default to
    //   `${BACKEND_PUBLIC_URL}/api/v1/auth/customer/{provider}/callback` and can
    //   be overridden per provider (they MUST match the provider console values
    //   exactly).
    // ---------------------------------------------------------------------------
    GOOGLE_CLIENT_ID: z.string().trim().default(""),
    GOOGLE_CLIENT_SECRET: z.string().trim().default(""),
    GOOGLE_REDIRECT_URI: z.string().url().optional(),
    FACEBOOK_APP_ID: z.string().trim().default(""),
    FACEBOOK_APP_SECRET: z.string().trim().default(""),
    FACEBOOK_REDIRECT_URI: z.string().url().optional(),
    /** CSRF/state token lifetime for the OAuth round trip (minutes). */
    OAUTH_STATE_TTL_MINUTES: z.coerce.number().int().positive().max(15).default(10),
    /** Outbound OAuth request timeout (token exchange / provider API). */
    OAUTH_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

    // ---------------------------------------------------------------------------
    // Transactional email / SMTP (Phase 19 production hardening).
    //
    // SECURITY:
    // - Credentials are server-side only and are never logged. They are never
    //   exposed through VITE_*/NEXT_PUBLIC_* variables.
    // - DISABLED by default so development/CI never needs a mail server. When it
    //   is disabled the password-reset flow fails LOUDLY (503) instead of
    //   pretending an email was sent: a silently swallowed reset link would leave
    //   the customer locked out behind a false "check your inbox" message.
    // - Production boot refuses a half-configured setup (SMTP_* values present
    //   while SMTP_ENABLED is not "true").
    // ---------------------------------------------------------------------------
    SMTP_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    SMTP_HOST: z.string().trim().default(""),
    SMTP_PORT: z.coerce.number().int().positive().max(65535).default(587),
    /** "true" = implicit TLS (typically port 465); "false" = STARTTLS upgrade. */
    SMTP_SECURE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    SMTP_USER: z.string().trim().default(""),
    SMTP_PASSWORD: z.string().default(""),
    /** From: address for customer email (e.g. "Store <no-reply@example.com>"). */
    SMTP_FROM: z.string().trim().default(""),
    SMTP_REPLY_TO: z.string().trim().default(""),
    /** Connection/greeting/socket timeout for outbound SMTP. */
    SMTP_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

    // Order-expiry sweep scheduler (Phase 18 G18-03). The in-process timer keeps
    // unpaid Pending orders from lingering; the database timestamps remain the
    // authoritative source of truth and the per-order transition is atomic, so
    // multiple instances never double-finalize an order.
    ORDER_EXPIRY_SWEEP_ENABLED: z.enum(["true", "false"]).default("true"),
    ORDER_EXPIRY_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  })
  .superRefine((value, ctx) => {
    // Fonepay conditional validation — FONEPAY_TERMINAL_ID is only enforced
    // when Fonepay is genuinely configured (real gateway credentials present).
    // When Fonepay is disabled or not configured, the terminal id is optional
    // and never validated: the gateway stays unregistered and any Fonepay
    // attempt fails fast with 503 "not_configured" at payment time (see
    // payment.providers.ts / fonepay.config.ts / fonepay.client.ts). Template
    // placeholder values ("your-fonepay-*", e.g. copied from .env.example)
    // count as NOT configured — see fonepayIsDisabled() below. Validation for
    // other providers (e.g. Cybersource) is NOT affected.
    if (fonepayIsDisabled(value)) {
      return; // Fonepay disabled/not configured — terminal id not validated.
    }
    const fonepayCredentialsSet =
      [
        value.FONEPAY_BASE_URL,
        value.FONEPAY_USERNAME,
        value.FONEPAY_PASSWORD,
        value.FONEPAY_PRIVATE_KEY,
      ].filter((part) => part.length > 0).length > 0;
    if (!fonepayCredentialsSet) {
      return; // Fonepay disabled — terminal id not required, not validated.
    }
    if (value.FONEPAY_TERMINAL_ID.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FONEPAY_TERMINAL_ID"],
        message:
          "FONEPAY_TERMINAL_ID is required (1..16 characters) when other Fonepay credentials are configured.",
      });
    } else if (value.FONEPAY_TERMINAL_ID.length > 16) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FONEPAY_TERMINAL_ID"],
        message:
          "FONEPAY_TERMINAL_ID must be at most 16 characters (Fonepay merchant terminal id requirement).",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = parsed.data;

// Fonepay placeholder normalization: when Fonepay is disabled (template
// placeholder values present — see fonepayIsDisabled()), blank out ALL of its
// credential values so downstream checks agree on one state:
//   - the all-or-nothing check below sees an absent set (Fonepay optional),
//   - isFonepayConfigured() (providers/fonepay/fonepay.config.ts) is false, so
//     the provider is never registered with dead credentials,
//   - any Fonepay attempt fails fast with 503 "not_configured".
// No credentials are invented; placeholder text is simply treated as unset.
if (fonepayIsDisabled(env)) {
  env.FONEPAY_BASE_URL = "";
  env.FONEPAY_USERNAME = "";
  env.FONEPAY_PASSWORD = "";
  env.FONEPAY_PRIVATE_KEY = "";
  env.FONEPAY_TERMINAL_ID = "";
}

const DEV_ACCESS_SECRET = "dev-access-secret-change-me-0123456789abcdef";
const DEV_REFRESH_SECRET = "dev-refresh-secret-change-me-fedcba9876543210";
const DEV_CUSTOMER_ACCESS_SECRET = "dev-customer-access-secret-0123456789abcdef";

// ---------------------------------------------------------------------------
// Fonepay all-or-nothing check — enforced in EVERY environment (not just
// production). Fonepay is fully optional: when all FONEPAY_* variables are
// omitted/empty the gateway stays unregistered (payment.providers.ts) and any
// Fonepay attempt fails fast with 503 "not_configured" (fonepay.client.ts).
// But a HALF-set credential set would register nothing yet still look
// intentional, so it refuses to boot instead of failing later at checkout.
// ---------------------------------------------------------------------------
const fonepayParts = [
  env.FONEPAY_BASE_URL,
  env.FONEPAY_USERNAME,
  env.FONEPAY_PASSWORD,
  env.FONEPAY_PRIVATE_KEY,
  env.FONEPAY_TERMINAL_ID,
];
const fonepaySet = fonepayParts.filter((value) => value.length > 0).length;
if (fonepaySet > 0 && fonepaySet < fonepayParts.length) {
  console.error(
    "Fonepay is only partially configured: FONEPAY_BASE_URL, FONEPAY_USERNAME, FONEPAY_PASSWORD, FONEPAY_PRIVATE_KEY and FONEPAY_TERMINAL_ID must be set together (or all omitted).",
  );
  process.exit(1);
}

if (env.NODE_ENV === "production") {
  const problems: string[] = [];
  if (!env.COOKIE_SECURE) {
    problems.push(
      "COOKIE_SECURE must be true in production (refresh cookie would be sent over HTTP).",
    );
  }
  if (env.JWT_ACCESS_SECRET === DEV_ACCESS_SECRET || env.JWT_ACCESS_SECRET.length < 32) {
    problems.push(
      "JWT_ACCESS_SECRET must be a unique secret of at least 32 characters in production.",
    );
  }
  if (env.JWT_REFRESH_SECRET === DEV_REFRESH_SECRET || env.JWT_REFRESH_SECRET.length < 32) {
    problems.push(
      "JWT_REFRESH_SECRET must be a unique secret of at least 32 characters in production.",
    );
  }
  if (
    env.CUSTOMER_JWT_ACCESS_SECRET === DEV_CUSTOMER_ACCESS_SECRET ||
    env.CUSTOMER_JWT_ACCESS_SECRET.length < 32
  ) {
    problems.push(
      "CUSTOMER_JWT_ACCESS_SECRET must be a unique secret of at least 32 characters in production.",
    );
  }
  // Cybersource is all-or-nothing (like Fonepay): a half-configured
  // card provider would fail at checkout time, so refuse to boot.
  const cybersourceParts = [
    env.CYBERSOURCE_MERCHANT_ID,
    env.CYBERSOURCE_KEY_ID,
    env.CYBERSOURCE_SHARED_SECRET,
  ];
  const cybersourceSet = cybersourceParts.filter((value) => value.length > 0).length;
  if (cybersourceSet > 0 && cybersourceSet < cybersourceParts.length) {
    problems.push(
      "Cybersource is only partially configured: CYBERSOURCE_MERCHANT_ID, CYBERSOURCE_KEY_ID and CYBERSOURCE_SHARED_SECRET must be set together (or all omitted).",
    );
  }
  // Unified Checkout REQUIRES https:// target origins in production — an HTTP
  // storefront origin would make Cybersource reject the session (and would
  // put card data on an insecure page).
  const cybersourceOrigins = env.CYBERSOURCE_TARGET_ORIGINS
    ? env.CYBERSOURCE_TARGET_ORIGINS.split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    : env.CLIENT_ORIGIN.split(",")
        .map((o) => o.trim().replace(/\/+$/, ""))
        .filter(Boolean);
  const insecureOrigins = cybersourceOrigins.filter((origin) => !origin.startsWith("https://"));
  if (cybersourceSet > 0 && insecureOrigins.length > 0) {
    problems.push(
      `Cybersource Unified Checkout target origins must be https:// in production (insecure: ${insecureOrigins.join(", ")}). Set CYBERSOURCE_TARGET_ORIGINS or fix CLIENT_ORIGIN.`,
    );
  }
  // -------------------------------------------------------------------------
  // Cybersource environment MUST be explicit in production.
  //
  // CYBERSOURCE_ENVIRONMENT silently defaults to "test", which points the
  // Unified Checkout session API at the SANDBOX host (see cybersource.config.ts).
  // A production deploy that simply forgot the variable would send real customer
  // card payments to the sandbox endpoint with live credentials: every live
  // transaction fails, and nothing at boot signals the mistake. Whenever live
  // Cybersource credentials are configured, production therefore requires the
  // explicit value "production" (a missing value or an explicit "test" is
  // rejected). The check reads process.env directly so "unset" and "test" are
  // distinguishable even though the schema supplies a "test" default.
  // -------------------------------------------------------------------------
  const cybersourceFullyConfigured = cybersourceSet === cybersourceParts.length;
  if (cybersourceFullyConfigured && process.env.CYBERSOURCE_ENVIRONMENT !== "production") {
    problems.push(
      'CYBERSOURCE_ENVIRONMENT must be set explicitly to "production" when Cybersource credentials are configured in production (a missing value or "test" would silently route live card payments to the sandbox host).',
    );
  }

  // -------------------------------------------------------------------------
  // Public URLs must not be localhost in production.
  //
  // CLIENT_ORIGIN is the CORS allow-list: left at its localhost default, every
  // browser request to the real domain is blocked (total API outage) and the
  // Cybersource target origins inherit the same localhost value. The other three
  // are emitted into customer-visible output (canonical/OG URLs, password-reset
  // links, media URLs), so a localhost value would leak a non-public address
  // into production HTML and email.
  // -------------------------------------------------------------------------
  const LOCALHOST_URL = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i;
  const publicUrlVars: ReadonlyArray<readonly [string, string]> = [
    ["CLIENT_ORIGIN", env.CLIENT_ORIGIN],
    ["PUBLIC_BASE_URL", env.PUBLIC_BASE_URL],
    ["BACKEND_PUBLIC_URL", env.BACKEND_PUBLIC_URL],
    ["MEDIA_PUBLIC_URL", env.MEDIA_PUBLIC_URL],
  ];
  for (const [name, value] of publicUrlVars) {
    const offenders = value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => LOCALHOST_URL.test(entry));
    if (offenders.length > 0) {
      problems.push(
        `${name} must not point at localhost in production (found: ${offenders.join(", ")}). Set it to a real public https:// URL.`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Reverse-proxy trust must be specific.
  //
  // "true"/"*" trusts every hop, so any client can forge X-Forwarded-For and
  // defeat every IP-based rate limit. Use "loopback" (cPanel default), a hop
  // count, or an explicit trusted subnet list instead.
  // -------------------------------------------------------------------------
  if (env.TRUST_PROXY === "true" || env.TRUST_PROXY === "*") {
    problems.push(
      'TRUST_PROXY must not be "true" or "*" in production: trusting every hop lets clients spoof X-Forwarded-For and bypass IP rate limiting. Use "loopback", a hop count, or a trusted subnet list.',
    );
  }

  // -------------------------------------------------------------------------
  // SMTP consistency (when enabled).
  //
  // A half-configured mailer would fail at the first password-reset request.
  // SMTP stays optional: when SMTP_ENABLED is not "true" the reset endpoint
  // fails loudly with 503 instead of silently discarding the reset link.
  // -------------------------------------------------------------------------
  if (env.SMTP_ENABLED) {
    const missingSmtp = [
      ["SMTP_HOST", env.SMTP_HOST],
      ["SMTP_FROM", env.SMTP_FROM],
    ]
      .filter(([, value]) => value.length === 0)
      .map(([name]) => name);
    if (missingSmtp.length > 0) {
      problems.push(
        `SMTP_ENABLED=true requires ${missingSmtp.join(" and ")} to be set (otherwise transactional email would fail at send time).`,
      );
    }
  }

  if (problems.length > 0) {
    console.error("Refusing to start in production with insecure configuration:");
    for (const problem of problems) {
      console.error(`  - ${problem}`);
    }
    process.exit(1);
  }
}

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";

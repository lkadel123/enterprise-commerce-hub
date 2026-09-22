import { logger } from "../../../../utils/logger.js";
import { FONEPAY_QR_WAIT_WINDOW_MS } from "./fonepay.config.js";
import type { FonepayWsEnvelope, FonepayWsTransactionStatus } from "./fonepay.types.js";

/**
 * Backend Fonepay WebSocket listener.
 *
 * After an INTENT_QR is generated, Fonepay returns a per-QR `websocketId` URL.
 * The BACKEND connects to it and receives QR-verification / payment messages.
 *
 * SECURITY INVARIANT: a WebSocket message is a NOTIFICATION, never proof of
 * payment. The only action taken on `paymentSuccess: true` is to trigger a
 * server-side Status API verification (thirdPartyDynamicQrGetStatus) through
 * the callback provided by the payment service — which alone can settle the
 * order through the atomic markPaidIfPayable transition. The browser is never
 * in this path.
 *
 * Robustness: malformed JSON, missing/mangled `transactionStatus`, non-boolean
 * `paymentSuccess`, and unknown references are logged and ignored — the process
 * must never crash on provider input. Connection loss is non-fatal: the
 * storefront's bounded status polling is the documented fallback.
 */

/** Minimal structural type for the environment's WebSocket client. */
interface WsLike {
  close(): void;
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
}

type WsConstructor = new (url: string) => WsLike;

/** Resolve the runtime WebSocket constructor (Node ≥22 native WebSocket). */
function getWebSocketConstructor(): WsConstructor | null {
  const ctor = (globalThis as Record<string, unknown>).WebSocket;
  return typeof ctor === "function" ? (ctor as WsConstructor) : null;
}

/** Cap so a burst of pending QRs can never exhaust sockets. */
const MAX_ACTIVE_MONITORS = 500;

interface ActiveMonitor {
  socket: WsLike;
  closeTimer: NodeJS.Timeout;
  notified: boolean;
  closed: boolean;
}

const activeMonitors = new Map<string, ActiveMonitor>();

/** Parse a raw WebSocket frame into the documented envelope shape. */
function parseEnvelope(raw: unknown): FonepayWsEnvelope | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as FonepayWsEnvelope;
    return null;
  } catch {
    return null;
  }
}

/** Parse the STRINGIFIED `transactionStatus` (documented) into an object. */
function parseTransactionStatus(envelope: FonepayWsEnvelope): FonepayWsTransactionStatus | null {
  const raw = envelope.transactionStatus;
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as FonepayWsTransactionStatus;
      return null;
    } catch {
      return null;
    }
  }
  if (raw && typeof raw === "object") return raw as FonepayWsTransactionStatus;
  return null;
}

/**
 * Start listening for the payment notification of one pending Fonepay QR.
 * Fire-and-forget: never throws to the payment flow; failures are logged and
 * the storefront polling fallback remains authoritative-safe.
 */
export function monitorFonepayPayment(options: {
  referenceLabel: string;
  websocketUrl: string;
  /** Triggered (at most once) when the WS reports `paymentSuccess: true`. */
  onPaymentNotification: () => Promise<void>;
}): void {
  const { referenceLabel, websocketUrl, onPaymentNotification } = options;

  if (!/^wss?:\/\//i.test(websocketUrl)) {
    logger.warn(
      { provider: "FONEPAY", referenceLabel },
      "Fonepay websocketId is not a ws(s) URL — skipping listener (polling fallback active)",
    );
    return;
  }
  const Ws = getWebSocketConstructor();
  if (!Ws) {
    logger.warn(
      { provider: "FONEPAY", referenceLabel },
      "No WebSocket runtime available — skipping Fonepay listener (polling fallback active)",
    );
    return;
  }
  if (activeMonitors.size >= MAX_ACTIVE_MONITORS) {
    logger.warn(
      { provider: "FONEPAY", referenceLabel },
      "Fonepay websocket monitor cap reached — skipping listener (polling fallback active)",
    );
    return;
  }
  if (activeMonitors.has(referenceLabel)) {
    return; // one listener per pending reference
  }

  let socket: WsLike;
  try {
    socket = new Ws(websocketUrl);
  } catch (error) {
    logger.warn(
      { provider: "FONEPAY", referenceLabel, errorType: (error as Error)?.name },
      "Fonepay websocket construction failed (polling fallback active)",
    );
    return;
  }

  const monitor: ActiveMonitor = {
    socket,
    closeTimer: setTimeout(() => {
      // The documented flow defines no QR expiry; this is the merchant-side
      // wait window after which the listener stops (storefront polling and a
      // fresh initiation remain the recovery paths).
      closeFonepayMonitor(referenceLabel, "wait_window_elapsed");
    }, FONEPAY_QR_WAIT_WINDOW_MS),
    notified: false,
    closed: false,
  };
  activeMonitors.set(referenceLabel, monitor);

  const cleanup = (reason: string) => {
    if (monitor.closed) return;
    monitor.closed = true;
    clearTimeout(monitor.closeTimer);
    activeMonitors.delete(referenceLabel);
    logger.debug(
      { provider: "FONEPAY", referenceLabel, reason },
      "Fonepay websocket listener closed",
    );
  };

  socket.addEventListener("message", (event) => {
    try {
      const envelope = parseEnvelope(event.data);
      if (!envelope) {
        logger.debug(
          { provider: "FONEPAY", referenceLabel },
          "Fonepay websocket message ignored (unparseable envelope)",
        );
        return;
      }
      const status = parseTransactionStatus(envelope);
      if (!status) {
        logger.debug(
          { provider: "FONEPAY", referenceLabel },
          "Fonepay websocket message ignored (no usable transactionStatus)",
        );
        return;
      }
      // QR-verification messages (scanned, not yet paid) carry QRVerified.
      // Only a POSITIVE payment notification triggers verification — and the
      // verification (Status API) alone can settle the order.
      if (status.paymentSuccess !== true) {
        return;
      }
      if (monitor.notified) {
        logger.debug(
          { provider: "FONEPAY", referenceLabel },
          "Duplicate Fonepay payment notification ignored",
        );
        return;
      }
      monitor.notified = true;
      logger.info(
        { provider: "FONEPAY", referenceLabel },
        "Fonepay websocket payment notification — triggering Status API verification",
      );
      void onPaymentNotification().catch((error) => {
        logger.error(
          { provider: "FONEPAY", referenceLabel, errorType: (error as Error)?.name },
          "Fonepay notification-triggered verification failed (polling will recover)",
        );
      });
    } catch (error) {
      // Absolutely never crash on provider input.
      logger.warn(
        { provider: "FONEPAY", referenceLabel, errorType: (error as Error)?.name },
        "Unexpected error handling Fonepay websocket message",
      );
    }
  });

  socket.addEventListener("close", () => cleanup("socket_closed"));
  socket.addEventListener("error", () => cleanup("socket_error"));
}

/** Close the listener for a reference (e.g. after terminal settlement). */
export function closeFonepayMonitor(referenceLabel: string, reason = "explicit_close"): void {
  const monitor = activeMonitors.get(referenceLabel);
  if (!monitor) return;
  monitor.closed = true;
  clearTimeout(monitor.closeTimer);
  activeMonitors.delete(referenceLabel);
  try {
    monitor.socket.close();
  } catch {
    /* already closed */
  }
  logger.debug(
    { provider: "FONEPAY", referenceLabel, reason },
    "Fonepay websocket listener closed",
  );
}

/** Test helper — close and forget every active listener. */
export function resetFonepayMonitorsForTests(): void {
  for (const referenceLabel of [...activeMonitors.keys()]) {
    closeFonepayMonitor(referenceLabel, "test_reset");
  }
}

/** Test helper — number of currently active listeners. */
export function activeFonepayMonitorCountForTests(): number {
  return activeMonitors.size;
}

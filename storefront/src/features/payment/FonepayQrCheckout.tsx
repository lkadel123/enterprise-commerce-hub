import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  PAYMENT_STATUS_POLL_MS,
  useFonepayQrCheckout,
  type FonepayQrPhase,
} from "@/features/checkout/checkout-hooks";
import type { CustomerPaymentDto } from "@/types";

interface FonepayQrCheckoutProps {
  /** Order to pay via Fonepay QR. */
  orderId: string;
  /** Called after the payment attempt settles (paid / failed / cancelled). */
  onSettled?: () => void;
}

/**
 * Fonepay QR checkout panel.
 *
 * Flow (mirrors the backend Fonepay provider and the documented "Checkout
 * Intent Flow" V1.10):
 *  1. On mount the backend creates (or reuses) an INTENT_QR for the order and
 *     returns a server-rendered PNG data URL (`payment.qrImage`) plus the
 *     Fonepay `qrDisplayName` (store/merchant label). Reuse is deliberate: for
 *     an open reference the backend returns the STORED QR and never calls
 *     Fonepay again, so one order can never own two payable references.
 *  2. The QR is displayed; the customer scans it with a Fonepay-supported
 *     banking app and pays.
 *  3. While the QR is on screen the panel polls the authoritative
 *     `GET /customer/payments/:orderId/status` every
 *     {@link PAYMENT_STATUS_POLL_MS}. Polling never re-initiates, so the QR
 *     stays stable for the whole wait.
 *  4. A terminal state shows success/cancellation and calls `onSettled` once;
 *     `Retry` re-initiates (a genuinely new QR, no new order).
 *
 * SECURITY: the QR image is server-generated and display-only — it contains no
 * secrets, the amount is always the server-side order total, and settlement is
 * NEVER inferred from the QR scan. Only the backend status endpoint (driven by
 * the Fonepay Status API re-check) can mark a payment Paid. No Fonepay
 * credentials ever reach this component.
 */
export function FonepayQrCheckout({ orderId, onSettled }: FonepayQrCheckoutProps) {
  const { status, start, refresh, cancel, isStarting, isCancelling } = useFonepayQrCheckout();

  // `onSettled` is an inline callback on the host page, so its identity changes
  // on every parent render. Holding it in a ref keeps the terminal-state effect
  // independent of that churn — otherwise invalidating the parent's queries
  // would re-fire the effect (and its toast) in a loop.
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);

  // Request the QR on mount. Idempotent on the backend (see above), and the
  // hook flips straight to `paid` when the order already settled.
  useEffect(() => {
    void start(orderId);
  }, [orderId, start]);

  // Poll the authoritative status only while a payable QR is on screen.
  useEffect(() => {
    if (status.phase !== "qr") return;
    const timer = setInterval(() => {
      void refresh(orderId);
    }, PAYMENT_STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [status.phase, orderId, refresh]);

  // Notify once per terminal phase (the ref also survives parent re-renders).
  const notifiedPhase = useRef<FonepayQrPhase | null>(null);
  useEffect(() => {
    const { phase, error } = status;
    if (phase !== "paid" && phase !== "failed" && phase !== "error") {
      notifiedPhase.current = null;
      return;
    }
    if (notifiedPhase.current === phase) return;
    notifiedPhase.current = phase;
    if (phase === "paid") {
      toast.success("Payment confirmed via Fonepay QR.");
    } else if (phase === "failed") {
      toast.error(error ?? "The Fonepay QR payment was cancelled.");
    } else {
      toast.error(error ?? "The Fonepay QR payment could not be started.");
    }
    if (phase === "paid" || phase === "failed") onSettledRef.current?.();
  }, [status]);

  const payment: CustomerPaymentDto | null = status.payment;
  const qrDisplayName = payment?.qrDisplayName ?? "Fonepay QR";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <FonepayIcon phase={status.phase} />
        <div>
          <p className="text-sm font-medium">
            {status.phase === "idle" && "Preparing…"}
            {status.phase === "starting" && "Starting…"}
            {status.phase === "qr" && "Scan the QR below to pay"}
            {status.phase === "paid" && "Payment confirmed"}
            {status.phase === "failed" && "Payment cancelled"}
            {status.phase === "error" && "Payment error"}
          </p>
          {payment && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {qrDisplayName}
              {payment.currency ? ` · ${payment.currency}` : ""}
            </p>
          )}
        </div>
      </div>

      {/* QR image — the core of the Fonepay checkout experience */}
      {status.phase === "qr" ? (
        <div className="overflow-hidden rounded-md border bg-white p-4">
          <p className="mb-3 text-center text-sm font-medium">
            Scan this QR with any Fonepay-supported banking app — we are watching for the payment to
            clear automatically.
          </p>
          {payment?.qrImage ? (
            <img
              src={payment.qrImage}
              alt={`Fonepay QR payment for order ${orderId}`}
              className="mx-auto max-w-[280px] h-auto rounded border"
              width={280}
              height={280}
            />
          ) : (
            <div className="mx-auto max-w-[280px] h-[280px] flex items-center justify-center rounded border bg-muted/50 text-sm text-muted-foreground">
              QR image unavailable
            </div>
          )}
          {payment?.qrDisplayName && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Paying to: {payment.qrDisplayName}
            </p>
          )}
        </div>
      ) : status.phase === "paid" ? (
        <div className="rounded-md border bg-green-50 p-4 text-sm">
          <p className="font-medium text-green-700">Payment confirmed</p>
          <p className="mt-1 text-green-600">
            {payment?.transactionId
              ? `Transaction: ${payment.transactionId}`
              : "Your order is now paid."}
          </p>
        </div>
      ) : status.phase === "failed" ? (
        <div className="rounded-md border bg-muted/50 p-4 text-sm">
          <p className="font-medium text-muted-foreground">Payment cancelled</p>
          <p className="mt-1 text-muted-foreground">
            The QR payment was cancelled. You can retry below.
          </p>
        </div>
      ) : status.phase === "error" ? (
        <div className="rounded-md border bg-destructive/10 p-4 text-sm">
          <p className="font-medium text-destructive">Payment error</p>
          <p className="mt-1 text-destructive">{status.error}</p>
        </div>
      ) : null}

      {/* Non-fatal cancel failure — the attempt is still live server-side, so
          the QR stays payable and stays on screen. */}
      {status.phase === "qr" && status.error ? (
        <p role="alert" className="text-sm text-destructive">
          {status.error}
        </p>
      ) : null}

      {/* Action buttons */}
      {status.phase === "qr" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={() => void cancel(orderId)}
            disabled={isCancelling}
            aria-busy={isCancelling}
          >
            {isCancelling ? "Cancelling…" : "Cancel payment"}
          </Button>
          <p className="text-xs text-muted-foreground">
            The QR stays valid until the order expires. Payment is confirmed automatically — there
            is no need to refresh this page.
          </p>
        </div>
      ) : status.phase === "failed" || status.phase === "error" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            className="min-h-[44px] w-full sm:w-auto"
            onClick={() => void start(orderId)}
            disabled={isStarting}
            aria-busy={isStarting}
          >
            {isStarting ? "Retrying…" : "Retry payment"}
          </Button>
          <p className="text-xs text-muted-foreground sm:ml-3">
            Retrying re-generates a new QR — no new order is created.
          </p>
        </div>
      ) : null}

      {/* Idle / starting placeholder */}
      {status.phase === "idle" || status.phase === "starting" ? (
        <div className="rounded-md border bg-muted/50 p-6 text-sm text-center text-muted-foreground">
          {status.phase === "starting"
            ? "Starting Fonepay QR payment…"
            : "Preparing Fonepay QR payment…"}
        </div>
      ) : null}
    </div>
  );
}

/** Small status icon for the Fonepay QR panel states. */
function FonepayIcon({ phase }: { phase: FonepayQrPhase }) {
  switch (phase) {
    case "paid":
      return (
        <svg
          className="h-5 w-5 shrink-0 text-green-600"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      );
    case "failed":
    case "error":
      return (
        <svg
          className="h-5 w-5 shrink-0 text-destructive"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      );
    default:
      return (
        <svg
          className="h-5 w-5 shrink-0 text-amber-500 animate-spin"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
            clipRule="evenodd"
          />
        </svg>
      );
  }
}

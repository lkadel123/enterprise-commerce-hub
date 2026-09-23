import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api/client";
import { customerPaymentsApi } from "@/lib/api/payments";
import type { CustomerPaymentDto } from "@/types";
import { decodeCaptureContext, isCurrentOriginAllowed } from "./capture-context";

const CONTAINER_ID = "cybersource-payment-selection";
const SCRIPT_ID = "cybersource-unified-checkout-sdk";

/**
 * Shape of the Cybersource-hosted checkout surface (`UnifiedCheckout`
 * instance → `createCheckout()`), as published by the real SDK bundle.
 */
interface UnifiedCheckoutSurface {
  /**
   * Mounts Cybersource's own payment UI into the container and RESOLVES with
   * the Cybersource-signed payment response token once the customer has paid.
   * The SDK completes the payment itself when the capture context carries a
   * complete mandate (our backend requests one), so the resolution value is
   * the response JWT the server verifies.
   */
  mount: (
    containers: string | { paymentSelection?: string; paymentScreen?: string },
  ) => Promise<unknown>;
  /** Present only when auto-processing is disabled (never for our sessions). */
  complete?: (transientToken: string) => Promise<unknown>;
  /** Public SDK events: mounted/ready/…/paymentMethodSelected/error. */
  on?: (event: string, handler: (detail: unknown) => void) => void;
  unmount?: () => void;
  destroy?: () => void;
  isMounted?: () => boolean;
}

/** `window.VAS.UnifiedCheckout` — the SDK's public entry point. */
interface UnifiedCheckoutInstance {
  /** `options.autoProcessing` defaults to the capture context's complete mandate. */
  createCheckout: (options?: { autoProcessing?: boolean }) => Promise<UnifiedCheckoutSurface>;
  on?: (event: string, handler: (detail: unknown) => void) => void;
  destroy?: () => void;
  isDestroyed?: () => boolean;
}

/**
 * `VAS.UnifiedCheckout` is an ASYNC FACTORY (not a constructor): it validates
 * the capture context against Cybersource's key and resolves with the
 * instance. `await`ing it is mandatory — `new` would only yield a Promise.
 */
type UnifiedCheckoutFactory = (captureContext: string) => Promise<UnifiedCheckoutInstance>;

export interface CybersourceCheckoutProps {
  orderId: string;
  /** Called after the payment attempt settles or fails to start. */
  onSettled?: () => void;
}

type Phase = "idle" | "starting" | "embedded" | "verifying" | "paid" | "failed" | "error";

/** Dig the opaque response token out of whatever the SDK resolves with. */
function extractResponseToken(result: unknown): string | null {
  if (typeof result === "string" && result.length > 0) return result;
  if (result !== null && typeof result === "object") {
    for (const key of ["token", "responseToken", "transientToken", "accessToken", "jti"]) {
      const value = (result as Record<string, unknown>)[key];
      if (typeof value === "string" && value.length > 0) return value;
    }
  }
  return null;
}

/**
 * Resolve the Unified Checkout factory exposed by the loaded SDK.
 *
 * The SDK publishes exactly one integration entry point on `window.VAS`:
 * `UnifiedCheckout` (verified against the live bundle served by
 * `testup.cybersource.com/uc/v1/assets/.../UnifiedCheckout.js`).
 */
function resolveSdkFactory(): UnifiedCheckoutFactory | null {
  const w = window as unknown as {
    VAS?: { UnifiedCheckout?: UnifiedCheckoutFactory };
  };
  const factory = w.VAS?.UnifiedCheckout;
  return typeof factory === "function" ? factory : null;
}

/**
 * The SDK requires its mount container to be a real DOM element (it throws
 * MOUNT_CONTAINER_SELECTOR otherwise). React may not have committed the
 * container in the same tick as the state update that reveals it, so wait for
 * it across a bounded number of frames before mounting.
 */
function waitForContainer(id: string, frames = 60): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    let remaining = frames;
    const check = () => {
      const element = document.getElementById(id);
      if (element) {
        resolve(element);
        return;
      }
      remaining -= 1;
      if (remaining <= 0) {
        reject(new Error("The card payment container is not available."));
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

/** Pull a human-readable message out of an SDK error/event payload. */
function sdkErrorMessage(detail: unknown): string | null {
  if (typeof detail === "string" && detail.length > 0) return detail;
  if (detail !== null && typeof detail === "object") {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return null;
}

/** Inject (once) the Cybersource-hosted SDK script and await its load. */
function loadSdkScript(clientLibrary: string, integrity?: string): Promise<void> {
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing && resolveSdkFactory()) return Promise.resolve();
  if (existing) {
    // Another mount (or Strict-Mode remount) is already loading it.
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Unified Checkout SDK failed to load.")),
        { once: true },
      );
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = clientLibrary;
    if (integrity) {
      script.integrity = integrity;
    }
    script.crossOrigin = "anonymous";
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Unified Checkout SDK failed to load.")),
      { once: true },
    );
    document.body.appendChild(script);
  });
}

export function CybersourceCheckout({ orderId, onSettled }: CybersourceCheckoutProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const instanceRef = useRef<UnifiedCheckoutSurface | null>(null);
  const inFlightRef = useRef(false);

  const destroyInstance = useCallback(() => {
    try {
      instanceRef.current?.destroy?.();
    } catch {
      /* the SDK instance is best-effort torn down */
    }
    instanceRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      // React Strict-Mode double-invokes effects; destroying the mounted
      // checkout keeps a stale iframe from lingering over a new attempt.
      destroyInstance();
      inFlightRef.current = false;
    };
  }, [destroyInstance]);

  const startPayment = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setPhase("starting");
    setMessage(null);
    try {
      // 1. Server-created session — body contains ONLY the gateway name.
      const res = await customerPaymentsApi.initiate(orderId, "CYBERSOURCE");
      const payment: CustomerPaymentDto | undefined = res.data?.payment;
      if (!res.data || !payment) {
        setPhase("error");
        setMessage("Unable to start the card payment. Please try again.");
        onSettled?.();
        return;
      }
      if (payment.status === "Paid") {
        setPhase("paid");
        toast.success("This order is already paid.");
        onSettled?.();
        return;
      }
      // 2. Public capture context → SDK URL + SRI (host-allowlisted decoder).
      if (!payment.clientToken) {
        setPhase("error");
        setMessage("The card payment session is missing its checkout context. Please retry.");
        onSettled?.();
        return;
      }
      const session = decodeCaptureContext(payment.clientToken);
      // The capture context declares the origins allowed to embed its payment
      // UI. Fail fast — with an actionable message — when the page origin is
      // not one of them (e.g. a token minted for another deployment), instead
      // of a cryptic SDK mount error later.
      if (!isCurrentOriginAllowed(session)) {
        setPhase("error");
        setMessage(
          "This payment session is not authorized for this site address. Please reload the page or contact support.",
        );
        onSettled?.();
        return;
      }
      await loadSdkScript(session.clientLibrary, session.clientLibraryIntegrity);
      const factory = resolveSdkFactory();
      if (!factory) {
        setPhase("error");
        setMessage("The card payment form could not be initialised. Please retry.");
        onSettled?.();
        return;
      }
      destroyInstance();
      // 3. Mount Cybersource's own iframe; card data never reaches this app.
      //    `window.VAS.UnifiedCheckout` is an async factory (not a constructor):
      //    it validates the capture context and resolves with the instance.
      const checkout = await factory(payment.clientToken);
      const surface = await checkout.createCheckout();
      instanceRef.current = surface;
      setPhase("embedded");

      let result: unknown;
      if (typeof surface.mount === "function") {
        // The SDK requires the container to exist NOW (MOUNT_CONTAINER_SELECTOR
        // otherwise). React may not have committed the container revealed by
        // setPhase("embedded") in the same tick, so wait for it first.
        await waitForContainer(CONTAINER_ID);
        // Unified Checkout 1.x mount contract (verified against the shipped
        // UnifiedCheckout.js bundle): `mount(container)` normalises its argument
        // via `Ur()` into `{ paymentSelection }`, and because no
        // `paymentScreen` is supplied the SDK mounts in SIDEBAR mode — which
        // validates ONLY `containers.paymentSelection` and requires that the
        // selector resolves to a real element. Passing `{ containers: … }` here
        // would nest the object twice and fail the SDK's own validation.
        // `mount()` resolves with the Cybersource-signed payment response token
        // (the complete mandate makes the SDK auto-process the payment), so we
        // never call surface.complete() ourselves.
        result = await surface.mount(`#${CONTAINER_ID}`);
      } else {
        throw new Error("Unified Checkout SDK exposed no mountable payment surface.");
      }

      // 4. Forward the opaque signed token + stored reference for
      //    server-side verification. The client NEVER decides the outcome.
      const responseToken = extractResponseToken(result);
      if (!responseToken) {
        throw new Error("The card payment did not return a signed result token.");
      }
      setPhase("verifying");
      const verified = await customerPaymentsApi.verify(orderId, {
        gateway: "CYBERSOURCE",
        providerTransactionId: payment.providerTransactionId ?? "",
        responseToken,
      });
      const status = verified.data?.payment.status;
      if (status === "Paid") {
        setPhase("paid");
        toast.success("Payment confirmed. Thank you!");
      } else if (status === "Pending" || status === "Initiated") {
        // Pending authentication / issuer review — the authoritative status
        // endpoint keeps polling; the page reflects it.
        setPhase("embedded");
        setMessage("Your payment is being confirmed by the card issuer.");
      } else {
        setPhase("failed");
        setMessage("The card payment was not completed. You can try again.");
      }
      onSettled?.();
    } catch (err) {
      // Retry is always available; a fresh attempt re-creates the session
      // server-side (an expired capture context is never reused).
      destroyInstance();
      setPhase("error");
      setMessage(apiErrorMessage(err));
      onSettled?.();
    } finally {
      inFlightRef.current = false;
    }
  }, [orderId, onSettled, destroyInstance]);

  // Auto-start once, exactly like the other payment panels — the confirmation
  // page is the payment handoff surface.
  useEffect(() => {
    if (phase === "idle") {
      void startPayment();
    }
  }, [phase, startPayment]);

  const busy = phase === "starting" || phase === "verifying";

  return (
    <div>
      {busy ? (
        <p className="text-sm text-muted-foreground" role="status" aria-busy="true">
          {phase === "starting"
            ? "Preparing the secure card form…"
            : "Confirming your payment with the card issuer…"}
        </p>
      ) : null}
      {phase === "paid" ? (
        <p className="text-sm font-medium text-primary" role="status">
          Payment received — your order is confirmed.
        </p>
      ) : null}
      {(phase === "embedded" || busy) && (
        <div
          id={CONTAINER_ID}
          className="mt-2 min-h-[180px] w-full"
          aria-label="Secure card payment form provided by Cybersource"
        />
      )}
      {message ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {message}
        </p>
      ) : null}
      {phase === "idle" || phase === "failed" || phase === "error" ? (
        <Button
          className="min-h-[44px]"
          onClick={() => void startPayment()}
          disabled={busy}
          aria-busy={busy}
        >
          {phase === "idle" ? "Pay by card" : "Retry card payment"}
        </Button>
      ) : null}
    </div>
  );
}

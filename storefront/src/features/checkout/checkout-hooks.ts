import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { addressesApi } from "@/lib/api/addresses";
import { apiErrorMessage } from "@/lib/api/client";
import { couponsApi } from "@/lib/api/coupons";
import { ordersApi } from "@/lib/api/orders";
import { customerPaymentsApi } from "@/lib/api/payments";
import type { CustomerPaymentGatewayValue } from "@/lib/api/payments";
import { useCustomerAuthReady } from "@/lib/auth/CustomerAuthContext";
import type {
  CouponValidateInput,
  CreateCustomerAddressInput,
  CreateCustomerOrderInput,
  CustomerPaymentDto,
  OrderDto,
  UpdateCustomerAddressInput,
} from "@/types";

/**
 * Payment-status poll cadence (ms). Shared by the authoritative
 * `GET /customer/payments/:orderId/status` query and the Fonepay QR panel so a
 * waiting customer is only ever polled at one rate.
 */
export const PAYMENT_STATUS_POLL_MS = 5000;

export const checkoutKeys = {
  addresses: ["customer", "addresses"] as const,
  paymentGateways: ["customer", "payment-gateways"] as const,
  coupon: (code: string) => ["coupon", code] as const,
  order: (orderId: string) => ["order", orderId] as const,
  paymentStatus: (orderId: string) => ["payment-status", orderId] as const,
  ordersList: ["orders", "list"] as const,
};

/* ------------------------------- Addresses ------------------------------- */

export function useAddressesQuery() {
  const enabled = useCustomerAuthReady();
  return useQuery({
    queryKey: checkoutKeys.addresses,
    queryFn: async () => (await addressesApi.list()).data,
    enabled,
  });
}

export function useCreateAddressMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCustomerAddressInput) => addressesApi.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: checkoutKeys.addresses }),
  });
}

export function useUpdateAddressMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCustomerAddressInput }) =>
      addressesApi.update(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: checkoutKeys.addresses }),
  });
}

export function useDeleteAddressMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => addressesApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: checkoutKeys.addresses }),
  });
}

/* -------------------------------- Payments ------------------------------- */

/**
 * Payment options the checkout may offer, as derived by the backend provider
 * registry. Only options reported `available: true` may be selected: a gateway
 * that is disabled or not fully configured (Fonepay by default) is never
 * presented as payable, and enabling it on the server makes it appear here
 * without a storefront deploy.
 */
export function usePaymentGatewaysQuery() {
  const enabled = useCustomerAuthReady();
  return useQuery({
    queryKey: checkoutKeys.paymentGateways,
    queryFn: async () => (await customerPaymentsApi.gateways()).data.gateways,
    enabled,
  });
}

/* -------------------------------- Coupons -------------------------------- */

/**
 * Coupon validation is a mutation-style pre-check (POST, rate-limited) rather
 * than a query — the result is advisory only and must not be cached as truth.
 * The authoritative discount is computed again by the backend at order
 * creation and returned in the `OrderDto`.
 */
export function useValidateCouponMutation() {
  return useMutation({
    mutationFn: (body: CouponValidateInput) => couponsApi.validate(body),
  });
}

/* --------------------------------- Orders -------------------------------- */

export interface PlaceOrderResult {
  order: OrderDto;
}

/**
 * Place an order. The body contains ONLY permitted opaque fields — items are
 * omitted so the server cart is the authoritative line-item source, and the
 * backend clears the cart after success.
 *
 * Phase 17 (G17-03): a fresh opaque idempotency key is generated for every
 * intentional submission and sent as `Idempotency-Key`. Auto-retry is disabled
 * so a single mutation call maps to a single logical submission (the key is
 * never regenerated for an accidental retry, and a user re-submitting later
 * intentionally starts a NEW submission with a NEW key — the correct semantic).
 */
export function usePlaceOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateCustomerOrderInput): Promise<PlaceOrderResult> => {
      const idempotencyKey = crypto.randomUUID();
      const response = await ordersApi.create(body, idempotencyKey);
      // The backend cleared the server cart on success — refresh it and the
      // order history list so they reflect the new order immediately.
      void queryClient.invalidateQueries({ queryKey: ["cart"] });
      void queryClient.invalidateQueries({ queryKey: checkoutKeys.ordersList });
      return { order: response.data };
    },
    retry: 0,
  });
}

/** Ownership-scoped order detail (auth-gated). */
export function useOrderQuery(orderId: string) {
  const enabled = useCustomerAuthReady() && orderId.length > 0;
  return useQuery({
    queryKey: checkoutKeys.order(orderId),
    queryFn: async () => (await ordersApi.getById(orderId)).data,
    enabled,
    retry: false,
  });
}

/* -------------------------------- Payments ------------------------------- */

export function useInitiatePaymentMutation() {
  return useMutation({
    mutationFn: ({ orderId, gateway }: { orderId: string; gateway: CustomerPaymentGatewayValue }) =>
      customerPaymentsApi.initiate(orderId, gateway),
  });
}

/** Cancel a pending payment attempt (Pending/Initiated → Cancelled). */
export function useCancelPaymentMutation() {
  return useMutation({
    mutationFn: ({ orderId }: { orderId: string }) => customerPaymentsApi.cancel(orderId),
  });
}

/**
 * Authoritative payment status. While the payment is in a non-terminal state
 * (Pending / Initiated) it polls every {@link PAYMENT_STATUS_POLL_MS}; terminal
 * states stop polling.
 */
export function usePaymentStatusQuery(orderId: string) {
  const enabled = useCustomerAuthReady() && orderId.length > 0;
  return useQuery({
    queryKey: checkoutKeys.paymentStatus(orderId),
    queryFn: async () => (await customerPaymentsApi.getStatus(orderId)).data.payment,
    enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "Pending" || status === "Initiated" ? PAYMENT_STATUS_POLL_MS : false;
    },
  });
}

/* ------------------------------ Fonepay QR ------------------------------- */

/**
 * UI phase of the Fonepay QR panel. `qr` means a payable QR is on screen; the
 * terminal phases are `paid` / `failed` / `error`.
 */
export type FonepayQrPhase = "idle" | "starting" | "qr" | "paid" | "failed" | "error";

export interface FonepayQrStatus {
  phase: FonepayQrPhase;
  /** Latest server payment snapshot (never client-derived). */
  payment: CustomerPaymentDto | null;
  /** Customer-safe message for `error`, and for a non-fatal cancel failure. */
  error: string | null;
}

export interface FonepayQrCheckout {
  status: FonepayQrStatus;
  /** Initiate (or reuse) the order's Fonepay QR. Safe to call repeatedly. */
  start: (orderId: string) => Promise<void>;
  /** Poll the authoritative status while a QR is on screen. */
  refresh: (orderId: string) => Promise<void>;
  /** Cancel the pending attempt (Pending/Initiated → Cancelled). */
  cancel: (orderId: string) => Promise<void>;
  isStarting: boolean;
  isCancelling: boolean;
}

/**
 * Fonepay QR checkout hook (in-repo panel, see `FonepayQrCheckout`).
 *
 * Correctness contract:
 * - `start` sends ONLY `{ gateway: "FONEPAY" }`. The payable amount is always
 *   the server-side order total and the QR image is server-rendered.
 * - A re-request is inherently safe: for an open Initiated/Pending Fonepay
 *   reference the backend returns the STORED QR envelope and never calls
 *   Fonepay again, so one order can never own two payable references.
 * - Settlement is never inferred here. The panel only mirrors the
 *   authoritative status (the `initiate` response or `GET /status`), which the
 *   backend derives from the Fonepay Status API re-check triggered by its own
 *   WebSocket listener — scanning the QR is not proof of payment.
 *
 * Every callback is referentially stable (it closes over React Query's stable
 * `mutateAsync`) so callers may safely list them in effect dependencies.
 */
export function useFonepayQrCheckout(): FonepayQrCheckout {
  const [status, setStatus] = useState<FonepayQrStatus>({
    phase: "idle",
    payment: null,
    error: null,
  });

  const initiate = useInitiatePaymentMutation();
  const cancelPayment = useCancelPaymentMutation();
  const { mutateAsync: initiateAsync } = initiate;
  const { mutateAsync: cancelAsync } = cancelPayment;

  const start = useCallback(
    async (orderId: string) => {
      setStatus((prev) => ({ ...prev, phase: "starting", error: null }));
      try {
        const result = await initiateAsync({ orderId, gateway: "FONEPAY" });
        const payment = result.data?.payment ?? null;
        if (!payment) {
          setStatus({
            phase: "error",
            payment: null,
            error: "Unable to start the Fonepay QR payment.",
          });
          return;
        }
        // Already settled server-side — there is nothing to scan.
        if (payment.status === "Paid") {
          setStatus({ phase: "paid", payment, error: null });
          return;
        }
        if (!payment.qrImage) {
          setStatus({
            phase: "error",
            payment,
            error: "No QR image was returned by the payment gateway.",
          });
          return;
        }
        setStatus({ phase: "qr", payment, error: null });
      } catch (error) {
        setStatus({ phase: "error", payment: null, error: apiErrorMessage(error) });
      }
    },
    [initiateAsync],
  );

  /**
   * Poll target: the authoritative `GET /status`. Deliberately does NOT
   * re-initiate — the QR already owns the open payable reference, and only
   * `start` may decide that a payable QR exists. It therefore never moves the
   * phase to `qr`; it only advances an on-screen QR to a terminal state (or
   * refreshes its snapshot) and can never resurrect a stale QR.
   */
  const refresh = useCallback(async (orderId: string) => {
    let payment: CustomerPaymentDto | null = null;
    try {
      payment = (await customerPaymentsApi.getStatus(orderId)).data.payment ?? null;
    } catch {
      // A transient poll failure must never tear down the QR on screen; the
      // next tick retries, and terminal phases only come from a success.
      return;
    }
    if (!payment) return;
    setStatus((prev) => {
      if (prev.phase !== "qr") return prev;
      if (payment.status === "Paid") {
        return { phase: "paid", payment, error: null };
      }
      if (
        payment.status === "Failed" ||
        payment.status === "Cancelled" ||
        payment.status === "Expired"
      ) {
        return { phase: "failed", payment, error: null };
      }
      // Still Initiated/Pending — keep the QR up and refresh the snapshot.
      return { ...prev, payment };
    });
  }, []);

  const cancel = useCallback(
    async (orderId: string) => {
      try {
        const result = await cancelAsync({ orderId });
        setStatus((prev) => ({
          ...prev,
          phase: "failed",
          payment: result.data?.payment ?? prev.payment,
          error: null,
        }));
      } catch (error) {
        // The attempt is still live server-side, so keep the QR payable and
        // surface the failure without dropping the customer's QR.
        setStatus((prev) => ({ ...prev, error: apiErrorMessage(error) }));
      }
    },
    [cancelAsync],
  );

  return {
    status,
    start,
    refresh,
    cancel,
    isStarting: initiate.isPending,
    isCancelling: cancelPayment.isPending,
  };
}

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";

import { API_BASE_URL } from "@/config/env";
import { ok } from "@/test/fixtures/catalog";
import { server } from "@/test/server";
import type { CustomerPaymentDto, PaymentStatus } from "@/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { FonepayQrCheckout } = await import("./FonepayQrCheckout");
const { PAYMENT_STATUS_POLL_MS } = await import("@/features/checkout/checkout-hooks");

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ORDER_ID = "ord-fonepay-1";
const INITIATE_URL = `${API_BASE_URL}/customer/payments/${ORDER_ID}/initiate`;
const STATUS_URL = `${API_BASE_URL}/customer/payments/${ORDER_ID}/status`;
const CANCEL_URL = `${API_BASE_URL}/customer/payments/${ORDER_ID}/cancel`;

const QR_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
const QR_ALT = `Fonepay QR payment for order ${ORDER_ID}`;

function fonepayPayment(
  status: PaymentStatus = "Initiated",
  overrides: Partial<CustomerPaymentDto> = {},
): CustomerPaymentDto {
  return {
    orderId: ORDER_ID,
    gateway: "FONEPAY",
    method: "Bank Transfer",
    status,
    transactionId: null,
    providerTransactionId: "FP-REF-1",
    amount: 54900,
    currency: "NPR",
    initiatedAt: "2026-01-01T00:00:00.000Z",
    paidAt: null,
    failureReason: null,
    paymentUrl: null,
    expiresAt: null,
    qrImage: QR_IMAGE,
    qrDisplayName: "NASB Store",
    ...overrides,
  };
}

function renderPanel(onSettled?: () => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FonepayQrCheckout orderId={ORDER_ID} {...(onSettled ? { onSettled } : {})} />
    </QueryClientProvider>,
  );
}

describe("FonepayQrCheckout", () => {
  it("shows the server-rendered QR and merchant name from a single initiation", async () => {
    let initiateCalls = 0;
    server.use(
      http.post(INITIATE_URL, () => {
        initiateCalls += 1;
        return HttpResponse.json(ok({ payment: fonepayPayment(), duplicate: false }));
      }),
      http.get(STATUS_URL, () => HttpResponse.json(ok({ payment: fonepayPayment() }))),
    );

    renderPanel();

    const image = await screen.findByRole("img", { name: QR_ALT });
    // The QR is rendered exactly as the server produced it — never re-derived.
    expect(image).toHaveAttribute("src", QR_IMAGE);
    // `payment.qrDisplayName` is the merchant/terminal label shown with the QR.
    expect(screen.getByText(/Paying to:/)).toBeInTheDocument();
    expect(screen.getAllByText(/NASB Store/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: /cancel payment/i })).toBeInTheDocument();
    // Exactly one mount request — the QR is never requested twice.
    expect(initiateCalls).toBe(1);
  });

  it("settles an already-paid order immediately without polling", async () => {
    let initiateCalls = 0;
    let statusCalls = 0;
    server.use(
      http.post(INITIATE_URL, () => {
        initiateCalls += 1;
        return HttpResponse.json(
          ok({
            payment: fonepayPayment("Paid", {
              qrImage: null,
              transactionId: "TXN-1",
              paidAt: "2026-01-01T00:05:00.000Z",
            }),
            duplicate: true,
          }),
        );
      }),
      http.get(STATUS_URL, () => {
        statusCalls += 1;
        return HttpResponse.json(ok({ payment: fonepayPayment() }));
      }),
    );

    const onSettled = vi.fn();
    renderPanel(onSettled);

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Transaction: TXN-1")).toBeInTheDocument();
    // Nothing to scan, so no QR and no status polling at all.
    expect(screen.queryByRole("img", { name: QR_ALT })).not.toBeInTheDocument();
    expect(initiateCalls).toBe(1);
    expect(statusCalls).toBe(0);
  });

  it("polls the authoritative status without re-initiating, then settles on Paid", async () => {
    let initiateCalls = 0;
    let statusCalls = 0;
    server.use(
      http.post(INITIATE_URL, () => {
        initiateCalls += 1;
        return HttpResponse.json(ok({ payment: fonepayPayment(), duplicate: false }));
      }),
      http.get(STATUS_URL, () => {
        statusCalls += 1;
        return HttpResponse.json(
          ok({
            payment: fonepayPayment("Paid", {
              transactionId: "TXN-42",
              paidAt: "2026-01-01T00:05:00.000Z",
            }),
          }),
        );
      }),
    );

    const onSettled = vi.fn();
    renderPanel(onSettled);

    // Mount request resolves well inside the first poll interval.
    await screen.findByRole("img", { name: QR_ALT });
    expect(initiateCalls).toBe(1);
    expect(statusCalls).toBe(0);

    // The panel then reads the authoritative status on the shared poll
    // cadence — and never re-initiates while a QR is on screen. (Real timers
    // are used deliberately: RTL's `waitFor` cannot drive vitest fake timers.)
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1), {
      timeout: PAYMENT_STATUS_POLL_MS + 5_000,
    });
    expect(statusCalls).toBeGreaterThanOrEqual(1);
    // The wait only READ status: the QR's payable reference is untouched.
    expect(initiateCalls).toBe(1);
    expect(screen.getByText("Transaction: TXN-42")).toBeInTheDocument();
  });

  it("cancels the pending attempt, then re-initiates the same order on retry", async () => {
    let initiateCalls = 0;
    server.use(
      http.post(INITIATE_URL, () => {
        initiateCalls += 1;
        return HttpResponse.json(ok({ payment: fonepayPayment(), duplicate: false }));
      }),
      http.get(STATUS_URL, () => HttpResponse.json(ok({ payment: fonepayPayment() }))),
      http.post(CANCEL_URL, () =>
        HttpResponse.json(ok({ payment: fonepayPayment("Cancelled"), duplicate: false })),
      ),
    );

    const onSettled = vi.fn();
    renderPanel(onSettled);
    await screen.findByRole("img", { name: QR_ALT });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /cancel payment/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/the qr payment was cancelled\. you can retry below/i),
      ).toBeInTheDocument(),
    );
    expect(onSettled).toHaveBeenCalledTimes(1);

    // Retry re-initiates the SAME order — a new order is never created.
    await user.click(screen.getByRole("button", { name: /retry payment/i }));
    await waitFor(() => expect(initiateCalls).toBe(2));
    expect(await screen.findByRole("img", { name: QR_ALT })).toBeInTheDocument();
  });

  it("surfaces an error state when the gateway returns no QR image", async () => {
    server.use(
      http.post(INITIATE_URL, () =>
        HttpResponse.json(
          ok({ payment: fonepayPayment("Initiated", { qrImage: null }), duplicate: false }),
        ),
      ),
      http.get(STATUS_URL, () => HttpResponse.json(ok({ payment: fonepayPayment() }))),
    );

    renderPanel();

    await waitFor(() =>
      expect(
        screen.getByText(/no qr image was returned by the payment gateway/i),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("img", { name: QR_ALT })).not.toBeInTheDocument();
    // An unstartable QR offers a retry rather than a dead end.
    expect(screen.getByRole("button", { name: /retry payment/i })).toBeInTheDocument();
  });
});

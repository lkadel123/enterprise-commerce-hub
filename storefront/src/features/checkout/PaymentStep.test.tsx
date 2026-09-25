/**
 * PaymentStep server-driven availability tests.
 *
 * The checkout offers ONLY the payment options the backend reports as available
 * (`GET /customer/payments/gateways`). A gateway that is disabled or not fully
 * configured — Fonepay by default — must never be presented as payable, a
 * gateway the backend enables appears without any client change, and a
 * selection the backend stops reporting as available is cleared instead of
 * being carried into an order that could never settle.
 */
import { useState } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";

import { API_BASE_URL } from "@/config/env";
import { authState, resetAuthState } from "@/test/handlers/auth";
import { resetCommerceState, setPaymentGatewaysForTests } from "@/test/handlers/commerce";
import { fail } from "@/test/fixtures/catalog";
import { server } from "@/test/server";
import { CustomerAuthProvider } from "@/lib/auth/CustomerAuthContext";
import type { CustomerPaymentGatewayOption } from "@/types";
import type { PaymentChoice } from "./checkout-validation";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { PaymentStep } = await import("./PaymentStep");

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  resetAuthState();
  resetCommerceState();
  // Authenticate the session so the gateways query is enabled.
  authState.refreshValid = true;
});

/** The full option catalog with Fonepay switched to `available`. */
function withFonepay(available: boolean): CustomerPaymentGatewayOption[] {
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
      available,
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

function renderStep({
  choice = null,
  onChoiceChange = vi.fn(),
}: {
  choice?: PaymentChoice | null;
  onChoiceChange?: (choice: PaymentChoice | null) => void;
} = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CustomerAuthProvider>
        <PaymentStep
          choice={choice}
          couponCode={null}
          cartItems={[]}
          onChoiceChange={onChoiceChange}
          onCouponChange={vi.fn()}
          onContinue={vi.fn()}
          onBack={vi.fn()}
        />
      </CustomerAuthProvider>
    </QueryClientProvider>,
  );
  return { onChoiceChange };
}

/** Harness owning the selection state, so "continue" gating can be asserted. */
function renderStepWithState(onChoiceChange?: (choice: PaymentChoice | null) => void) {
  function Harness() {
    const [choice, setChoice] = useState<PaymentChoice | null>(null);
    return (
      <PaymentStep
        choice={choice}
        couponCode={null}
        cartItems={[]}
        onChoiceChange={(next) => {
          onChoiceChange?.(next);
          setChoice(next);
        }}
        onCouponChange={vi.fn()}
        onContinue={vi.fn()}
        onBack={vi.fn()}
      />
    );
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CustomerAuthProvider>
        <Harness />
      </CustomerAuthProvider>
    </QueryClientProvider>,
  );
}

describe("PaymentStep server-driven availability", () => {
  it("renders only the options the backend reports as available (Fonepay disabled by default)", async () => {
    renderStep();
    expect(await screen.findByRole("radio", { name: /cash on delivery/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /credit \/ debit card/i })).toBeInTheDocument();
    // Fonepay is disabled in the default deployment: never offered as payable.
    expect(screen.queryByRole("radio", { name: /fonepay/i })).not.toBeInTheDocument();
  });

  it("offers a gateway the backend enables and emits its server-mapped method + gateway", async () => {
    setPaymentGatewaysForTests(withFonepay(true));
    const { onChoiceChange } = renderStep();

    const fonepay = await screen.findByRole("radio", { name: /fonepay qr/i });
    await userEvent.setup().click(fonepay);

    expect(onChoiceChange).toHaveBeenCalledWith({
      method: "Bank Transfer",
      gateway: "FONEPAY",
    });
  });

  it("clears a selection the backend no longer reports as available", async () => {
    setPaymentGatewaysForTests(withFonepay(false));
    const { onChoiceChange } = renderStep({
      choice: { method: "Bank Transfer", gateway: "FONEPAY" },
    });

    await waitFor(() => expect(onChoiceChange).toHaveBeenCalledWith(null));
  });

  it("keeps a selection the backend still reports as available", async () => {
    setPaymentGatewaysForTests(withFonepay(true));
    const { onChoiceChange } = renderStep({
      choice: { method: "Bank Transfer", gateway: "FONEPAY" },
    });

    const fonepay = await screen.findByRole("radio", { name: /fonepay qr/i });
    expect(fonepay).toBeChecked();
    expect(onChoiceChange).not.toHaveBeenCalled();
  });

  it("gates continue on an available selection and unlocks after choosing one", async () => {
    renderStepWithState();
    const reviewOrder = screen.getByRole("button", { name: /review order/i });
    expect(reviewOrder).toBeDisabled();

    await userEvent.setup().click(await screen.findByRole("radio", { name: /cash on delivery/i }));

    await waitFor(() => expect(reviewOrder).toBeEnabled());
  });

  it("surfaces a retry and keeps continue blocked when the catalog cannot be loaded", async () => {
    server.use(
      http.get(`${API_BASE_URL}/customer/payments/gateways`, () =>
        HttpResponse.json(fail("SERVER_ERROR", "boom"), { status: 500 }),
      ),
    );
    renderStep({ choice: { method: "Cash on Delivery" } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to load/i);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /review order/i })).toBeDisabled();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});

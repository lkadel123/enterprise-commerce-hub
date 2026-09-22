import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { OrderAddress, PaymentMethod } from "@/types";

const { ReviewStep } = await import("./ReviewStep");

const ADDRESS: OrderAddress = {
  line1: "12 Thamel Road",
  city: "Kathmandu",
  postalCode: "44600",
  country: "Nepal",
};

const PLACE = /place order|placing order/i;

function renderStep(overrides?: {
  submitting?: boolean;
  couponCode?: string | null;
  choice?: {
    method: "Cash on Delivery" | "Credit Card" | "Bank Transfer";
    gateway?: "FONEPAY" | "CYBERSOURCE";
  };
  onPlaceOrder?: (input: unknown) => void;
}) {
  const onPlaceOrder = overrides?.onPlaceOrder ?? (vi.fn() as (input: unknown) => void);
  render(
    <ReviewStep
      address={ADDRESS}
      choice={overrides?.choice ?? { method: "Cash on Delivery" }}
      couponCode={overrides?.couponCode ?? null}
      submitting={overrides?.submitting ?? false}
      onBack={() => undefined}
      onPlaceOrder={onPlaceOrder}
    />,
  );
  return { onPlaceOrder };
}

describe("ReviewStep", () => {
  it("renders the shipping summary, payment method and optional coupon", () => {
    renderStep({ couponCode: "SAVE10", choice: { method: "Credit Card", gateway: "CYBERSOURCE" } });
    expect(screen.getByText(/12 Thamel Road/i)).toBeInTheDocument();
    expect(screen.getByText(/Credit Card — Card \(Cybersource Unified Checkout\)/i)).toBeInTheDocument();
    expect(screen.getByText(/SAVE10/)).toBeInTheDocument();
    expect(screen.getByText(/final discount confirmed by the store/i)).toBeInTheDocument();
  });

  it("submits only opaque, non-financial order fields", async () => {
    const user = userEvent.setup();
    const onPlaceOrder = vi.fn();
    renderStep({ onPlaceOrder });
    await user.click(screen.getByRole("button", { name: PLACE }));
    await waitFor(() => expect(onPlaceOrder).toHaveBeenCalledTimes(1));
    const input = onPlaceOrder.mock.calls[0]![0] as Record<string, unknown>;
    // Only legitimate server-required fields — never amounts or statuses.
    for (const key of Object.keys(input)) {
      expect(["shippingAddress", "paymentMethod", "couponCode", "notes"]).toContain(key);
    }
    expect(input).toMatchObject({
      shippingAddress: ADDRESS,
      paymentMethod: "Cash on Delivery",
    });
  });

  it("rejects over-long notes and focuses the notes field", async () => {
    const user = userEvent.setup();
    renderStep();
    const notes = screen.getByLabelText(/order notes/i);
    // Bypass maxLength to simulate a tampered/edge input; the schema still guards.
    fireEvent.change(notes, { target: { value: "x".repeat(1001) } });
    await user.click(screen.getByRole("button", { name: PLACE }));
    expect(await screen.findByText(/at most 1000 characters/i)).toBeInTheDocument();
    expect(notes).toHaveFocus();
  });

  it("is a one-shot submission: no double submit while a request is in flight", async () => {
    const user = userEvent.setup();
    const onPlaceOrder = vi.fn();
    render(
      <ReviewStep
        address={ADDRESS}
        choice={{ method: "Cash on Delivery" }}
        couponCode={null}
        submitting
        onBack={() => undefined}
        onPlaceOrder={onPlaceOrder}
      />,
    );
    const button = screen.getByRole("button", { name: PLACE });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onPlaceOrder).not.toHaveBeenCalled();
  });
});

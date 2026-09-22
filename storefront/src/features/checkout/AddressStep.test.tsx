import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { authState, resetAuthState } from "@/test/handlers/auth";
import { resetCommerceState } from "@/test/handlers/commerce";
import { server } from "@/test/server";
import { CustomerAuthProvider } from "@/lib/auth/CustomerAuthContext";
import type { OrderAddress } from "@/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { AddressStep } = await import("./AddressStep");

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderStep(onChange = vi.fn(), onContinue = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CustomerAuthProvider>
        <AddressStep value={null} onChange={onChange} onContinue={onContinue} />
      </CustomerAuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  resetAuthState();
  resetCommerceState();
  // Authenticate the session so address queries are enabled.
  authState.refreshValid = true;
});

const ADDRESS_IDS = [
  "addr-label",
  "addr-line1",
  "addr-line2",
  "addr-city",
  "addr-state",
  "addr-postalCode",
  "addr-country",
];

describe("AddressStep", () => {
  it("renders the shipping address heading and labelled form fields by stable ids", async () => {
    renderStep();
    expect(await screen.findByText("Shipping address")).toBeInTheDocument();
    for (const id of ADDRESS_IDS) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    expect(screen.getByLabelText("Address line 1")).not.toBeNull();
    expect(screen.getByLabelText("City")).not.toBeNull();
    expect(screen.getByLabelText("Postal code")).not.toBeNull();
  });

  it("focuses the first invalid field and announces errors when submitting empty", async () => {
    const onChange = vi.fn();
    const onContinue = vi.fn();
    renderStep(onChange, onContinue);
    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.queryByText(/loading saved addresses/i)).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: /continue to payment/i }));
    await waitFor(() => expect(document.getElementById("addr-line1")).toHaveFocus());
    expect(screen.getByLabelText("Address line 1")).toHaveAttribute("aria-invalid", "true");
    expect(onChange).not.toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("emits a plain OrderAddress (no financial fields) and continues on valid input", async () => {
    const onChange = vi.fn();
    const onContinue = vi.fn();
    renderStep(onChange, onContinue);
    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.queryByText(/loading saved addresses/i)).not.toBeInTheDocument(),
    );

    await user.type(screen.getByLabelText("Address line 1"), "12 Thamel Road");
    await user.type(screen.getByLabelText("City"), "Kathmandu");
    await user.type(screen.getByLabelText("Postal code"), "44600");

    await user.click(screen.getByRole("button", { name: /continue to payment/i }));

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const address = onChange.mock.calls[0]![0]! as OrderAddress;
    expect(address).toMatchObject({
      line1: "12 Thamel Road",
      city: "Kathmandu",
      postalCode: "44600",
      country: "Nepal",
    });
    // An order address carries location data only — never financial values.
    for (const key of Object.keys(address)) {
      expect(["line1", "line2", "city", "state", "postalCode", "country"]).toContain(key);
    }
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

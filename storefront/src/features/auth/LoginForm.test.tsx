import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { resetAuthState } from "@/test/handlers/auth";
import { resetCommerceState } from "@/test/handlers/commerce";
import { server } from "@/test/server";
import { CustomerAuthProvider } from "@/lib/auth/CustomerAuthContext";

// The form uses TanStack Router's Link/Navigate/useNavigate; stub them so the
// test runs without a router tree while still asserting the navigation target.
const navigateMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  // `Navigate` performs an immediate redirect when authenticated.
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate-target">{to}</div>,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

const { LoginForm } = await import("./LoginForm");

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderForm(redirect?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CustomerAuthProvider>
        <LoginForm {...(redirect !== undefined ? { redirect } : {})} />
      </CustomerAuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  navigateMock.mockClear();
  navigateMock.mockResolvedValue(undefined);
  resetAuthState();
  resetCommerceState();
});

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  await screen.findByLabelText("Email");
  if (email) await user.type(screen.getByLabelText("Email"), email);
  if (password) await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("LoginForm", () => {
  it("renders labelled email and password fields", async () => {
    renderForm();
    expect(await screen.findByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("focuses the first invalid field and marks it aria-invalid on empty submit", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByLabelText("Email");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(screen.getByLabelText("Email")).toHaveFocus());
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a friendly API error for bad credentials", async () => {
    renderForm();
    await fillAndSubmit("amelia@test.com", "wrong-password");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/invalid email or password/i);
    // Still on the form — no navigation happened.
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("navigates to /account after a successful login", async () => {
    renderForm();
    await fillAndSubmit("amelia@test.com", "Testpass123!");
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(expect.objectContaining({ to: "/account" })),
    );
  });

  it("honours a safe redirect target after login", async () => {
    renderForm("/account/orders");
    await fillAndSubmit("amelia@test.com", "Testpass123!");
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(expect.objectContaining({ to: "/account/orders" })),
    );
  });

  it("rejects an unsafe redirect target after login", async () => {
    renderForm("//evil.example");
    await fillAndSubmit("amelia@test.com", "Testpass123!");
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(expect.objectContaining({ to: "/account" })),
    );
    // Never navigates off-origin.
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock.mock.calls[0]![0]!.to).not.toMatch(/evil\.example/);
  });
});

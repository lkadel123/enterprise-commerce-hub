import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { http, HttpResponse } from "msw";

import { API_BASE_URL } from "@/config/env";
import { fail, ok, CUSTOMER_PROFILE } from "@/test/fixtures/catalog";
import { resetAuthState } from "@/test/handlers/auth";
import { resetCommerceState } from "@/test/handlers/commerce";
import { server } from "@/test/server";
import { CustomerAuthProvider } from "@/lib/auth/CustomerAuthContext";

const navigateMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate-target">{to}</div>,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

const { RegisterForm } = await import("./RegisterForm");

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderForm(redirect?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CustomerAuthProvider>
        <RegisterForm {...(redirect !== undefined ? { redirect } : {})} />
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

async function submitWith(name: string, email: string, password: string, acceptTerms = true) {
  const user = userEvent.setup();
  await screen.findByLabelText("Full name");
  if (name) await user.type(screen.getByLabelText("Full name"), name);
  if (email) await user.type(screen.getByLabelText("Email"), email);
  if (password) await user.type(screen.getByLabelText("Password"), password);
  // The Terms checkbox starts unchecked — tests opt in explicitly.
  const checkbox = screen.getByRole("checkbox", { name: /terms & conditions/i });
  if (acceptTerms && checkbox.getAttribute("aria-checked") !== "true") {
    await user.click(checkbox);
  }
  await user.click(screen.getByRole("button", { name: /create account/i }));
}

describe("RegisterForm", () => {
  it("validates required fields and focuses the first invalid field", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByLabelText("Full name");
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => expect(screen.getByLabelText("Full name")).toHaveFocus());
    expect(screen.getByLabelText("Full name")).toHaveAttribute("aria-invalid", "true");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("rejects passwords shorter than 8 characters client-side", async () => {
    renderForm();
    await submitWith("Jane Doe", "jane@test.com", "short");
    // Focus lands on the first invalid field — name is valid here, password is not.
    await waitFor(() => expect(screen.getByLabelText("Password")).toHaveFocus());
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("shows a friendly error for duplicate accounts (409)", async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/customer/register`, () =>
        HttpResponse.json(fail("EMAIL_TAKEN", "Email already registered."), { status: 409 }),
      ),
    );
    renderForm();
    await submitWith("Jane Doe", "taken@test.com", "ValidPass123");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/already exists/i);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("registers successfully and navigates to the safe redirect target", async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/customer/register`, () =>
        HttpResponse.json(ok({ customer: CUSTOMER_PROFILE, accessToken: "new-access-token" })),
      ),
    );
    renderForm("/account");
    await submitWith("Jane Doe", "jane@test.com", "ValidPass123");
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(expect.objectContaining({ to: "/account" })),
    );
  });

  it("requires Terms acceptance before submitting (unchecked by default)", async () => {
    renderForm();
    const user = userEvent.setup();
    await screen.findByLabelText("Full name");

    // Checkbox starts unchecked and links to the legal pages.
    const checkbox = screen.getByRole("checkbox", { name: /terms & conditions/i });
    expect(checkbox.getAttribute("aria-checked")).not.toBe("true");
    expect(screen.getByRole("link", { name: /terms & conditions/i })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(screen.getByRole("link", { name: /privacy policy/i })).toHaveAttribute(
      "href",
      "/privacy",
    );

    // Valid fields but Terms NOT accepted → accessible validation, no submit.
    await user.type(screen.getByLabelText("Full name"), "Jane Doe");
    await user.type(screen.getByLabelText("Email"), "jane@test.com");
    await user.type(screen.getByLabelText("Password"), "ValidPass123");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/terms & conditions/i);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("sends acceptedTerms=true and registers after the checkbox is checked", async () => {
    let sentBody: unknown = null;
    server.use(
      http.post(`${API_BASE_URL}/auth/customer/register`, async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(
          ok({ customer: CUSTOMER_PROFILE, accessToken: "new-access-token" }),
        );
      }),
    );
    renderForm("/account");
    await submitWith("Jane Doe", "jane@test.com", "ValidPass123", true);
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(expect.objectContaining({ to: "/account" })),
    );
    expect(sentBody).toMatchObject({ acceptedTerms: true });
  });

  it("ignores unsafe redirect targets after registration", async () => {
    renderForm("/\\evil.example");
    await submitWith("Jane Doe", "jane@test.com", "ValidPass123");
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(expect.objectContaining({ to: "/account" })),
    );
    expect(navigateMock.mock.calls[0]![0]!.to).not.toContain("evil.example");
  });
});

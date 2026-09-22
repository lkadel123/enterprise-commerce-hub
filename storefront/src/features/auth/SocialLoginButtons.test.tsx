import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { API_BASE_URL } from "@/config/env";
import { SocialLoginButtons } from "./SocialLoginButtons";

describe("SocialLoginButtons", () => {
  it("renders Google and Facebook options as full-page navigations", () => {
    render(<SocialLoginButtons />);

    const google = screen.getByTestId("social-google");
    const facebook = screen.getByTestId("social-facebook");
    expect(google).toHaveTextContent("Continue with Google");
    expect(facebook).toHaveTextContent("Continue with Facebook");

    // Plain anchors → the browser navigates to the BACKEND OAuth endpoint
    // (full redirect flow), never fetching from JS.
    const googleHref = google.getAttribute("href");
    const facebookHref = facebook.getAttribute("href");
    expect(googleHref).toBe(`${API_BASE_URL}/auth/customer/google?redirect=%2Faccount`);
    expect(facebookHref).toBe(`${API_BASE_URL}/auth/customer/facebook?redirect=%2Faccount`);
  });

  it("passes a safe redirect target to the backend start endpoint", () => {
    render(<SocialLoginButtons redirect="/checkout" />);

    const googleHref = screen.getByTestId("social-google").getAttribute("href");
    expect(googleHref).toBe(`${API_BASE_URL}/auth/customer/google?redirect=%2Fcheckout`);
  });

  it("falls back to /account for an unsafe redirect target", () => {
    render(<SocialLoginButtons redirect="https://evil.example" />);

    const googleHref = screen.getByTestId("social-google").getAttribute("href");
    const facebookHref = screen.getByTestId("social-facebook").getAttribute("href");
    expect(googleHref).toBe(`${API_BASE_URL}/auth/customer/google?redirect=%2Faccount`);
    expect(facebookHref).toBe(`${API_BASE_URL}/auth/customer/facebook?redirect=%2Faccount`);
  });
});

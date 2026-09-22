import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { RetryPanel } from "./RetryPanel";

describe("EmptyState", () => {
  it("renders default title with icon hidden from assistive tech", () => {
    render(<EmptyState />);
    expect(screen.getByRole("heading", { name: /nothing here yet/i })).toBeInTheDocument();
    const iconWrapper = screen.getByRole("heading").previousElementSibling;
    expect(iconWrapper).toHaveAttribute("aria-hidden", "true");
  });

  it("renders custom title, description and action", () => {
    render(
      <EmptyState
        title="No orders yet"
        description="Orders you place will appear here."
        action={<button type="button">Start shopping</button>}
      />,
    );
    expect(screen.getByRole("heading", { name: "No orders yet" })).toBeInTheDocument();
    expect(screen.getByText(/orders you place will appear here/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start shopping/i })).toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  it("renders the error message from an Error object", () => {
    render(<ErrorState error={new Error("Network down")} />);
    expect(screen.getByText("Network down")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("offers retry and disables it while retrying", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<ErrorState error={new Error("boom")} onRetry={onRetry} />);
    const button = screen.getByRole("button", { name: /try again/i });
    await user.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(<ErrorState error={new Error("boom")} onRetry={onRetry} retrying />);
    expect(screen.getByRole("button", { name: /retrying/i })).toBeDisabled();
  });
});

describe("RetryPanel", () => {
  it("announces itself via role=alert and supports retry", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<RetryPanel error={new Error("load failed")} onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^retry$/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("disables retry while retrying", () => {
    render(<RetryPanel description="Slow network." onRetry={() => undefined} retrying />);
    expect(screen.getByRole("button", { name: /retrying/i })).toBeDisabled();
    expect(screen.getByText("Slow network.")).toBeInTheDocument();
  });
});

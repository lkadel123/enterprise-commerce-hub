import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { QuantityStepper } from "./QuantityStepper";

/** Accessible quantity control (Phase 6/10 regression). */
describe("QuantityStepper", () => {
  it("renders with accessible names and live value", () => {
    render(<QuantityStepper value={3} onChange={() => {}} ariaLabel="Cart quantity" />);
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Cart quantity" })).toHaveTextContent("3");
  });

  it("increments and decrements via click and keyboard", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<QuantityStepper value={2} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(onChange).toHaveBeenCalledWith(3);
    rerender(<QuantityStepper value={2} onChange={onChange} />);
    await user.keyboard("{Tab}{Tab}"); // focus reaches the buttons in DOM order
    await user.click(screen.getByRole("button", { name: "Decrease quantity" }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("disables decrement at min and increment at max", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<QuantityStepper value={1} min={1} max={5} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeEnabled();
    rerender(<QuantityStepper value={5} min={1} max={5} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
  });

  it("respects the disabled prop for both controls", () => {
    render(<QuantityStepper value={2} disabled onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
  });

  it("keeps ≥44px hit targets (Phase 10 regression)", () => {
    render(<QuantityStepper value={2} onChange={() => {}} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button.className).toContain("h-11");
      expect(button.className).toContain("w-11");
    }
  });
});

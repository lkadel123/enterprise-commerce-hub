import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
  /** Accessible name for the value indicator. */
  ariaLabel?: string;
}

/**
 * Accessible increment/decrement quantity control.
 *
 * - Min 1 (decrement disabled at min).
 * - Respects the supplied `max` (e.g. `availableStock`).
 * - ≥44px targets via the shared `Button` icon size.
 * - Live region announces the current value.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 999,
  disabled = false,
  className,
  ariaLabel = "Quantity",
}: QuantityStepperProps) {
  const atMin = value <= min;
  const atMax = value >= max;

  const decrement = () => {
    if (atMin || disabled) return;
    onChange(value - 1);
  };

  const increment = () => {
    if (atMax || disabled) return;
    onChange(value + 1);
  };

  return (
    <div className={cn("inline-flex items-center gap-1 rounded-md border border-input", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11 rounded-md"
        aria-label="Decrease quantity"
        onClick={decrement}
        disabled={disabled || atMin}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </Button>
      <span
        role="status"
        aria-live="polite"
        aria-label={ariaLabel}
        className="w-10 text-center text-sm font-medium tabular-nums"
      >
        {value}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11 rounded-md"
        aria-label="Increase quantity"
        onClick={increment}
        disabled={disabled || atMax}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

import { Check } from "lucide-react";

const STEPS = ["Address", "Payment", "Review"] as const;

interface CheckoutStepperProps {
  current: number;
}

/**
 * Accessible checkout step indicator. The active step is marked with
 * `aria-current="step"` so screen readers announce progress.
 */
export function CheckoutStepper({ current }: CheckoutStepperProps) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Checkout progress">
      {STEPS.map((label, index) => {
        const state = index < current ? "done" : index === current ? "active" : "upcoming";
        return (
          <li
            key={label}
            aria-current={state === "active" ? "step" : undefined}
            className="flex items-center gap-2"
          >
            <span
              aria-hidden="true"
              className={
                state === "done"
                  ? "flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  : state === "active"
                    ? "flex h-7 w-7 items-center justify-center rounded-full border-2 border-primary text-primary"
                    : "flex h-7 w-7 items-center justify-center rounded-full border text-muted-foreground"
              }
            >
              {state === "done" ? <Check className="h-4 w-4" /> : index + 1}
            </span>
            <span
              className={
                state === "upcoming" ? "text-muted-foreground" : "font-medium text-foreground"
              }
            >
              {label}
            </span>
            {index < STEPS.length - 1 ? (
              <span aria-hidden="true" className="mx-1 text-muted-foreground">
                —
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

import * as React from "react";

import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";

export interface IconButtonProps extends ButtonProps {
  /** The icon rendered inside the button. */
  icon: React.ReactNode;
  /** Accessible label (required for icon-only buttons). */
  "aria-label": string;
}

/**
 * Icon-only (or icon-leading) button that delegates all behavior/variants to
 * the shared `Button`. Defaults to the `icon` size. Pure presentation wrapper.
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, icon, size = "icon", variant = "ghost", ...props }, ref) => (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={cn("inline-flex items-center justify-center", className)}
      {...props}
    >
      {icon}
    </Button>
  ),
);
IconButton.displayName = "IconButton";

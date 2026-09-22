import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { Badge, BadgeProps } from "@/components/ui/badge";

/**
 * Status → visual scheme. Covers the catalogue/order/payment vocabulary used
 * across the storefront so callers can pass raw backend status strings.
 */
const statusVariantMap = {
  // positive
  active: "success",
  "in stock": "success",
  instock: "success",
  available: "success",
  paid: "success",
  completed: "success",
  delivered: "success",
  success: "success",
  // attention
  pending: "warning",
  processing: "warning",
  initiated: "warning",
  draft: "warning",
  "out of stock": "destructive",
  outofstock: "destructive",
  cancelled: "destructive",
  canceled: "destructive",
  expired: "destructive",
  failed: "destructive",
  refunded: "destructive",
  archived: "outline",
  inactive: "outline",
} as const;

const statusBadgeVariants = cva("inline-flex", {
  variants: {
    intent: {
      default: "bg-secondary text-secondary-foreground",
      success: "bg-success text-success-foreground",
      warning: "bg-accent/60 text-accent-foreground ring-1 ring-border",
      destructive: "bg-destructive text-destructive-foreground",
      outline: "border border-border text-foreground",
    },
  },
  defaultVariants: {
    intent: "default",
  },
});

export interface StatusBadgeProps extends BadgeProps, VariantProps<typeof statusBadgeVariants> {
  /** Raw status string from the backend. Maps to a visual intent. */
  status?: string;
  /** Explicit intent override (takes precedence over `status` mapping). */
  intent?: (typeof statusVariantMap)[keyof typeof statusVariantMap] | "default";
  children?: React.ReactNode;
}

const resolveIntent = (status?: string, intent?: StatusBadgeProps["intent"]) => {
  if (intent) return intent;
  if (!status) return "default";
  const key = status.toLowerCase().trim();
  return statusVariantMap[key as keyof typeof statusVariantMap] ?? "default";
};

/**
 * Renders a status as a styled Badge. Pass a known `status` string or an
 * explicit `intent`. Pure presentation — no business logic.
 */
export function StatusBadge({ className, status, intent, children, ...props }: StatusBadgeProps) {
  const resolved = resolveIntent(status, intent);
  const label = children ?? status ?? "Unknown";
  return (
    <Badge className={cn(statusBadgeVariants({ intent: resolved }), className)} {...props}>
      {label}
    </Badge>
  );
}

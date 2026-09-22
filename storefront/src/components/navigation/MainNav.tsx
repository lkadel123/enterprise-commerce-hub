import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Heart, ShoppingCart } from "lucide-react";

import { cn } from "@/lib/utils";
import { useCartCount } from "@/lib/cart/CartContext";

export interface MainNavItem {
  label: string;
  to: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export const mainNav: ReadonlyArray<MainNavItem> = [
  { label: "Products", to: "/products" },
  { label: "Categories", to: "/categories" },
  { label: "Brands", to: "/brands" },
  { label: "Wishlist", to: "/wishlist", icon: Heart },
  { label: "Cart", to: "/cart", icon: ShoppingCart },
];

/* Editorial link: uppercase micro-label with an antique-gold underline that
 * draws in on hover and remains visible while active. */
const linkClasses =
  "group relative inline-flex min-h-11 min-w-11 items-center justify-center gap-2 whitespace-nowrap px-3 text-sm font-semibold uppercase tracking-[0.12em] ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

interface NavItemLinkProps {
  item: MainNavItem;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  /** Optional badge rendered beside the label (e.g. cart count). */
  badge?: number;
}

/**
 * A single nav link. Forwarded-ref and props spread keep it composable with
 * Radix `<SheetClose asChild>` so the mobile sheet can close on navigation.
 */
export const NavItemLink = React.forwardRef<HTMLAnchorElement, NavItemLinkProps>(
  ({ item, className, onClick, badge, ...rest }, ref) => {
    const Icon = item.icon;
    return (
      <Link
        to={item.to}
        ref={ref}
        onClick={onClick}
        activeProps={{
          className: cn(linkClasses, "text-ink", className),
          "aria-current": "page",
        }}
        inactiveProps={{ className: cn(linkClasses, "text-muted-text", className) }}
        {...rest}
      >
        {Icon ? <Icon className="h-5 w-5 shrink-0" aria-hidden="true" /> : null}
        <span>{item.label}</span>
        {/* gold underline indicator */}
        <span
          aria-hidden="true"
          className="absolute inset-x-3 bottom-1 h-px origin-left scale-x-0 bg-gold transition-transform duration-300 group-hover:scale-x-100"
        />
        {badge !== undefined && badge > 0 ? (
          <span
            className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-[0.68rem] font-semibold text-white"
            aria-hidden="true"
          >
            {badge}
          </span>
        ) : null}
      </Link>
    );
  },
);
NavItemLink.displayName = "NavItemLink";

export interface MainNavProps {
  orientation?: "horizontal" | "vertical";
  className?: string;
  onNavigate?: () => void;
}

export function MainNav({ orientation = "horizontal", className, onNavigate }: MainNavProps) {
  const cartCount = useCartCount();
  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        orientation === "vertical" ? "flex flex-col items-stretch" : "flex flex-wrap items-center",
        className,
      )}
    >
      {mainNav.map((item) => (
        <NavItemLink
          key={item.to}
          item={item}
          {...(orientation === "vertical" ? { className: "w-full justify-start" } : {})}
          {...(onNavigate ? { onClick: onNavigate } : {})}
          {...(item.to === "/cart" ? { badge: cartCount } : {})}
        />
      ))}
    </nav>
  );
}

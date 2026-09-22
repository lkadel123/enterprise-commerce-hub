import { Menu, LogOut, User } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { mainNav, NavItemLink } from "@/components/navigation/MainNav";
import { useCustomerAuth } from "@/lib/auth/CustomerAuthContext";
import { useCartCount } from "@/lib/cart/CartContext";
import { BRAND } from "@/lib/brand";

/**
 * Mobile-only navigation for NASB.
 *
 * Reuses the Sheet primitive and the `mainNav` definitions from MainNav
 * (single source of truth). Radix Dialog provides the focus trap,
 * Escape-to-close and focus-return-to-trigger behaviour — no custom focus
 * management is implemented.
 *
 * Appends a branded auth section at the bottom of the sheet: guests see
 * "Sign in" and "Create account"; authenticated users see their name and a
 * "Sign out" button.
 */
export function MobileNav() {
  const { customer, isAuthenticated, isLoading, logout } = useCustomerAuth();
  const cartCount = useCartCount();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-11 w-11 md:hidden" aria-label="Menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-3/4 max-w-xs md:hidden">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle className="text-left font-serif text-2xl font-bold tracking-[0.14em] text-ink">
            {BRAND.name}
          </SheetTitle>
          <SheetDescription className="text-left text-[0.62rem] font-semibold uppercase tracking-[0.3em] text-dark-gold">
            Made in Nepal
          </SheetDescription>
        </SheetHeader>
        <nav aria-label="Main navigation" className="flex flex-col gap-1 pt-4">
          {mainNav.map((item) => (
            <SheetClose asChild key={item.to}>
              <NavItemLink
                item={item}
                className="w-full justify-start"
                {...(item.to === "/cart" ? { badge: cartCount } : {})}
              />
            </SheetClose>
          ))}
          <SheetClose asChild>
            <Link
              to="/products"
              className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-[2px] bg-ink px-4 text-sm font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-dark-gold"
            >
              Explore Collection
            </Link>
          </SheetClose>
        </nav>

        {!isLoading && (
          <div className="border-t pt-4">
            {isAuthenticated && customer ? (
              <>
                <SheetClose asChild>
                  <Link
                    to="/account"
                    className="flex min-h-[44px] items-center gap-2 rounded-sm px-3 py-2 text-sm font-semibold text-ink hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <User className="h-4 w-4" />
                    <span>{customer.name}</span>
                  </Link>
                </SheetClose>
                <button
                  type="button"
                  onClick={() => {
                    void logout().then(() => {
                      window.location.href = "/";
                    });
                  }}
                  className="flex min-h-[44px] w-full items-center gap-2 rounded-sm px-3 py-2 text-sm font-semibold text-muted-text hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign out</span>
                </button>
              </>
            ) : (
              <>
                <SheetClose asChild>
                  <Link
                    to="/login"
                    className="flex min-h-[44px] items-center gap-2 rounded-sm px-3 py-2 text-sm font-semibold text-ink hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Sign in
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link
                    to="/register"
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[2px] border border-ink px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-ink hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Create account
                  </Link>
                </SheetClose>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

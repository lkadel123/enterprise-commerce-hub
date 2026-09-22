import { Price } from "@/components/common/Price";
import type { CartDto } from "@/types";

/**
 * Checkout order summary.
 *
 * SECURITY: every amount rendered here comes from the server cart DTO
 * (`CartDto.subtotal` and per-item server prices). No client-side arithmetic
 * is performed and nothing here is ever sent back to the backend — shipping,
 * tax, discount and the grand total are computed only when the order is
 * created server-side.
 */
export function OrderSummary({ cart }: { cart: CartDto }) {
  return (
    <aside aria-label="Order summary" className="rounded-md border p-4" aria-live="polite">
      <h2 className="text-lg font-semibold">Order summary</h2>
      <ul className="mt-3 divide-y">
        {cart.items.map((item) => (
          <li key={item.productId} className="flex items-start justify-between gap-3 py-2">
            <span className="min-w-0 text-sm">
              <span className="line-clamp-2 break-words font-medium">{item.name}</span>
              <span className="text-muted-foreground"> × {item.quantity}</span>
            </span>
            <Price value={item.price} className="shrink-0 text-sm" />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t pt-3">
        <span className="text-sm text-muted-foreground">Subtotal</span>
        <Price value={cart.subtotal} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Shipping, taxes and discounts are calculated by the store when your order is placed. The
        final total is shown on the confirmation page.
      </p>
    </aside>
  );
}

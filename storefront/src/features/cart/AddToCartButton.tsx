import { useCallback, useState } from "react";
import { Check, Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { QuantityStepper } from "./QuantityStepper";
import { useAddToCart } from "./useAddToCart";

export interface AddToCartButtonProps {
  productId: string;
  /** Server-provided available stock (0 → disabled/out-of-stock). */
  availableStock: number;
  disabled?: boolean;
  className?: string;

  withQuantitySelector?: boolean;
}

export function AddToCartButton({
  productId,
  availableStock,
  disabled = false,
  className,
  withQuantitySelector = false,
}: AddToCartButtonProps) {
  const { add, isPending } = useAddToCart();
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const outOfStock = availableStock <= 0;
  const isDisabled = disabled || isPending || outOfStock;

  const handleAdd = useCallback(async () => {
    if (isDisabled) return;
    try {
      await add({ productId, quantity: withQuantitySelector ? quantity : 1 });
      setJustAdded(true);
      window.setTimeout(() => setJustAdded(false), 2000);
      toast.success("Added to cart");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }, [add, isDisabled, productId, quantity, withQuantitySelector]);

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center", className)}>
      {withQuantitySelector ? (
        <QuantityStepper
          value={quantity}
          onChange={setQuantity}
          max={availableStock}
          disabled={disabled || outOfStock}
          ariaLabel="Quantity to add"
        />
      ) : null}

      <Button
        type="button"
        className="h-11 flex-1 sm:flex-none sm:px-6"
        onClick={() => void handleAdd()}
        disabled={isDisabled}
        aria-busy={isPending}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : justAdded ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
        )}
        {outOfStock ? "Out of stock" : isPending ? "Adding…" : justAdded ? "Added" : "Add to cart"}
      </Button>
    </div>
  );
}

import { Link } from "@tanstack/react-router";

import { mediaUrl } from "@/lib/media";
import { leadImage } from "@/lib/catalog-images";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/common/Price";
import { RatingStars } from "@/features/catalog/RatingStars";
import { AddToCartButton } from "@/features/cart/AddToCartButton";
import { WishlistToggle } from "@/features/wishlist/WishlistToggle";
import type { PublicProductDto } from "@/types";

export interface ProductCardProps {
  product: PublicProductDto;
  /** Emphasise the leading card (hero spotlight). */
  featured?: boolean;
}

/**
 * NASB product card — a restrained editorial tile.
 *
 * Navigation: the WHOLE tile (image, name, category, rating, price) is a
 * single semantic TanStack Router link to `/products/<slug>` — every pixel of
 * the tile is a real anchor, so clicking anywhere on the card navigates.
 * There is no stretched-link `::after` pseudo-element and no pointer-events
 * juggling: the anchor itself spans the tile, which is the reliable pattern
 * (a pseudo-element overlay silently stops covering clicks if any ancestor
 * becomes `position: relative` or a variant fails to compile).
 *
 * Accessibility: the add-to-cart and wishlist controls are rendered AFTER the
 * anchor as a sibling row. They are never nested inside the link (no
 * interactive element inside an anchor), so clicking them never triggers a
 * navigation — they keep performing their own actions.
 */
export function ProductCard({ product, featured = false }: ProductCardProps) {
  const image = leadImage(product.images);
  const imageSrc = mediaUrl(image?.url);
  const alt = image?.alt ?? product.name;

  return (
    <Card
      className={cn(
        "group relative overflow-hidden border-border-line bg-card transition-shadow hover:shadow-raised focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        featured && "md:col-span-2",
      )}
    >
      <Link
        to="/products/$slug"
        params={{ slug: product.slug }}
        // The single navigation anchor of the card. `block` + filling the two
        // content blocks (image, then copy) makes the ENTIRE tile clickable.
        // Interactive controls stay OUTSIDE this anchor (sibling row below).
        className="block rounded-xl focus-visible:outline-none"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={alt}
              loading="lazy"
              width={image?.width ?? undefined}
              height={image?.height ?? undefined}
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-[0.2em] text-muted-text">
              No image
            </div>
          )}
          {product.featured ? (
            <Badge
              className="absolute left-3 top-3 rounded-[2px] border border-border-line bg-ivory text-ink"
              variant="secondary"
            >
              Featured
            </Badge>
          ) : null}
        </div>
        <CardContent className="p-5">
          <div className="flex flex-col gap-1.5">
            <p className="font-serif text-lg font-semibold leading-snug text-ink transition-colors group-hover:text-dark-gold">
              {product.name}
            </p>
            <p className="text-sm uppercase tracking-[0.12em] text-muted-text">
              {product.category?.name ?? "Uncategorized"}
            </p>
            {product.reviewsCount > 0 ? (
              <RatingStars value={product.rating} count={product.reviewsCount} />
            ) : null}
            <div className="mt-1 flex items-center justify-between border-t border-border-line pt-3">
              <Price value={product.price} />
              {product.stock <= 0 ? (
                <Badge variant="destructive" className="rounded-[2px]">
                  Out of stock
                </Badge>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Link>

      {/* Interactive controls live OUTSIDE the card link (a sibling row), so
          they never nest inside the anchor and never navigate. The row keeps
          the same padding rhythm as the card content above it. */}
      <div className="mt-2 flex flex-wrap items-center gap-2 px-5 pb-5">
        <AddToCartButton
          productId={product.id}
          availableStock={product.stock}
          disabled={product.stock <= 0}
          className="flex-1"
        />
        <WishlistToggle productId={product.id} />
      </div>
    </Card>
  );
}

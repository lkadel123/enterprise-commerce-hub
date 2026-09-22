import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Price } from "@/components/common/Price";
import { formatNpr } from "@/lib/utils";
import { ProductGallery } from "@/features/catalog/ProductGallery";
import { ReviewsSection, type ReviewsView } from "@/features/catalog/ReviewsSection";
import { RatingStars } from "@/features/catalog/RatingStars";
import { AddToCartButton } from "@/features/cart/AddToCartButton";
import { WishlistToggle } from "@/features/wishlist/WishlistToggle";
import type { PublicProductDto } from "@/types";

/**
 * Product detail layout: responsive two-column (gallery + information) with a
 * full-width approved-reviews section below. All financial values are echoed
 * verbatim from the backend — no client-side pricing.
 */

function StockBadge({ product }: { product: PublicProductDto }) {
  const outOfStock = product.stock <= 0 || product.status === "Out of Stock";
  return outOfStock ? (
    <Badge variant="destructive">Out of stock</Badge>
  ) : (
    <Badge variant="success">In stock</Badge>
  );
}

function VariationsInfo({ product }: { product: PublicProductDto }) {
  const hasVariations = product.variations.some(
    (v) => v.size || v.color || v.sku || v.price != null || v.stock != null,
  );
  if (!hasVariations) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-label">Options & availability</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {product.variations.map((v, i) => (
          <li key={i} className="rounded-md border p-3 text-sm">
            <p className="font-medium text-foreground">
              {[v.size, v.color].filter(Boolean).join(" · ") || `Option ${i + 1}`}
            </p>
            {v.sku ? <p className="text-xs text-muted-foreground">SKU: {v.sku}</p> : null}
            {v.price != null ? (
              <p className="text-xs text-muted-foreground">Price: {formatNpr(v.price)}</p>
            ) : null}
            {v.stock != null ? (
              <p className="text-xs text-muted-foreground">
                {v.stock > 0 ? `${v.stock} in stock` : "Out of stock"}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Purchase maps to the base product. Specifications are shown for information only.
      </p>
    </div>
  );
}
function ShippingInfo({ product }: { product: PublicProductDto }) {
  const s = product.shipping;
  const hasShipping =
    s &&
    (s.weightKg != null ||
      s.shippingClass ||
      s.lengthCm != null ||
      s.widthCm != null ||
      s.heightCm != null);
  if (!hasShipping) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-label">Shipping</h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {s.weightKg != null ? (
          <>
            <dt className="text-muted-foreground">Weight</dt>
            <dd>{s.weightKg} kg</dd>
          </>
        ) : null}
        {s.shippingClass ? (
          <>
            <dt className="text-muted-foreground">Class</dt>
            <dd className="capitalize">{s.shippingClass}</dd>
          </>
        ) : null}
        {s.lengthCm != null || s.widthCm != null || s.heightCm != null ? (
          <>
            <dt className="text-muted-foreground">Dimensions</dt>
            <dd>{[s.lengthCm, s.widthCm, s.heightCm].filter((d) => d != null).join(" × ")} cm</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

export interface ProductDetailProps {
  product: PublicProductDto;
  reviews: ReviewsView;
}

export function ProductDetail({ product, reviews }: ProductDetailProps) {
  const categorySlug = product.category?.slug;
  const brandSlug = product.brand?.slug;

  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-8 lg:grid-cols-2">
        <ProductGallery images={product.images} name={product.name} />

        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-display">{product.name}</h1>
            <div className="mt-2 flex items-center gap-2">
              {product.rating > 0 ? (
                <RatingStars value={product.rating} count={product.reviewsCount} />
              ) : (
                <p className="text-sm text-muted-foreground">No ratings yet</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Price value={product.price} className="text-2xl" />
            <StockBadge product={product} />
          </div>

          <div className="flex flex-col gap-4">
            <AddToCartButton
              productId={product.id}
              availableStock={product.stock}
              disabled={product.stock <= 0 || product.status === "Out of Stock"}
              withQuantitySelector
            />
            <div className="flex items-center gap-3">
              <WishlistToggle productId={product.id} />
              <span className="text-sm text-muted-foreground">Save to wishlist</span>
            </div>
          </div>

          {categorySlug || brandSlug ? (
            <p className="text-sm text-muted-foreground">
              {categorySlug && product.category ? (
                <>
                  <span className="text-foreground">Category:</span>{" "}
                  <Link
                    to="/categories/$slug"
                    params={{ slug: product.category.slug }}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    {product.category.name}
                  </Link>
                </>
              ) : null}
              {brandSlug && product.brand ? (
                <>
                  {categorySlug ? <> · </> : null}
                  <span className="text-foreground">Brand:</span>{" "}
                  <Link
                    to="/brands/$slug"
                    params={{ slug: product.brand.slug }}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    {product.brand.name}
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}

          <Separator />

          {product.description ? (
            <div className="flex flex-col gap-2">
              <h2 className="text-label">Description</h2>
              <p className="text-sm leading-relaxed text-foreground">{product.description}</p>
            </div>
          ) : null}

          <VariationsInfo product={product} />
          <ShippingInfo product={product} />
        </div>
      </div>

      <Separator />

      <section className="flex flex-col gap-4" aria-labelledby="reviews-heading">
        <h2 id="reviews-heading" className="text-label">
          Reviews ({product.reviewsCount})
        </h2>
        <ReviewsSection reviews={reviews} />
      </section>
    </div>
  );
}

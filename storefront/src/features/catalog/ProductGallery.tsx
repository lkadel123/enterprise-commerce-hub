import * as React from "react";

import { mediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import { normalizeProductImages } from "@/lib/catalog-images";
import type { ProductImage } from "@/types";

export interface ProductGalleryProps {
  images: ProductImage[];
  name: string;
}

/**
 * Responsive product image gallery (up to {@link normalizeProductImages}'s
 * four-image cap).
 *
 * A large active image with a thumbnail strip. Active-image state is local
 * component state (no global store, per the architecture). Thumbnails are
 * announced as buttons for screen readers, arrow keys step through the strip,
 * and horizontal swipes change the image on touch devices. The active
 * thumbnail is clearly ringed. Missing images fall back to the existing
 * "No image" placeholder — no broken-image URLs are ever rendered.
 */
export function ProductGallery({ images, name }: ProductGalleryProps) {
  const gallery = normalizeProductImages(images);
  const count = gallery.length;
  const [activeIndex, setActiveIndex] = React.useState(0);

  // Reset the selection whenever a different product's image set arrives
  // (covers direct in-app navigation between products without a remount).
  const imageKey = gallery.map((img) => img.url).join("\u0000");
  React.useEffect(() => {
    setActiveIndex(0);
  }, [imageKey]);

  const active = count === 0 ? 0 : Math.min(Math.max(activeIndex, 0), count - 1);
  const image = gallery[active];
  const src = mediaUrl(image?.url);
  const alt = image?.alt ?? name;

  const previous = () => setActiveIndex((i) => (count <= 1 ? i : (i - 1 + count) % count));
  const next = () => setActiveIndex((i) => (count <= 1 ? i : (i + 1) % count));

  // Lightweight swipe (no dependency): horizontal swipe flips the image.
  const touchStartX = React.useRef<number | null>(null);

  if (count === 0) {
    return (
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          No image
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted"
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const start = touchStartX.current;
          touchStartX.current = null;
          if (start == null || count < 2) return;
          const endX = event.changedTouches[0]?.clientX;
          if (endX == null) return;
          const dx = endX - start;
          if (Math.abs(dx) > 40) {
            if (dx < 0) next();
            else previous();
          }
        }}
      >
        {src ? (
          <img
            src={src}
            alt={alt}
            width={image?.width ?? undefined}
            height={image?.height ?? undefined}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            No image
          </div>
        )}
      </div>
      {count > 1 ? (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Product images"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              previous();
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              next();
            }
          }}
        >
          {gallery.map((img, i) => {
            const thumb = mediaUrl(img.url);
            const isActive = i === active;
            return (
              <button
                key={`${i}-${img.url}`}
                type="button"
                onClick={() => setActiveIndex(i)}
                aria-label={`View image ${i + 1} of ${count}`}
                aria-pressed={isActive}
                className={cn(
                  "h-16 w-16 overflow-hidden rounded-md border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "border-dark-gold ring-2 ring-ring ring-offset-1"
                    : "border-border-line opacity-80 hover:opacity-100",
                )}
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                    img
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

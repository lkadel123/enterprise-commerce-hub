import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingSkeleton } from "@/components/loading/LoadingSkeleton";
import { mediaUrl } from "@/lib/media";
import { useBanners, useCategories, useFeaturedProducts } from "@/features/catalog/catalog-hooks";
import { CategoryCard } from "@/features/catalog/Directory";
import { ProductCard } from "@/features/catalog/ProductCard";

/**
 * NASB home-page sections â€” an editorial composition.
 *
 * The page opens with a powerful hero, then moves through numbered brand
 * statements (Our Story, Craftsmanship, Quality) before the data-driven
 * Collection and category shortcuts. Each data section owns its
 * loading/error/empty state and falls back to editorial copy.
 */

/* ------------------------------- Section shell --------------------------- */

/** Numbered editorial section header: small index Â· eyebrow Â· gold rule. */
function SectionIndex({ index, label }: { index: string; label: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="font-serif text-sm font-semibold tracking-[0.2em] text-dark-gold">
        {index}
      </span>
      <span className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-text">
        {label}
      </span>
      <span className="h-px flex-1 bg-border-line" aria-hidden="true" />
    </div>
  );
}

/* ----------------------------------- Hero -------------------------------- */

export function HomeHero() {
  const banners = useBanners();
  const hero = banners.data?.data?.[0];
  const heroImage = hero?.image ? mediaUrl(hero.image.url) : undefined;

  if (banners.isPending) {
    return (
      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6" aria-label="Hero">
        <LoadingSkeleton className="h-80 w-full rounded-sm" />
      </section>
    );
  }

  const Copy = (
    <div className="relative z-10 max-w-2xl">
      <p className="eyebrow">NASB Â· Made in Nepal</p>
      <h1 className="display-heading mt-6 font-serif text-4xl font-bold uppercase leading-[1.02] text-ink sm:text-6xl lg:text-7xl">
        Crafted with Purpose.
      </h1>
      <div className="mt-6 h-px w-24 bg-gold" aria-hidden="true" />
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-text">
        Quality without compromise. Premium, human-made goods from Nepal â€” built on craftsmanship,
        heritage and an uncompromising standard.
      </p>
      <div className="mt-9 flex flex-wrap items-center gap-4">
        <Button asChild size="lg">
          <Link to="/products">Explore Collection</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link to="/" hash="story">
            Our Story
          </Link>
        </Button>
      </div>
    </div>
  );

  if (heroImage) {
    return (
      <section
        className="relative isolate min-h-[max(70vh,32rem)] w-full overflow-hidden bg-charcoal"
        aria-label="Hero"
      >
        <img
          src={heroImage}
          alt={hero?.image?.alt ?? hero?.title ?? "NASB â€” crafted in Nepal"}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover opacity-90 animate-hero-zoom"
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-ink/85 via-ink/55 to-ink/25"
          aria-hidden="true"
        />
        <div className="relative mx-auto flex min-h-[max(70vh,32rem)] w-full max-w-7xl items-center px-4 py-24 sm:px-6">
          {Copy}
        </div>
      </section>
    );
  }

  return (
    <section className="relative border-b border-border-line bg-ivory" aria-label="Hero">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-20 sm:px-6 lg:py-32">
        <p className="eyebrow">NASB Â· Made in Nepal</p>
        <h1 className="display-heading max-w-4xl font-serif text-4xl font-bold uppercase leading-[1.02] text-ink sm:text-6xl lg:text-7xl">
          Crafted with Purpose.
        </h1>
        <div className="mt-2 h-px w-24 bg-gold" aria-hidden="true" />
        <p className="max-w-xl text-lg leading-relaxed text-muted-text">
          Quality without compromise. Premium, human-made goods from Nepal â€” built on
          craftsmanship, heritage and an uncompromising standard.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button asChild size="lg">
            <Link to="/products">Explore Collection</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/" hash="story">
              Our Story
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- Our Story ------------------------------ */

export function HomeStory() {
  return (
    <section
      id="story"
      className="mx-auto w-full max-w-7xl scroll-mt-28 px-4 py-20 sm:px-6 lg:py-28"
      aria-labelledby="story-heading"
    >
      <SectionIndex index="01" label="Our Story" />
      <div className="mt-12 grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h2
            id="story-heading"
            className="display-heading font-serif text-3xl font-bold leading-tight text-ink sm:text-5xl"
          >
            Four hands, one standard. <span className="italic text-dark-gold">Made in Nepal.</span>
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-text">
            NASB is built by Neupane Aakosh Samik Brothers Pvt. Ltd., from Rasuwa, Bagmati â€” a
            heritage of patient, human-made craftsmanship. Every piece is considered, handled and
            finished by hand before it leaves our hands for yours.
          </p>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-text">
            We do not chase shortcuts. We hold each product to a single, uncompromising standard â€”
            the one we would want for ourselves.
          </p>
          <div className="mt-8">
            <Button asChild variant="outline">
              <Link to="/products">
                See the collection <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
        <div className="lg:col-span-5">
          <div className="relative flex h-full min-h-[16rem] items-end overflow-hidden border border-border-line bg-charcoal p-8">
            <span
              aria-hidden="true"
              className="absolute right-4 top-4 font-serif text-6xl text-gold"
            >
              01
            </span>
            <p className="font-serif text-xl italic leading-snug text-ivory">
              â€œQuality without compromise.â€
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Craftsmanship ---------------------------- */

export function HomeCraft() {
  return (
    <section className="bg-charcoal" aria-labelledby="craft-heading">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:py-28">
        <div className="order-2 lg:order-1 lg:col-span-5">
          <div className="relative flex h-full min-h-[16rem] flex-col justify-between overflow-hidden border border-ivory/15 p-8">
            <span aria-hidden="true" className="font-serif text-6xl text-gold">
              02
            </span>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ivory/50">
              Heritage Â· Handmade Â· Human
            </p>
          </div>
        </div>
        <div className="order-1 lg:order-2 lg:col-span-7">
          <div className="flex items-center gap-4">
            <span className="font-serif text-sm font-semibold tracking-[0.2em] text-gold">02</span>
            <span className="text-sm font-semibold uppercase tracking-[0.22em] text-ivory/60">
              Craftsmanship
            </span>
          </div>
          <h2
            id="craft-heading"
            className="mt-8 font-serif text-3xl font-bold leading-tight text-ivory sm:text-5xl"
          >
            Strong. Elegant. Honest materials, human hands.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ivory/75">
            We believe in material-first design: honest texture, considered detail and restraint.
            Nothing mass-produced, nothing disposable â€” only pieces with a clear maker behind
            them.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-6 border-t border-ivory/15 pt-8 text-ivory">
            <div>
              <p className="font-serif text-3xl font-bold text-gold">100%</p>
              <p className="mt-1 text-sm text-ivory/60">Human-made in Nepal</p>
            </div>
            <div>
              <p className="font-serif text-3xl font-bold text-gold">EST. 2026</p>
              <p className="mt-1 text-sm text-ivory/60">A family standard</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- Quality ------------------------------- */

export function HomeQuality() {
  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:py-28"
      aria-labelledby="quality-heading"
    >
      <SectionIndex index="03" label="Quality" />
      <div className="mt-12 max-w-4xl">
        <h2
          id="quality-heading"
          className="display-heading font-serif text-3xl font-bold leading-tight text-ink sm:text-5xl"
        >
          One standard. <span className="italic text-dark-gold">Uncompromised.</span>
        </h2>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-text">
          Before anything is offered, it is examined, questioned and verified. We accept nothing
          that we would not stand behind ourselves â€” quality is not a feature, it is the contract
          between NASB and its customers.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------ Collection ------------------------------- */

export function HomeFeatured() {
  const featured = useFeaturedProducts(8);
  const items = featured.data?.data ?? [];

  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6"
      aria-labelledby="featured-heading"
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-4">
            <span className="font-serif text-sm font-semibold tracking-[0.2em] text-dark-gold">
              04
            </span>
            <span className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-text">
              The Collection
            </span>
          </div>
          <h2 className="display-heading mt-4 font-serif text-3xl font-bold text-ink sm:text-4xl">
            Featured pieces
          </h2>
        </div>
        <Button variant="ghost" asChild className="hidden sm:inline-flex">
          <Link to="/products">
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
      <div className="mt-8">
        {featured.isPending ? (
          <LoadingSkeleton
            count={4}
            card
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          />
        ) : featured.isError ? (
          <ErrorState
            error={featured.error}
            title="Unable to load featured products"
            onRetry={() => void featured.refetch()}
          />
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-muted-text">
            The collection is being prepared â€” check the full catalog.
          </p>
        ) : (
          <div
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            data-testid="featured-grid"
          >
            {items.map((product) => (
              <ProductCard key={product.id} product={product} featured />
            ))}
          </div>
        )}
      </div>
      <div className="mt-8 sm:hidden">
        <Button variant="outline" asChild className="w-full">
          <Link to="/products">View all</Link>
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------- Categories ------------------------------ */

export function HomeCategories() {
  const categories = useCategories({ pageSize: 8 });
  const items = categories.data?.data ?? [];

  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6"
      aria-labelledby="categories-heading"
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="display-heading font-serif text-3xl font-bold text-ink sm:text-4xl">
            Shop by category
          </h2>
        </div>
        <Button variant="ghost" asChild className="hidden sm:inline-flex">
          <Link to="/categories">
            All categories <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
      <div className="mt-8">
        {categories.isPending ? (
          <LoadingSkeleton
            count={4}
            card
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
          />
        ) : categories.isError ? (
          <ErrorState
            error={categories.error}
            title="Unable to load categories"
            onRetry={() => void categories.refetch()}
          />
        ) : items.length === 0 ? null : (
          <div
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
            data-testid="category-grid"
          >
            {items.map((category) => (
              <CategoryCard key={category.id} category={category} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

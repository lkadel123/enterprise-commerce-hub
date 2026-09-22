import type { ReactNode } from "react";

interface PlaceholderPageProps {
  title: string;
  description: string;
  action?: ReactNode;
}

/**
 * Minimal placeholder page used by Phase 0 stub routes.
 *
 * Each stub resolves a typed `<Link to="...">` target so the application shell
 * is coherent and typechecks cleanly. Every page below is replaced by a real,
 * data-driven implementation in later phases:
 *   - `/products`, `/categories`, `/brands` → Phase 3 (Catalog)
 *   - `/cart`                                 → Phase 4 (Cart)
 */
export function PlaceholderPage({ title, description, action }: PlaceholderPageProps) {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col items-center gap-5 px-4 py-20 text-center sm:py-28 sm:px-6">
      <h1 className="text-display text-balance">{title}</h1>
      <p className="max-w-lg text-muted-foreground">{description}</p>
      {action}
    </section>
  );
}

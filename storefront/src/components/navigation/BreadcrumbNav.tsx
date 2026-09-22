import { Link, useRouterState } from "@tanstack/react-router";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const routeLabels: Readonly<Record<string, string>> = {
  "/products": "Products",
  "/categories": "Categories",
  "/brands": "Brands",
  "/cart": "Cart",
  "/wishlist": "Wishlist",
  "/search": "Search",
  "/login": "Sign in",
  "/register": "Create account",
  "/account": "My account",
};

/** Detail pages share the section crumb (Home / Section / <item>). */
const details: ReadonlyArray<{ prefix: string; label: string; to: string }> = [
  { prefix: "/products/", label: "Products", to: "/products" },
  { prefix: "/categories/", label: "Categories", to: "/categories" },
  { prefix: "/brands/", label: "Brands", to: "/brands" },
];

function humanize(segment: string): string {
  return segment
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function pathToReadableLabel(pathname: string): string {
  const segments = pathname
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(humanize);
  return segments.length > 0 ? segments.join(" / ") : "Page";
}

export function BreadcrumbNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (pathname === "/") return null;

  const HomeCrumb = (
    <BreadcrumbItem>
      <BreadcrumbLink asChild>
        <Link to="/" className="text-sm">
          Home
        </Link>
      </BreadcrumbLink>
    </BreadcrumbItem>
  );

  // Detail pages: Home / Section / <item>
  for (const detail of details) {
    if (pathname.startsWith(detail.prefix)) {
      const rest = pathname.slice(detail.prefix.length).replace(/\/+$/, "");
      return (
        <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6">
          <Breadcrumb>
            <BreadcrumbList>
              {HomeCrumb}
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to={detail.to} className="text-sm">
                    {detail.label}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{rest ? humanize(rest) : detail.label}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      );
    }
  }

  const label = routeLabels[pathname] ?? pathToReadableLabel(pathname);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6">
      <Breadcrumb>
        <BreadcrumbList>
          {HomeCrumb}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{label}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";

import { pageHead } from "@/lib/seo";
import { organizationJsonLd, websiteJsonLd } from "@/lib/structured-data";
import { JsonLd } from "@/lib/JsonLd";
import {
  HomeCategories,
  HomeCraft,
  HomeFeatured,
  HomeHero,
  HomeQuality,
  HomeStory,
} from "@/features/catalog/HomeSections";

export const Route = createFileRoute("/")({
  head: () =>
    pageHead({
      title: "NASB — Quality Without Compromise",
      description:
        "NASB, made in Nepal by Neupane Aakosh Samik Brothers Pvt. Ltd. Quality without compromise — explore the crafted collection.",
      path: "/",
    }),
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Site-level structured data — real site name/origin only. */}
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={websiteJsonLd()} />
      <HomeHero />
      <HomeStory />
      <HomeCraft />
      <HomeQuality />
      <HomeFeatured />
      <HomeCategories />
    </div>
  );
}

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ProductGallery } from "./ProductGallery";
import type { ProductImage } from "@/types";

function img(url: string, alt?: string): ProductImage {
  return { url, ...(alt ? { alt } : {}) } as ProductImage;
}

const FOUR: ProductImage[] = [
  img("/media-files/1.webp", "Front"),
  img("/media-files/2.webp", "Side"),
  img("/media-files/3.webp", "Back"),
  img("/media-files/4.webp", "Detail"),
];

const ONE: ProductImage[] = [img("/media-files/1.webp", "Front")];

function mainImage(): HTMLImageElement {
  // Only the main image carries alt text; thumbnails are alt="" (presentational).
  return screen.getByRole("img") as HTMLImageElement;
}

describe("ProductGallery", () => {
  it("renders a main image and one thumbnail per image (up to four)", () => {
    render(<ProductGallery images={FOUR} name="Aurora" />);
    expect(screen.getAllByRole("button", { name: /view image/i })).toHaveLength(4);
    expect(mainImage()).toHaveAttribute("alt", "Front");
    expect(screen.getByRole("button", { name: "View image 1 of 4" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("clicking a thumbnail changes the main image and marks it active", () => {
    render(<ProductGallery images={FOUR} name="Aurora" />);
    fireEvent.click(screen.getByRole("button", { name: "View image 3 of 4" }));
    expect(mainImage().getAttribute("src")).toContain("/media-files/3.webp");
    expect(screen.getByRole("button", { name: "View image 3 of 4" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "View image 1 of 4" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("renders a single image without a thumbnail strip", () => {
    render(<ProductGallery images={ONE} name="Aurora" />);
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /view image/i })).not.toBeInTheDocument();
    expect(mainImage().getAttribute("src")).toContain("/media-files/1.webp");
  });

  it.each([
    [2, ["/media-files/1.webp", "/media-files/2.webp"]],
    [3, ["/media-files/1.webp", "/media-files/2.webp", "/media-files/3.webp"]],
  ])("renders %i images with matching thumbnails", (count, urls) => {
    const images = urls.map((url, i) => img(url, `Alt ${i + 1}`));
    render(<ProductGallery images={images} name="Aurora" />);
    expect(screen.getAllByRole("button", { name: /view image/i })).toHaveLength(count);
    expect(mainImage().getAttribute("src")).toContain(urls[0]);
  });

  it("shows the placeholder when there are no images", () => {
    render(<ProductGallery images={[]} name="Aurora" />);
    expect(screen.getByText("No image")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view image/i })).not.toBeInTheDocument();
  });

  it("caps at four images even when more are provided", () => {
    const five = [...FOUR, img("/media-files/5.webp", "Extra")];
    render(<ProductGallery images={five} name="Aurora" />);
    expect(screen.getAllByRole("button", { name: /view image/i })).toHaveLength(4);
    expect(mainImage().getAttribute("src")).toContain("/media-files/1.webp");
  });

  it("does not duplicate identical image urls", () => {
    const dupes = [
      img("/media-files/1.webp"),
      img("/media-files/1.webp"),
      img("/media-files/2.webp"),
    ];
    render(<ProductGallery images={dupes} name="Aurora" />);
    expect(screen.getAllByRole("button", { name: /view image/i })).toHaveLength(2);
  });

  it("changes the main image with the left/right arrow keys", () => {
    render(<ProductGallery images={FOUR} name="Aurora" />);
    const first = screen.getByRole("button", { name: "View image 1 of 4" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(mainImage().getAttribute("src")).toContain("/media-files/2.webp");

    const second = screen.getByRole("button", { name: "View image 2 of 4" });
    fireEvent.keyDown(second, { key: "ArrowLeft" });
    expect(mainImage().getAttribute("src")).toContain("/media-files/1.webp");
  });
});

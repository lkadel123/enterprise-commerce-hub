import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ImagePlus, Plus, Trash2, UploadCloud } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AdminApiError } from "@/lib/api/client";
import { brandsApi, categoriesApi, productsApi } from "@/lib/api/catalog";
import { mediaApi } from "@/lib/api/commerce";

export const Route = createFileRoute("/products/new")({
  head: () => ({
    meta: [
      { title: "New Product — Northpeak Commerce Console" },
      {
        name: "description",
        content:
          "Create a product with pricing, inventory, media, variations, shipping and SEO settings.",
      },
      { property: "og:title", content: "New Product — Northpeak Commerce Console" },
      {
        property: "og:description",
        content: "Multi-section product creation form for enterprise catalogs.",
      },
    ],
  }),
  component: NewProduct,
});

type Variation = {
  id: number;
  size: string;
  color: string;
  sku: string;
  price: string;
  stock: string;
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NewProduct() {
  const [images, setImages] = useState<{ url: string; alt?: string }[]>([]);
  const [dragging, setDragging] = useState(false);
  const [variations, setVariations] = useState<Variation[]>([
    { id: 1, size: "", color: "", sku: "", price: "", stock: "" },
  ]);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [brandId, setBrandId] = useState("none");
  const [categoryId, setCategoryId] = useState("none");
  const [shortDescription, setShortDescription] = useState("");
  const [fullDescription, setFullDescription] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [featured, setFeatured] = useState(false);
  const [searchable, setSearchable] = useState(true);
  const [status, setStatus] = useState<"Active" | "Draft">("Draft");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const navigate = useNavigate();
  const brandsQuery = brandsApi.useList({ pageSize: 100 });
  const categoriesQuery = categoriesApi.useList({ pageSize: 100 });
  const brands = brandsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  const uploadFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      mediaApi
        .upload(file)
        .then((r) => {
          setImages((s) => [...s, { url: r.data.url, alt: file.name }]);
        })
        .catch((e: unknown) =>
          toast.error(e instanceof AdminApiError ? e.message : "Upload failed"),
        );
    });
  };

  const buildPayload = (productStatus: "Active" | "Draft") => {
    const parsedPrice = Number(price);
    const parsedCost = Number(cost);
    return {
      name: name.trim(),
      sku: sku.trim(),
      ...(shortDescription.trim() ? { description: shortDescription.trim() } : {}),
      ...(categoryId !== "none" ? { categoryId } : {}),
      ...(brandId !== "none" ? { brandId } : {}),
      price: Number.isFinite(parsedPrice) ? parsedPrice : 0,
      cost: Number.isFinite(parsedCost) ? parsedCost : 0,
      status: productStatus,
      featured,
      searchable,
      ...(images.length > 0 ? { images } : {}),
      ...(variations.some((v) => v.size || v.color || v.sku)
        ? {
            variations: variations
              .filter((v) => v.size || v.color || v.sku)
              .map((v) => ({
                ...(v.size ? { size: v.size } : {}),
                ...(v.color ? { color: v.color } : {}),
                ...(v.sku ? { sku: v.sku } : {}),
                ...(v.price ? { price: Number(v.price) } : {}),
                ...(v.stock ? { stock: Number(v.stock) } : {}),
              })),
          }
        : {}),
    };
  };

  const submit = (productStatus: "Active" | "Draft") => {
    if (!name.trim() || !sku.trim()) {
      toast.error("Product name and SKU are required");
      return;
    }
    setSaving(true);
    productsApi
      .create(buildPayload(productStatus))
      .then(() => {
        toast.success(
          productStatus === "Draft" ? "Draft saved" : "Product published to storefront",
        );
        void navigate({ to: "/products" });
      })
      .catch((e: unknown) =>
        toast.error(e instanceof AdminApiError ? e.message : "Could not save product"),
      )
      .finally(() => setSaving(false));
  };

  return (
    <AppShell>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2 h-8">
        <Link to="/products">
          <ArrowLeft className="h-4 w-4" /> Back to products
        </Link>
      </Button>

      <PageHeader
        title="Create product"
        description={
          dirty
            ? "Unsaved changes — remember to save before leaving."
            : "Add a new item to the catalog."
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={saving}
              onClick={() => submit("Draft")}
            >
              Save draft
            </Button>
            <Button size="sm" className="h-9" disabled={saving} onClick={() => submit("Active")}>
              Publish product
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Section title="Basic information" description="Names, identifiers and descriptions">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Product name">
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="e.g. Vertex Pro Mechanical Keyboard"
                  className="h-9"
                />
              </Field>
              <Field label="SKU">
                <Input
                  value={sku}
                  onChange={(e) => {
                    setSku(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="SKU-2201"
                  className="h-9 num"
                />
              </Field>
              <Field label="Brand">
                <Select value={brandId} onValueChange={setBrandId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No brand</SelectItem>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Category">
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field
                  label="Short description"
                  hint="Displayed in listings and search results (max 160 characters)."
                >
                  <Input
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                    placeholder="Hot-swappable switches, aluminium chassis, USB-C"
                    className="h-9"
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Full description">
                  <Textarea
                    rows={5}
                    value={fullDescription}
                    onChange={(e) => setFullDescription(e.target.value)}
                    placeholder="Describe materials, dimensions, warranty and key selling points."
                  />
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Pricing" description="Retail price, cost and tax handling">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Regular price">
                <Input
                  className="num h-9"
                  value={price}
                  onChange={(e) => {
                    setPrice(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="189.00"
                />
              </Field>
              <Field label="Sale price">
                <Input className="num h-9" placeholder="159.00" />
              </Field>
              <Field label="Cost price">
                <Input
                  className="num h-9"
                  value={cost}
                  onChange={(e) => {
                    setCost(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="102.40"
                />
              </Field>
              <Field label="Tax class">
                <Select>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Standard" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard (7.5%)</SelectItem>
                    <SelectItem value="reduced">Reduced (3%)</SelectItem>
                    <SelectItem value="zero">Zero-rated</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Discount">
                <Input className="num h-9" placeholder="0%" />
              </Field>
              <div className="flex items-end gap-3 pb-1.5">
                <Switch id="taxable" defaultChecked />
                <Label htmlFor="taxable" className="text-xs">
                  Charge tax on this product
                </Label>
              </div>
            </div>
          </Section>

          <Section title="Inventory" description="Stock levels and replenishment rules">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Stock quantity">
                <Input className="num h-9" placeholder="240" />
              </Field>
              <Field label="Low-stock threshold">
                <Input className="num h-9" placeholder="25" />
              </Field>
              <Field label="Warehouse">
                <Select>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rot">Rotterdam DC</SelectItem>
                    <SelectItem value="new">Newark DC</SelectItem>
                    <SelectItem value="sin">Singapore DC</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex items-center gap-3 sm:col-span-3">
                <Switch id="backorder" />
                <Label htmlFor="backorder" className="text-xs">
                  Allow backorders when out of stock
                </Label>
              </div>
            </div>
          </Section>

          <Section title="Product images" description="Drag and drop, reorder, or remove media">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                uploadFiles(e.dataTransfer.files);
              }}
              className={`flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors ${
                dragging ? "border-primary bg-primary/5" : "bg-surface-muted/50"
              }`}
            >
              <UploadCloud className="h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">Drop images here or browse</p>
              <p className="text-xs text-muted-foreground">PNG, JPG or WEBP up to 5 MB each</p>
              <label className="mt-3">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    uploadFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <Button variant="outline" size="sm" className="h-8" asChild>
                  <span>
                    <ImagePlus className="h-4 w-4" /> Select files
                  </span>
                </Button>
              </label>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {images.map((img, i) => (
                <div
                  key={img.url}
                  className="group relative aspect-square overflow-hidden rounded-md border bg-surface-muted"
                >
                  <img src={img.url} alt={img.alt ?? ""} className="h-full w-full object-cover" />
                  {i === 0 && (
                    <span className="absolute top-1.5 left-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                      Thumbnail
                    </span>
                  )}
                  <button
                    onClick={() => setImages((s) => s.filter((x) => x.url !== img.url))}
                    className="absolute top-1.5 right-1.5 rounded bg-surface/90 p-1 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label={`Remove ${img.alt ?? "image"}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          </Section>

          <Section
            title="Variations"
            description="Size, colour, material and custom attributes"
            actions={
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() =>
                  setVariations((v) => [
                    ...v,
                    { id: Date.now(), size: "", color: "", sku: "", price: "", stock: "" },
                  ])
                }
              >
                <Plus className="h-4 w-4" /> Add variation
              </Button>
            }
            bodyClassName="p-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Size</th>
                    <th className="px-4 py-2.5 font-medium">Colour</th>
                    <th className="px-4 py-2.5 font-medium">SKU</th>
                    <th className="px-4 py-2.5 font-medium">Price</th>
                    <th className="px-4 py-2.5 font-medium">Stock</th>
                    <th className="w-12 px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {variations.map((v) => (
                    <tr key={v.id} className="border-t">
                      <td className="px-3 py-2">
                        <Input
                          value={v.size}
                          onChange={(e) =>
                            setVariations((s) =>
                              s.map((x) => (x.id === v.id ? { ...x, size: e.target.value } : x)),
                            )
                          }
                          className="h-8"
                          placeholder="M"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={v.color}
                          onChange={(e) =>
                            setVariations((s) =>
                              s.map((x) => (x.id === v.id ? { ...x, color: e.target.value } : x)),
                            )
                          }
                          className="h-8"
                          placeholder="Graphite"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={v.sku}
                          onChange={(e) =>
                            setVariations((s) =>
                              s.map((x) => (x.id === v.id ? { ...x, sku: e.target.value } : x)),
                            )
                          }
                          className="num h-8"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={v.price}
                          onChange={(e) =>
                            setVariations((s) =>
                              s.map((x) => (x.id === v.id ? { ...x, price: e.target.value } : x)),
                            )
                          }
                          className="num h-8"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={v.stock}
                          onChange={(e) =>
                            setVariations((s) =>
                              s.map((x) => (x.id === v.id ? { ...x, stock: e.target.value } : x)),
                            )
                          }
                          className="num h-8"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setVariations((s) => s.filter((x) => x.id !== v.id))}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Status & visibility">
            <div className="space-y-4">
              <Field label="Status">
                <Select value={status} onValueChange={(v) => setStatus(v as "Active" | "Draft")}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex items-center justify-between">
                <Label htmlFor="featured" className="text-xs">
                  Feature on homepage
                </Label>
                <Switch id="featured" checked={featured} onCheckedChange={setFeatured} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="search" className="text-xs">
                  Include in search index
                </Label>
                <Switch id="search" checked={searchable} onCheckedChange={setSearchable} />
              </div>
            </div>
          </Section>

          <Section title="Shipping">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Weight (kg)">
                <Input className="num h-9" placeholder="1.2" />
              </Field>
              <Field label="Shipping class">
                <Select>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Standard" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="bulky">Bulky</SelectItem>
                    <SelectItem value="fragile">Fragile</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Length (cm)">
                <Input className="num h-9" placeholder="42" />
              </Field>
              <Field label="Width (cm)">
                <Input className="num h-9" placeholder="18" />
              </Field>
              <Field label="Height (cm)">
                <Input className="num h-9" placeholder="6" />
              </Field>
            </div>
          </Section>

          <Section title="SEO">
            <div className="space-y-4">
              <Field label="SEO title">
                <Input className="h-9" placeholder="Vertex Pro Mechanical Keyboard | Northpeak" />
              </Field>
              <Field label="URL slug">
                <Input className="h-9" placeholder="vertex-pro-mechanical-keyboard" />
              </Field>
              <Field label="Meta description" hint="Recommended 150–160 characters.">
                <Textarea
                  rows={3}
                  placeholder="Hot-swappable mechanical keyboard with aluminium chassis…"
                />
              </Field>
              <Field label="Keywords">
                <Input className="h-9" placeholder="keyboard, mechanical, hot-swap" />
              </Field>
            </div>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
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
import { brands, categories } from "@/lib/mock-data";

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

type Variation = { id: number; size: string; color: string; sku: string; price: string; stock: string };

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NewProduct() {
  const [images, setImages] = useState<string[]>(["Primary thumbnail", "Angle 2", "Lifestyle"]);
  const [dragging, setDragging] = useState(false);
  const [variations, setVariations] = useState<Variation[]>([
    { id: 1, size: "M", color: "Graphite", sku: "SKU-2201-M-GR", price: "189.00", stock: "42" },
    { id: 2, size: "L", color: "Sand", sku: "SKU-2201-L-SA", price: "189.00", stock: "18" },
  ]);
  const [name, setName] = useState("");
  const [dirty, setDirty] = useState(false);

  return (
    <AppShell>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2 h-8">
        <Link to="/products"><ArrowLeft className="h-4 w-4" /> Back to products</Link>
      </Button>

      <PageHeader
        title="Create product"
        description={dirty ? "Unsaved changes — remember to save before leaving." : "Add a new item to the catalog."}
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9" onClick={() => { setDirty(false); toast.success("Draft saved"); }}>
              Save draft
            </Button>
            <Button
              size="sm"
              className="h-9"
              onClick={() => {
                if (!name.trim()) {
                  toast.error("Product name is required");
                  return;
                }
                setDirty(false);
                toast.success("Product published to storefront");
              }}
            >
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
                  onChange={(e) => { setName(e.target.value); setDirty(true); }}
                  placeholder="e.g. Vertex Pro Mechanical Keyboard"
                  className="h-9"
                />
              </Field>
              <Field label="SKU">
                <Input placeholder="SKU-2201" className="h-9 num" onChange={() => setDirty(true)} />
              </Field>
              <Field label="Brand">
                <Select><SelectTrigger className="h-9"><SelectValue placeholder="Select brand" /></SelectTrigger>
                  <SelectContent>{brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Category">
                <Select><SelectTrigger className="h-9"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Short description" hint="Displayed in listings and search results (max 160 characters).">
                  <Input placeholder="Hot-swappable switches, aluminium chassis, USB-C" className="h-9" />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Full description">
                  <Textarea rows={5} placeholder="Describe materials, dimensions, warranty and key selling points." />
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Pricing" description="Retail price, cost and tax handling">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Regular price"><Input className="num h-9" placeholder="189.00" /></Field>
              <Field label="Sale price"><Input className="num h-9" placeholder="159.00" /></Field>
              <Field label="Cost price"><Input className="num h-9" placeholder="102.40" /></Field>
              <Field label="Tax class">
                <Select><SelectTrigger className="h-9"><SelectValue placeholder="Standard" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard (7.5%)</SelectItem>
                    <SelectItem value="reduced">Reduced (3%)</SelectItem>
                    <SelectItem value="zero">Zero-rated</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Discount"><Input className="num h-9" placeholder="0%" /></Field>
              <div className="flex items-end gap-3 pb-1.5">
                <Switch id="taxable" defaultChecked />
                <Label htmlFor="taxable" className="text-xs">Charge tax on this product</Label>
              </div>
            </div>
          </Section>

          <Section title="Inventory" description="Stock levels and replenishment rules">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Stock quantity"><Input className="num h-9" placeholder="240" /></Field>
              <Field label="Low-stock threshold"><Input className="num h-9" placeholder="25" /></Field>
              <Field label="Warehouse">
                <Select><SelectTrigger className="h-9"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rot">Rotterdam DC</SelectItem>
                    <SelectItem value="new">Newark DC</SelectItem>
                    <SelectItem value="sin">Singapore DC</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex items-center gap-3 sm:col-span-3">
                <Switch id="backorder" />
                <Label htmlFor="backorder" className="text-xs">Allow backorders when out of stock</Label>
              </div>
            </div>
          </Section>

          <Section title="Product images" description="Drag and drop, reorder, or remove media">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); setImages((s) => [...s, `Upload ${s.length + 1}`]); toast.success("Image added"); }}
              className={`flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors ${
                dragging ? "border-primary bg-primary/5" : "bg-surface-muted/50"
              }`}
            >
              <UploadCloud className="h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">Drop images here or browse</p>
              <p className="text-xs text-muted-foreground">PNG, JPG or WEBP up to 5 MB each</p>
              <Button variant="outline" size="sm" className="mt-3 h-8" onClick={() => setImages((s) => [...s, `Upload ${s.length + 1}`])}>
                <ImagePlus className="h-4 w-4" /> Select files
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {images.map((img, i) => (
                <div key={img} className="group relative aspect-square overflow-hidden rounded-md border bg-surface-muted">
                  <div className="grid h-full place-items-center text-xs text-muted-foreground">{img}</div>
                  {i === 0 && (
                    <span className="absolute top-1.5 left-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                      Thumbnail
                    </span>
                  )}
                  <button
                    onClick={() => setImages((s) => s.filter((x) => x !== img))}
                    className="absolute top-1.5 right-1.5 rounded bg-surface/90 p-1 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label={`Remove ${img}`}
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
                onClick={() => setVariations((v) => [...v, { id: Date.now(), size: "", color: "", sku: "", price: "", stock: "" }])}
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
                      <td className="px-3 py-2"><Input defaultValue={v.size} className="h-8" placeholder="M" /></td>
                      <td className="px-3 py-2"><Input defaultValue={v.color} className="h-8" placeholder="Graphite" /></td>
                      <td className="px-3 py-2"><Input defaultValue={v.sku} className="num h-8" placeholder="SKU-…" /></td>
                      <td className="px-3 py-2"><Input defaultValue={v.price} className="num h-8" placeholder="0.00" /></td>
                      <td className="px-3 py-2"><Input defaultValue={v.stock} className="num h-8" placeholder="0" /></td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setVariations((s) => s.filter((x) => x.id !== v.id))}>
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
                <Select defaultValue="draft">
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex items-center justify-between">
                <Label htmlFor="featured" className="text-xs">Feature on homepage</Label>
                <Switch id="featured" />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="search" className="text-xs">Include in search index</Label>
                <Switch id="search" defaultChecked />
              </div>
            </div>
          </Section>

          <Section title="Shipping">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Weight (kg)"><Input className="num h-9" placeholder="1.2" /></Field>
              <Field label="Shipping class">
                <Select><SelectTrigger className="h-9"><SelectValue placeholder="Standard" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="bulky">Bulky</SelectItem>
                    <SelectItem value="fragile">Fragile</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Length (cm)"><Input className="num h-9" placeholder="42" /></Field>
              <Field label="Width (cm)"><Input className="num h-9" placeholder="18" /></Field>
              <Field label="Height (cm)"><Input className="num h-9" placeholder="6" /></Field>
            </div>
          </Section>

          <Section title="SEO">
            <div className="space-y-4">
              <Field label="SEO title"><Input className="h-9" placeholder="Vertex Pro Mechanical Keyboard | Northpeak" /></Field>
              <Field label="URL slug"><Input className="h-9" placeholder="vertex-pro-mechanical-keyboard" /></Field>
              <Field label="Meta description" hint="Recommended 150–160 characters.">
                <Textarea rows={3} placeholder="Hot-swappable mechanical keyboard with aluminium chassis…" />
              </Field>
              <Field label="Keywords"><Input className="h-9" placeholder="keyboard, mechanical, hot-swap" /></Field>
            </div>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}

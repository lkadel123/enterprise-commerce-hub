import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminApiError } from "@/lib/api/client";
import { bannersQueryApi, mediaQueryApi } from "@/lib/api/commerce";
import type { BannerDto, BannerStatus } from "@/lib/api/types";

export const Route = createFileRoute("/banners")({
  head: () => ({
    meta: [
      { title: "Banners — Northpeak Commerce Console" },
      {
        name: "description",
        content: "Create and schedule promotional banners shown on the storefront.",
      },
      { property: "og:title", content: "Banners — Northpeak" },
      { property: "og:description", content: "Promotional banner management with scheduling." },
    ],
  }),
  component: BannersPage,
});

type BannerFormValues = {
  title: string;
  imageId: string;
  linkUrl: string;
  status: BannerStatus;
  sortOrder: string;
  startAt: string;
  endAt: string;
};

const emptyBannerForm: BannerFormValues = {
  title: "",
  imageId: "",
  linkUrl: "",
  status: "Active",
  sortOrder: "0",
  startAt: "",
  endAt: "",
};

function toDateString(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function buildBannerPayload(v: BannerFormValues) {
  return {
    title: v.title.trim(),
    imageId: v.imageId,
    linkUrl: v.linkUrl.trim() || null,
    status: v.status,
    sortOrder: v.sortOrder === "" ? 0 : Number(v.sortOrder),
    startAt: v.startAt ? new Date(v.startAt).toISOString() : null,
    endAt: v.endAt ? new Date(v.endAt).toISOString() : null,
  };
}

function BannersPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [createValues, setCreateValues] = useState<BannerFormValues>(emptyBannerForm);
  const [editing, setEditing] = useState<BannerDto | null>(null);
  const [editValues, setEditValues] = useState<BannerFormValues>(emptyBannerForm);
  const [deleting, setDeleting] = useState<BannerDto | null>(null);

  const bannersQuery = bannersQueryApi.useList({ pageSize: 100 });
  const createBanner = bannersQueryApi.useCreate();
  const updateBanner = bannersQueryApi.useUpdate();
  const removeBanner = bannersQueryApi.useRemove();

  const rows = bannersQuery.data ?? [];

  const act = (fn: () => Promise<unknown>, success: string) => {
    fn()
      .then(() => toast.success(success))
      .catch((e: unknown) => toast.error(e instanceof AdminApiError ? e.message : "Action failed"));
  };

  const validateBannerForm = (v: BannerFormValues): string | null => {
    if (!v.title.trim()) return "Title is required";
    if (!v.imageId) return "Choose an image for the banner";
    if (v.startAt && v.endAt && new Date(v.endAt).getTime() <= new Date(v.startAt).getTime()) {
      return "End date must be after start date";
    }
    return null;
  };

  const openEdit = (b: BannerDto) => {
    setEditing(b);
    setEditValues({
      title: b.title,
      imageId: b.image.id,
      linkUrl: b.linkUrl ?? "",
      status: b.status,
      sortOrder: String(b.sortOrder),
      startAt: toDateString(b.startAt),
      endAt: toDateString(b.endAt),
    });
  };

  const submitCreate = () => {
    const error = validateBannerForm(createValues);
    if (error) {
      toast.error(error);
      return;
    }
    act(
      () =>
        createBanner.mutateAsync(buildBannerPayload(createValues)).then(() => {
          setCreateOpen(false);
          setCreateValues(emptyBannerForm);
        }),
      "Banner created",
    );
  };

  const submitEdit = () => {
    if (!editing) return;
    const error = validateBannerForm(editValues);
    if (error) {
      toast.error(error);
      return;
    }
    act(
      () =>
        updateBanner
          .mutateAsync({ id: editing.id, ...buildBannerPayload(editValues) })
          .then(() => setEditing(null)),
      "Banner updated",
    );
  };

  const submitDelete = () => {
    if (!deleting) return;
    act(
      () => removeBanner.mutateAsync(deleting.id).then(() => setDeleting(null)),
      "Banner deleted",
    );
  };

  return (
    <AppShell>
      <PageHeader
        title="Banners"
        description="Promotional banners displayed on the storefront, with scheduling and ordering."
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9">
                <Plus className="h-4 w-4" /> New banner
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create banner</DialogTitle>
                <DialogDescription>
                  Choose an image from the media library and set visibility and scheduling.
                </DialogDescription>
              </DialogHeader>
              <BannerFields
                values={createValues}
                onChange={(patch) => setCreateValues((v) => ({ ...v, ...patch }))}
              />
              <DialogFooter>
                <Button size="sm" disabled={createBanner.isPending} onClick={submitCreate}>
                  {createBanner.isPending ? "Creating…" : "Create banner"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Section bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/70 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Banner</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Order</th>
                <th className="px-4 py-2.5 font-medium">Schedule</th>
                <th className="px-4 py-2.5 font-medium">Link</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bannersQuery.isPending ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Loading banners…
                  </td>
                </tr>
              ) : bannersQuery.isError ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-destructive">
                    Couldn't load banners. Check your connection and try again.
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No banners yet. Create your first promotion.
                  </td>
                </tr>
              ) : (
                rows.map((b) => (
                  <tr key={b.id} className="border-t transition-colors hover:bg-surface-muted/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={b.image.url}
                          alt={b.image.alt ?? b.title}
                          className="h-10 w-16 shrink-0 rounded-md border object-cover"
                          loading="lazy"
                        />
                        <p className="min-w-0 max-w-[220px] truncate font-medium">{b.title}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="num px-4 py-3 text-right">{b.sortOrder}</td>
                    <td className="num px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {b.startAt || b.endAt
                        ? `${b.startAt ? new Date(b.startAt).toLocaleDateString() : "—"} → ${b.endAt ? new Date(b.endAt).toLocaleDateString() : "—"}`
                        : "Always on"}
                    </td>
                    <td className="px-4 py-3">
                      {b.linkUrl ? (
                        <a
                          href={b.linkUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="max-w-[200px] truncate text-xs text-primary underline underline-offset-2"
                        >
                          {b.linkUrl}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => openEdit(b)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive"
                        onClick={() => setDeleting(b)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit banner</DialogTitle>
            <DialogDescription>Update the image, visibility and scheduling.</DialogDescription>
          </DialogHeader>
          <BannerFields
            values={editValues}
            onChange={(patch) => setEditValues((v) => ({ ...v, ...patch }))}
          />
          <DialogFooter>
            <Button size="sm" disabled={updateBanner.isPending} onClick={submitEdit}>
              {updateBanner.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete banner</DialogTitle>
            <DialogDescription>
              Delete “{deleting?.title}”? This cannot be undone. The image used by this banner stays
              in the media library.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              size="sm"
              variant="destructive"
              disabled={removeBanner.isPending}
              onClick={submitDelete}
            >
              {removeBanner.isPending ? "Deleting…" : "Delete banner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function MediaPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const mediaQuery = mediaQueryApi.useList({ pageSize: 100 });
  const items = mediaQuery.data ?? [];

  if (mediaQuery.isPending) {
    return <p className="text-xs text-muted-foreground">Loading images…</p>;
  }
  if (mediaQuery.isError) {
    return <p className="text-xs text-destructive">Couldn't load images. Try again.</p>;
  }
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No images available yet — upload some in the Media Library first.
      </p>
    );
  }
  return (
    <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto rounded-md border p-2 sm:grid-cols-4">
      {items.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          title={m.originalName}
          className={`overflow-hidden rounded-md border-2 transition-colors ${
            value === m.id ? "border-primary" : "border-transparent hover:border-border"
          }`}
        >
          <img
            src={m.url}
            alt={m.alt ?? m.originalName}
            className="aspect-square w-full object-cover"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  );
}

function BannerFields({
  values,
  onChange,
}: {
  values: BannerFormValues;
  onChange: (patch: Partial<BannerFormValues>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Title</Label>
          <Input
            className="h-9"
            value={values.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Summer sale"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select
            value={values.status}
            onValueChange={(v) => onChange({ status: v as BannerStatus })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Link URL (optional)</Label>
          <Input
            type="url"
            className="h-9"
            value={values.linkUrl}
            onChange={(e) => onChange({ linkUrl: e.target.value })}
            placeholder="https://example.com/sale"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Sort order</Label>
          <Input
            type="number"
            min={0}
            className="num h-9"
            value={values.sortOrder}
            onChange={(e) => onChange({ sortOrder: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Start date (optional)</Label>
          <Input
            type="date"
            className="h-9"
            value={values.startAt}
            onChange={(e) => onChange({ startAt: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">End date (optional)</Label>
          <Input
            type="date"
            className="h-9"
            value={values.endAt}
            onChange={(e) => onChange({ endAt: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Image</Label>
        <MediaPicker value={values.imageId} onChange={(imageId) => onChange({ imageId })} />
      </div>
    </div>
  );
}

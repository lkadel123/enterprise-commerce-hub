import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { EmptyState, PageHeader, Section } from "@/components/kit";
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
import { mediaQueryApi } from "@/lib/api/commerce";
import type { MediaDto } from "@/lib/api/types";

export const Route = createFileRoute("/media")({
  head: () => ({
    meta: [
      { title: "Media Library — Northpeak Commerce Console" },
      {
        name: "description",
        content: "Upload and manage images used across products and banners.",
      },
      { property: "og:title", content: "Media Library — Northpeak" },
      { property: "og:description", content: "Image library for products and banners." },
    ],
  }),
  component: MediaPage,
});

const MIME_LABELS: Record<string, string> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function MediaPage() {
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [mimeFilter, setMimeFilter] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [editing, setEditing] = useState<MediaDto | null>(null);
  const [editAlt, setEditAlt] = useState("");
  const [deleting, setDeleting] = useState<MediaDto | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const mediaQuery = mediaQueryApi.useList({
    ...(q ? { q } : {}),
    ...(mimeFilter ? { mimeType: mimeFilter } : {}),
    pageSize: 100,
  });
  const upload = mediaQueryApi.useUpload();
  const updateMedia = mediaQueryApi.useUpdate();
  const removeMedia = mediaQueryApi.useRemove();

  const items = mediaQuery.data ?? [];

  const submitUpload = () => {
    if (!file) {
      toast.error("Choose an image file to upload (JPEG, PNG or WebP)");
      return;
    }
    upload
      .mutateAsync({ file, ...(alt.trim() ? { alt: alt.trim() } : {}) })
      .then(() => {
        toast.success("Image uploaded");
        setUploadOpen(false);
        setFile(null);
        setAlt("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      })
      .catch((e: unknown) =>
        toast.error(e instanceof AdminApiError ? e.message : "Upload failed"),
      );
  };

  const submitEdit = () => {
    if (!editing) return;
    updateMedia
      .mutateAsync({ id: editing.id, alt: editAlt.trim() || null })
      .then(() => {
        toast.success("Image updated");
        setEditing(null);
      })
      .catch((e: unknown) =>
        toast.error(e instanceof AdminApiError ? e.message : "Update failed"),
      );
  };

  const submitDelete = () => {
    if (!deleting) return;
    removeMedia
      .mutateAsync(deleting.id)
      .then(() => {
        toast.success("Image deleted");
        setDeleting(null);
      })
      .catch((e: unknown) =>
        toast.error(
          e instanceof AdminApiError
            ? e.message
            : "Delete failed — the image may still be referenced by a product or banner.",
        ),
      );
  };

  return (
    <AppShell>
      <PageHeader
        title="Media library"
        description="Images available for products and banners."
        actions={
          <>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setQ(searchInput.trim());
              }}
            >
              <Input
                className="h-9 w-40 sm:w-52"
                placeholder="Search filenames…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <Select value={mimeFilter} onValueChange={setMimeFilter}>
                <SelectTrigger className="h-9 w-28 text-xs">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image/jpeg">JPEG</SelectItem>
                  <SelectItem value="image/png">PNG</SelectItem>
                  <SelectItem value="image/webp">WebP</SelectItem>
                </SelectContent>
              </Select>
            </form>
            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-9"><Upload className="h-4 w-4" /> Upload image</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload image</DialogTitle>
                  <DialogDescription>
                    JPEG, PNG or WebP up to 5 MB. Images become available to products and banners.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Image file</Label>
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="h-9"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Alt text (optional)</Label>
                    <Input
                      className="h-9"
                      placeholder="Describe the image for accessibility"
                      value={alt}
                      onChange={(e) => setAlt(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button size="sm" disabled={upload.isPending} onClick={submitUpload}>
                    {upload.isPending ? "Uploading…" : "Upload"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <Section bodyClassName="p-4 sm:p-5">
        {mediaQuery.isPending ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-lg bg-surface-muted" />
            ))}
          </div>
        ) : mediaQuery.isError ? (
          <p className="py-10 text-center text-sm text-destructive">
            Couldn't load media. Check your connection and try again.
          </p>
        ) : items.length === 0 ? (
          <EmptyState
            title="No images yet"
            description={
              q || mimeFilter
                ? "No images match the current search or filter."
                : "Upload your first image to make it available to products and banners."
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((m) => (
              <MediaCard
                key={m.id}
                media={m}
                onEdit={() => {
                  setEditing(m);
                  setEditAlt(m.alt ?? "");
                }}
                onDelete={() => setDeleting(m)}
              />
            ))}
          </div>
        )}
      </Section>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit image</DialogTitle>
            <DialogDescription>
              {editing?.originalName} — update the alt text used for accessibility and SEO.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Alt text</Label>
            <Input
              className="h-9"
              value={editAlt}
              onChange={(e) => setEditAlt(e.target.value)}
              placeholder="Describe the image"
            />
          </div>
          <DialogFooter>
            <Button size="sm" disabled={updateMedia.isPending} onClick={submitEdit}>
              {updateMedia.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete image</DialogTitle>
            <DialogDescription>
              Delete “{deleting?.originalName}”? This cannot be undone. Images still referenced by a
              product or banner cannot be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              size="sm"
              variant="destructive"
              disabled={removeMedia.isPending}
              onClick={submitDelete}
            >
              {removeMedia.isPending ? "Deleting…" : "Delete image"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function MediaCard({ media, onEdit, onDelete }: { media: MediaDto; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-surface transition-shadow hover:shadow-raised">
      <div className="aspect-[4/3] overflow-hidden bg-surface-muted">
        <img
          src={media.url}
          alt={media.alt ?? media.originalName}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="space-y-1 p-3">
        <p className="truncate text-xs font-medium" title={media.originalName}>
          {media.originalName}
        </p>
        <p className="num text-[11px] text-muted-foreground">
          {MIME_LABELS[media.mimeType] ?? media.mimeType} · {formatBytes(media.size)}
          {media.width && media.height ? ` · ${media.width}×${media.height}` : ""}
        </p>
        <p className="truncate text-[11px] text-muted-foreground" title={media.alt ?? undefined}>
          {media.alt ? `Alt: ${media.alt}` : "No alt text"}
        </p>
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-muted-foreground">
            {new Date(media.createdAt).toLocaleDateString()}
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { apiErrorMessage } from "@/lib/api/client";
import { focusFirstFieldError } from "@/lib/focus-field-error";
import {
  useAddressesQuery,
  useCreateAddressMutation,
  useDeleteAddressMutation,
  useUpdateAddressMutation,
} from "@/features/checkout/checkout-hooks";
import {
  addressFormSchema,
  zodFieldErrors,
  type AddressFormValues,
} from "@/features/checkout/checkout-validation";
import type { CustomerAddressDto } from "@/types";

/**
 * `/account/addresses` — saved-address book.
 *
 * Full CRUD against the verified `customer/addresses` contract: list,
 * create, edit, delete (with confirmation) and set default. Ownership is
 * enforced server-side; no customer id is ever sent.
 */
export const Route = createFileRoute("/account/addresses")({
  component: AddressesPage,
});

const EMPTY_FORM: AddressFormValues = {
  label: "Home",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "Nepal",
  isDefault: false,
};

function AddressesPage() {
  const addresses = useAddressesQuery();
  const createAddress = useCreateAddressMutation();
  const updateAddress = useUpdateAddressMutation();
  const deleteAddress = useDeleteAddressMutation();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AddressFormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<CustomerAddressDto | null>(null);

  const openEditor = (address?: CustomerAddressDto) => {
    setErrors({});
    if (address) {
      setEditingId(address.id);
      setForm({
        label: address.label,
        line1: address.line1,
        line2: address.line2 ?? "",
        city: address.city,
        state: address.state ?? "",
        postalCode: address.postalCode,
        country: address.country,
        isDefault: address.isDefault,
      });
    } else {
      setEditingId(null);
      setForm(EMPTY_FORM);
    }
    setEditorOpen(true);
  };

  const save = () => {
    const parsed = addressFormSchema.safeParse(form);
    if (!parsed.success) {
      const nextErrors = zodFieldErrors(parsed.error);
      setErrors(nextErrors);
      // Focus the first invalid field (Phase 10, WCAG 2.4.3).
      focusFirstFieldError(
        ["label", "line1", "line2", "city", "state", "postalCode", "country"],
        nextErrors,
        (field) => `address-${field}`,
      );
      return;
    }
    setErrors({});
    const data = parsed.data;
    const payload = {
      label: data.label,
      line1: data.line1,
      ...(data.line2 ? { line2: data.line2 } : {}),
      city: data.city,
      ...(data.state ? { state: data.state } : {}),
      postalCode: data.postalCode,
      country: data.country,
      ...(data.isDefault ? { isDefault: true } : {}),
    };
    if (editingId) {
      updateAddress.mutate(
        { id: editingId, body: payload },
        {
          onSuccess: () => {
            toast.success("Address updated.");
            setEditorOpen(false);
          },
          onError: (err) => toast.error(apiErrorMessage(err)),
        },
      );
    } else {
      createAddress.mutate(payload, {
        onSuccess: () => {
          toast.success("Address added.");
          setEditorOpen(false);
        },
        onError: (err) => toast.error(apiErrorMessage(err)),
      });
    }
  };

  const setDefault = (address: CustomerAddressDto) => {
    if (address.isDefault) return;
    updateAddress.mutate(
      { id: address.id, body: { isDefault: true } },
      {
        onSuccess: () => toast.success(`“${address.label}” is now your default address.`),
        onError: (err) => toast.error(apiErrorMessage(err)),
      },
    );
  };

  const saved = addresses.data ?? [];

  const bindField = (key: keyof AddressFormValues) => ({
    id: `address-${key}`,
    value: (form[key] as string) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value })),
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `address-${key}-error` : undefined,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Saved addresses</h2>
        <Button className="min-h-[44px]" onClick={() => openEditor()}>
          <Plus className="mr-2 h-4 w-4" />
          Add address
        </Button>
      </div>

      {addresses.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading addresses…
        </p>
      ) : addresses.isError ? (
        <ErrorState
          error={addresses.error}
          title="Unable to load your addresses"
          onRetry={() => void addresses.refetch()}
        />
      ) : saved.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-10 w-10" />}
          title="No saved addresses"
          description="Add a shipping address to speed up checkout."
          action={
            <Button onClick={() => openEditor()} className="min-h-[44px]">
              <Plus className="mr-2 h-4 w-4" /> Add your first address
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {saved.map((address) => (
            <li key={address.id} className="rounded-md border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="break-words">{address.label}</span>
                    {address.isDefault ? <Badge>Default</Badge> : null}
                  </p>
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {[
                      address.line1,
                      address.line2,
                      address.city,
                      address.state,
                      address.postalCode,
                      address.country,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {!address.isDefault ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px]"
                    disabled={updateAddress.isPending}
                    onClick={() => setDefault(address)}
                  >
                    <Star className="mr-1 h-4 w-4" />
                    Set default
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-[44px]"
                  onClick={() => openEditor(address)}
                >
                  <Pencil className="mr-1 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-[44px]"
                  aria-label={`Delete ${address.label}`}
                  onClick={() => setDeleting(address)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Create / edit dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit address" : "Add address"}</DialogTitle>
            <DialogDescription>Saved addresses are available at checkout.</DialogDescription>
          </DialogHeader>
          <form
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            noValidate
            aria-busy={createAddress.isPending || updateAddress.isPending}
          >
            <div className="sm:col-span-2">
              <Label htmlFor="address-label">Label</Label>
              <Input {...bindField("label")} />
              {errors.label ? (
                <p id="address-label-error" role="alert" className="mt-1 text-sm text-destructive">
                  {errors.label}
                </p>
              ) : null}
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="address-line1">Address line 1</Label>
              <Input autoComplete="address-line1" {...bindField("line1")} />
              {errors.line1 ? (
                <p id="address-line1-error" role="alert" className="mt-1 text-sm text-destructive">
                  {errors.line1}
                </p>
              ) : null}
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="address-line2">Address line 2 (optional)</Label>
              <Input autoComplete="address-line2" {...bindField("line2")} />
            </div>
            <div>
              <Label htmlFor="address-city">City</Label>
              <Input autoComplete="address-level2" {...bindField("city")} />
              {errors.city ? (
                <p id="address-city-error" role="alert" className="mt-1 text-sm text-destructive">
                  {errors.city}
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="address-state">State / province</Label>
              <Input autoComplete="address-level1" {...bindField("state")} />
            </div>
            <div>
              <Label htmlFor="address-postalCode">Postal code</Label>
              <Input autoComplete="postal-code" {...bindField("postalCode")} />
              {errors.postalCode ? (
                <p
                  id="address-postalCode-error"
                  role="alert"
                  className="mt-1 text-sm text-destructive"
                >
                  {errors.postalCode}
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="address-country">Country</Label>
              <Input autoComplete="country-name" {...bindField("country")} />
              {errors.country ? (
                <p
                  id="address-country-error"
                  role="alert"
                  className="mt-1 text-sm text-destructive"
                >
                  {errors.country}
                </p>
              ) : null}
            </div>
            {!editingId ? (
              <label className="flex min-h-[44px] items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={form.isDefault ?? false}
                  onChange={(e) => setForm((prev) => ({ ...prev, isDefault: e.target.checked }))}
                />
                Set as default address
              </label>
            ) : null}
            <DialogFooter className="sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => setEditorOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="min-h-[44px]"
                disabled={createAddress.isPending || updateAddress.isPending}
                aria-busy={createAddress.isPending || updateAddress.isPending}
              >
                {editingId ? "Save changes" : "Add address"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete address</DialogTitle>
            <DialogDescription>
              {deleting ? `Delete “${deleting.label}”? This cannot be undone.` : undefined}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="min-h-[44px]" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="min-h-[44px]"
              disabled={deleteAddress.isPending}
              aria-busy={deleteAddress.isPending}
              onClick={() => {
                if (!deleting) return;
                deleteAddress.mutate(deleting.id, {
                  onSuccess: () => {
                    toast.success("Address deleted.");
                    setDeleting(null);
                  },
                  onError: (err) => toast.error(apiErrorMessage(err)),
                });
              }}
            >
              {deleteAddress.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

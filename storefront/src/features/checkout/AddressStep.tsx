import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiErrorMessage } from "@/lib/api/client";
import { focusFirstFieldError } from "@/lib/focus-field-error";
import { useAddressesQuery, useCreateAddressMutation } from "@/features/checkout/checkout-hooks";
import {
  addressFormSchema,
  zodFieldErrors,
  type AddressFormValues,
} from "@/features/checkout/checkout-validation";
import type { OrderAddress } from "@/types";

interface AddressStepProps {
  /** Selected inline shipping address (from a saved address or the form). */
  value: OrderAddress | null;
  onChange: (address: OrderAddress) => void;
  onContinue: () => void;
}

/**
 * Step 1 — shipping address.
 *
 * The customer picks a saved address (converted to an inline order address)
 * or enters a new one. New addresses can optionally be saved to the address
 * book via the verified `POST /customer/addresses` contract.
 */
export function AddressStep({ value, onChange, onContinue }: AddressStepProps) {
  const addresses = useAddressesQuery();
  const createAddress = useCreateAddressMutation();

  const [mode, setMode] = useState<"saved" | "new">("new");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<AddressFormValues>({
    label: "Home",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "Nepal",
    isDefault: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveToBook, setSaveToBook] = useState(false);

  const saved = addresses.data ?? [];
  const effectiveMode = saved.length > 0 ? mode : "new";

  const selectSaved = (id: string) => {
    setSelectedId(id);
    const address = saved.find((a) => a.id === id);
    if (!address) return;
    onChange({
      line1: address.line1,
      ...(address.line2 ? { line2: address.line2 } : {}),
      city: address.city,
      ...(address.state ? { state: address.state } : {}),
      postalCode: address.postalCode,
      country: address.country,
    });
  };

  const submitNew = () => {
    const parsed = addressFormSchema.safeParse(form);
    if (!parsed.success) {
      const nextErrors = zodFieldErrors(parsed.error);
      setErrors(nextErrors);
      // Move keyboard/screen-reader focus to the first invalid field (Phase 10).
      focusFirstFieldError(
        ["label", "line1", "line2", "city", "state", "postalCode", "country"],
        nextErrors,
        (field) => `addr-${field}`,
      );
      return;
    }
    setErrors({});
    const data = parsed.data;
    onChange({
      line1: data.line1,
      ...(data.line2 ? { line2: data.line2 } : {}),
      city: data.city,
      ...(data.state ? { state: data.state } : {}),
      postalCode: data.postalCode,
      country: data.country,
    });
    if (saveToBook) {
      createAddress.mutate(
        {
          label: data.label,
          line1: data.line1,
          ...(data.line2 ? { line2: data.line2 } : {}),
          city: data.city,
          ...(data.state ? { state: data.state } : {}),
          postalCode: data.postalCode,
          country: data.country,
          ...(data.isDefault ? { isDefault: true } : {}),
        },
        {
          onSuccess: () => toast.success("Address saved to your address book"),
          onError: (err) => toast.error(apiErrorMessage(err)),
        },
      );
    }
    onContinue();
  };

  const bindField = (key: keyof AddressFormValues) => ({
    id: `addr-${key}`,
    value: (form[key] as string) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value })),
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `addr-${key}-error` : undefined,
  });

  return (
    <section aria-labelledby="address-step-heading">
      <h2 id="address-step-heading" className="text-lg font-semibold">
        Shipping address
      </h2>

      {addresses.isPending ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Loading saved addresses…
        </p>
      ) : null}

      {saved.length > 0 ? (
        <div className="mt-4 space-y-3">
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              className={
                effectiveMode === "saved"
                  ? "font-medium text-primary underline underline-offset-4"
                  : "text-muted-foreground hover:text-foreground"
              }
              onClick={() => setMode("saved")}
            >
              Use a saved address
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              className={
                effectiveMode === "new"
                  ? "font-medium text-primary underline underline-offset-4"
                  : "text-muted-foreground hover:text-foreground"
              }
              onClick={() => setMode("new")}
            >
              Enter a new address
            </button>
          </div>

          {effectiveMode === "saved" ? (
            <fieldset className="space-y-2">
              <legend className="sr-only">Saved addresses</legend>
              {saved.map((address) => (
                <label
                  key={address.id}
                  className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                >
                  <input
                    type="radio"
                    name="saved-address"
                    className="mt-1 h-4 w-4"
                    checked={selectedId === address.id}
                    onChange={() => selectSaved(address.id)}
                  />
                  <span className="min-w-0 text-sm">
                    <span className="font-medium">{address.label}</span>
                    {address.isDefault ? (
                      <span className="ml-2 text-xs text-muted-foreground">(default)</span>
                    ) : null}
                    <br />
                    <span className="break-words text-muted-foreground">
                      {[address.line1, address.city, address.postalCode, address.country]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
        </div>
      ) : null}

      {effectiveMode === "new" ? (
        <form
          className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitNew();
          }}
          noValidate
        >
          <div className="sm:col-span-2">
            <Label htmlFor="addr-label">Address label</Label>
            <Input className="mt-1" {...bindField("label")} />
            {errors.label ? (
              <p id="addr-label-error" role="alert" className="mt-1 text-sm text-destructive">
                {errors.label}
              </p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="addr-line1">Address line 1</Label>
            <Input className="mt-1" autoComplete="address-line1" {...bindField("line1")} />
            {errors.line1 ? (
              <p id="addr-line1-error" role="alert" className="mt-1 text-sm text-destructive">
                {errors.line1}
              </p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="addr-line2">Address line 2 (optional)</Label>
            <Input className="mt-1" autoComplete="address-line2" {...bindField("line2")} />
          </div>
          <div>
            <Label htmlFor="addr-city">City</Label>
            <Input className="mt-1" autoComplete="address-level2" {...bindField("city")} />
            {errors.city ? (
              <p id="addr-city-error" role="alert" className="mt-1 text-sm text-destructive">
                {errors.city}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="addr-state">State / province (optional)</Label>
            <Input className="mt-1" autoComplete="address-level1" {...bindField("state")} />
          </div>
          <div>
            <Label htmlFor="addr-postalCode">Postal code</Label>
            <Input className="mt-1" autoComplete="postal-code" {...bindField("postalCode")} />
            {errors.postalCode ? (
              <p id="addr-postalCode-error" role="alert" className="mt-1 text-sm text-destructive">
                {errors.postalCode}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="addr-country">Country</Label>
            <Input className="mt-1" autoComplete="country-name" {...bindField("country")} />
            {errors.country ? (
              <p id="addr-country-error" role="alert" className="mt-1 text-sm text-destructive">
                {errors.country}
              </p>
            ) : null}
          </div>

          <label className="flex min-h-[44px] items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={saveToBook}
              onChange={(e) => setSaveToBook(e.target.checked)}
            />
            Save this address to my address book
          </label>
          {saveToBook ? (
            <label className="flex min-h-[44px] items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.isDefault ?? false}
                onChange={(e) => setForm((prev) => ({ ...prev, isDefault: e.target.checked }))}
              />
              Make it my default address
            </label>
          ) : null}

          <div className="sm:col-span-2">
            <Button type="submit" className="min-h-[44px] w-full sm:w-auto">
              Continue to payment
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4">
          <Button className="min-h-[44px]" disabled={!value} onClick={onContinue}>
            Continue to payment
          </Button>
          {!value ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Select a saved address to continue.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

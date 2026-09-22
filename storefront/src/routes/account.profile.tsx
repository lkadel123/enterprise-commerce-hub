import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiErrorMessage } from "@/lib/api/client";
import { focusFirstFieldError } from "@/lib/focus-field-error";
import { useCustomerAuth } from "@/lib/auth/CustomerAuthContext";
import {
  useChangePasswordMutation,
  useProfileQuery,
  useUpdateProfileMutation,
} from "@/features/account/account-hooks";

/**
 * `/account/profile` — profile information + password management.
 *
 * Profile: editable name/phone, read-only email. On success the auth
 * context's customer snapshot is refreshed so header/dashboard update
 * immediately.
 *
 * Password: current/new/confirm with confirmation validation. Passwords are
 * never logged and never placed in URLs; fields are cleared after success.
 */
export const Route = createFileRoute("/account/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { customer, applyCustomer } = useCustomerAuth();
  const profile = useProfileQuery();
  const updateProfile = useUpdateProfileMutation((result) => {
    applyCustomer(result.customer);
    void profile.refetch();
    toast.success("Profile updated.");
  });

  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const savedName = name ?? profile.data?.customer.name ?? customer?.name ?? "";
  const savedPhone = phone ?? profile.data?.customerProfile?.phone ?? "";
  const dirty =
    (name !== null && name !== (profile.data?.customer.name ?? "")) ||
    (phone !== null && phone !== (profile.data?.customerProfile?.phone ?? ""));

  const saveProfile = () => {
    if (!dirty || updateProfile.isPending) return;
    if (savedName.trim().length === 0) {
      setProfileError("Name is required.");
      return;
    }
    setProfileError(null);
    updateProfile.mutate(
      {
        ...(name !== null && name !== profile.data?.customer.name
          ? { name: savedName.trim() }
          : {}),
        ...(phone !== null && phone !== (profile.data?.customerProfile?.phone ?? "")
          ? { phone: savedPhone.trim() }
          : {}),
      },
      {
        onSuccess: () => {
          setName(null);
          setPhone(null);
        },
        onError: (err) => toast.error(apiErrorMessage(err)),
      },
    );
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Profile</h2>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile information</CardTitle>
          <CardDescription>Your email address cannot be changed.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid max-w-md grid-cols-1 gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveProfile();
            }}
            noValidate
          >
            <div>
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                className="mt-1"
                value={savedName}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
              {profileError ? (
                <p role="alert" className="mt-1 text-sm text-destructive">
                  {profileError}
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="profile-phone">Phone</Label>
              <Input
                id="profile-phone"
                className="mt-1"
                value={savedPhone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                inputMode="tel"
              />
            </div>
            <div>
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                className="mt-1 bg-muted"
                value={customer?.email ?? ""}
                readOnly
                aria-readonly="true"
              />
            </div>
            <Button
              type="submit"
              className="min-h-[44px] w-full sm:w-auto"
              disabled={!dirty || updateProfile.isPending}
              aria-busy={updateProfile.isPending}
            >
              {updateProfile.isPending ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <PasswordSection />
    </div>
  );
}

function PasswordSection() {
  const changePassword = useChangePasswordMutation();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (changePassword.isPending) return;
    const nextErrors: Record<string, string> = {};
    if (current.length === 0) nextErrors.current = "Current password is required.";
    if (next.length < 8) {
      nextErrors.next = "New password must be at least 8 characters.";
    } else if (next === current) {
      nextErrors.next = "New password must differ from the current password.";
    }
    if (confirm !== next) {
      nextErrors.confirm = "Passwords do not match.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      // Focus the first invalid password field (Phase 10, WCAG 2.4.3).
      focusFirstFieldError(
        ["current", "next", "confirm"],
        nextErrors,
        (field) => `password-${field}`,
      );
      return;
    }

    changePassword.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          // Clear the form — never persist or log passwords.
          setCurrent("");
          setNext("");
          setConfirm("");
          toast.success("Password changed successfully.");
        },
        onError: (err) => toast.error(apiErrorMessage(err)),
      },
    );
  };

  const bind = (key: "current" | "next" | "confirm") => ({
    id: `password-${key}`,
    value: key === "current" ? current : key === "next" ? next : confirm,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      key === "current"
        ? setCurrent(e.target.value)
        : key === "next"
          ? setNext(e.target.value)
          : setConfirm(e.target.value),
    type: "password" as const,
    autoComplete: key === "current" ? "current-password" : ("new-password" as const),
    className: "mt-1",
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `password-${key}-error` : undefined,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Password</CardTitle>
        <CardDescription>Choose a strong password of at least 8 characters.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid max-w-md grid-cols-1 gap-4"
          onSubmit={submit}
          noValidate
          aria-busy={changePassword.isPending}
        >
          <div>
            <Label htmlFor="password-current">Current password</Label>
            <Input {...bind("current")} />
            {errors.current ? (
              <p id="password-current-error" role="alert" className="mt-1 text-sm text-destructive">
                {errors.current}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="password-next">New password</Label>
            <Input {...bind("next")} />
            {errors.next ? (
              <p id="password-next-error" role="alert" className="mt-1 text-sm text-destructive">
                {errors.next}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="password-confirm">Confirm new password</Label>
            <Input {...bind("confirm")} />
            {errors.confirm ? (
              <p id="password-confirm-error" role="alert" className="mt-1 text-sm text-destructive">
                {errors.confirm}
              </p>
            ) : null}
          </div>
          <Button
            type="submit"
            className="min-h-[44px] w-full sm:w-auto"
            disabled={changePassword.isPending}
            aria-busy={changePassword.isPending}
          >
            {changePassword.isPending ? "Changing…" : "Change password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

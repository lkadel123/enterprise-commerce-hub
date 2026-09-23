import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Minus, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section, StatusBadge } from "@/components/kit";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { usersApi } from "@/lib/api/commerce";
import type { RoleName, UserDto } from "@/lib/api/types";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "Team & Roles — Northpeak Commerce Console" },
      {
        name: "description",
        content: "Manage admin accounts, assign roles and control module-level permissions.",
      },
      { property: "og:title", content: "Team & Roles — Northpeak" },
      { property: "og:description", content: "Role-based access control matrix for admin users." },
    ],
  }),
  component: UsersPage,
});

const ACTION_LABELS = ["view", "create", "edit", "delete"] as const;
type MatrixAction = (typeof ACTION_LABELS)[number];

function UsersPage() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("");

  const [resetTarget, setResetTarget] = useState<UserDto | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const queryClient = useQueryClient();
  const usersQuery = useQuery({
    queryKey: ["admin", "users", { pageSize: 100 }],
    queryFn: () => usersApi.list({ pageSize: 100 }).then((r) => r.data),
  });
  const rolesQuery = useQuery({
    queryKey: ["admin", "users", "roles"],
    queryFn: () => usersApi.roles().then((r) => r.data),
  });
  const createUser = useMutation({
    mutationFn: (body: { name: string; email: string; password: string; role: string }) =>
      usersApi.create(body as never),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("Team member invited");
      setInviteOpen(false);
      setName("");
      setEmail("");
      setPassword("");
      setRole("");
    },
    onError: (e: unknown) => toast.error(e instanceof AdminApiError ? e.message : "Action failed"),
  });
  const updateUser = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      usersApi.update(id, body as never),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("User updated");
    },
    onError: (e: unknown) => toast.error(e instanceof AdminApiError ? e.message : "Action failed"),
  });
  const resetPassword = useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      usersApi.resetPassword(id, newPassword),
    onSuccess: () => {
      toast.success(
        `Password updated for ${resetTarget?.name ?? "user"}. Their active sessions were signed out.`,
      );
      setResetTarget(null);
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e: unknown) => toast.error(e instanceof AdminApiError ? e.message : "Action failed"),
  });

  const submitResetPassword = () => {
    if (!resetTarget) return;
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    resetPassword.mutate({ id: resetTarget.id, newPassword });
  };

  const users = usersQuery.data ?? [];
  const roles = rolesQuery.data ?? [];
  const roleNames = roles.map((r) => r.name);
  const modules = Array.from(new Set(roles.flatMap((r) => r.permissions.map((p) => p.module))));

  const roleAllows = (roleName: string, module: string, action: MatrixAction): boolean => {
    const role = roles.find((r) => r.name === roleName);
    return (
      role?.permissions.some(
        (p) => p.module === module && (p.actions as string[]).includes(action),
      ) ?? false
    );
  };

  return (
    <AppShell>
      <PageHeader
        title="Team & roles"
        description="Admin accounts, role assignments and granular permissions."
        actions={
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9">
                <UserPlus className="h-4 w-4" /> Invite user
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite team member</DialogTitle>
                <DialogDescription>
                  Create an admin account with an initial password.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Full name</Label>
                  <Input
                    className="h-9"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jordan Ellis"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Work email</Label>
                  <Input
                    type="email"
                    className="h-9"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jordan.e@northpeak.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Initial password</Label>
                  <Input
                    type="password"
                    className="h-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleNames.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  size="sm"
                  disabled={
                    createUser.isPending || !name.trim() || !email.trim() || !password || !role
                  }
                  onClick={() =>
                    createUser.mutate({ name: name.trim(), email: email.trim(), password, role })
                  }
                >
                  Create account
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Section
        title="Admin users"
        description={usersQuery.isPending ? "Loading…" : `${users.length} accounts`}
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/70 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">User</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Last active</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.isPending ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Loading users…
                  </td>
                </tr>
              ) : usersQuery.isError ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-destructive">
                    Couldn't load users. Check your connection and try again.
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No admin accounts yet.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="border-t transition-colors hover:bg-surface-muted/50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-surface-muted text-xs">
                            {u.name
                              .split(" ")
                              .map((n: string) => n[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{u.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Select
                        value={u.role}
                        onValueChange={(v) => updateUser.mutate({ id: u.id, body: { role: v } })}
                      >
                        <SelectTrigger className="h-8 w-[180px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roleNames.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={u.status} />
                    </td>
                    <td className="num px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                      {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                          setResetTarget(u);
                          setNewPassword("");
                          setConfirmPassword("");
                        }}
                      >
                        Reset password
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={updateUser.isPending}
                        onClick={() =>
                          updateUser.mutate({
                            id: u.id,
                            body: { status: u.status === "Suspended" ? "Active" : "Suspended" },
                          })
                        }
                      >
                        {u.status === "Suspended" ? "Reactivate" : "Suspend"}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set new password</DialogTitle>
            <DialogDescription>
              Sets a new password for {resetTarget?.name ?? "this user"} immediately. The user will
              be signed out of all active sessions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">New password</Label>
              <Input
                type="password"
                autoComplete="new-password"
                className="h-9"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Confirm new password</Label>
              <Input
                type="password"
                autoComplete="new-password"
                className="h-9"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat the new password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" disabled={resetPassword.isPending} onClick={submitResetPassword}>
              {resetPassword.isPending ? "Updating…" : "Update password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Section
        className="mt-4"
        title="Permission matrix"
        description="Module-level access per role"
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/70 text-xs text-muted-foreground">
              <tr>
                <th className="sticky left-0 bg-surface-muted/70 px-4 py-2.5 text-left font-medium">
                  Role
                </th>
                {modules.map((m) => (
                  <th key={m} className="border-l px-3 py-2.5 text-center font-medium" colSpan={4}>
                    {m}
                  </th>
                ))}
              </tr>
              <tr className="border-t">
                <th className="sticky left-0 bg-surface-muted/70 px-4 py-1.5" />
                {modules.map((m) =>
                  ACTION_LABELS.map((a, i) => (
                    <th
                      key={`${m}-${a}`}
                      className={`px-2 py-1.5 text-center font-normal ${i === 0 ? "border-l" : ""}`}
                    >
                      {a.slice(0, 1).toUpperCase()}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.name} className="border-t hover:bg-surface-muted/40">
                  <td className="sticky left-0 bg-surface px-4 py-2.5 font-medium whitespace-nowrap">
                    {role.name}
                  </td>
                  {modules.map((m) =>
                    ACTION_LABELS.map((a, ai) => (
                      <td
                        key={`${m}-${a}`}
                        className={`px-2 py-2.5 text-center ${ai === 0 ? "border-l" : ""}`}
                      >
                        {roleAllows(role.name, m, a) ? (
                          <Check className="mx-auto h-3.5 w-3.5 text-success" />
                        ) : (
                          <Minus className="mx-auto h-3.5 w-3.5 text-muted-foreground/40" />
                        )}
                      </td>
                    )),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </AppShell>
  );
}

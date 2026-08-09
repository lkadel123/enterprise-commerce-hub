import { createFileRoute } from "@tanstack/react-router";
import { Check, Minus, UserPlus } from "lucide-react";
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
import { permissionModules, roles, teamUsers } from "@/lib/mock-data";

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

const actions = ["View", "Create", "Edit", "Delete"] as const;

function allowed(roleIdx: number, moduleIdx: number, actionIdx: number) {
  if (roleIdx === 0) return true;
  return (roleIdx + moduleIdx * 2 + actionIdx * 3) % 4 !== 0 && actionIdx <= 3 - Math.min(2, roleIdx % 3);
}

function UsersPage() {
  return (
    <AppShell>
      <PageHeader
        title="Team & roles"
        description="Admin accounts, role assignments and granular permissions."
        actions={
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9"><UserPlus className="h-4 w-4" /> Invite user</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite team member</DialogTitle>
                <DialogDescription>They will receive an email invitation to join the console.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5"><Label className="text-xs">Full name</Label><Input className="h-9" placeholder="Jordan Ellis" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Work email</Label><Input type="email" className="h-9" placeholder="jordan.e@northpeak.com" /></div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Role</Label>
                  <Select defaultValue="Manager">
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button size="sm" onClick={() => toast.success("Invitation sent")}>Send invitation</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Section title="Admin users" description={`${teamUsers.length} accounts`} bodyClassName="p-0">
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
              {teamUsers.map((u) => (
                <tr key={u.email} className="border-t transition-colors hover:bg-surface-muted/50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-surface-muted text-xs">
                          {u.name.split(" ").map((n: string) => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <Select defaultValue={u.role}>
                      <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-2.5"><StatusBadge status={u.status} /></td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{u.lastActive}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => toast.success(`Password reset sent to ${u.email}`)}>Reset password</Button>
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive" onClick={() => toast.error(`${u.name} suspended`)}>Suspend</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section className="mt-4" title="Permission matrix" description="Module-level access per role" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/70 text-xs text-muted-foreground">
              <tr>
                <th className="sticky left-0 bg-surface-muted/70 px-4 py-2.5 text-left font-medium">Role</th>
                {permissionModules.map((m) => (
                  <th key={m} className="border-l px-3 py-2.5 text-center font-medium" colSpan={4}>{m}</th>
                ))}
              </tr>
              <tr className="border-t">
                <th className="sticky left-0 bg-surface-muted/70 px-4 py-1.5" />
                {permissionModules.map((m) =>
                  actions.map((a, i) => (
                    <th key={`${m}-${a}`} className={`px-2 py-1.5 text-center font-normal ${i === 0 ? "border-l" : ""}`}>{a.slice(0, 1)}</th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {roles.map((role, ri) => (
                <tr key={role} className="border-t hover:bg-surface-muted/40">
                  <td className="sticky left-0 bg-surface px-4 py-2.5 font-medium whitespace-nowrap">{role}</td>
                  {permissionModules.map((m, mi) =>
                    actions.map((a, ai) => (
                      <td key={`${m}-${a}`} className={`px-2 py-2.5 text-center ${ai === 0 ? "border-l" : ""}`}>
                        {allowed(ri, mi, ai) ? (
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

import { createFileRoute } from "@tanstack/react-router";
import { Download, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { activityLog, permissionModules } from "@/lib/mock-data";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity Log — Northpeak Commerce Console" },
      {
        name: "description",
        content: "Audit trail of admin actions with user, module, IP address and timestamp.",
      },
      { property: "og:title", content: "Activity Log — Northpeak" },
      { property: "og:description", content: "Immutable audit trail for compliance and security review." },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const [query, setQuery] = useState("");
  const [module, setModule] = useState("all");

  const rows = useMemo(
    () =>
      activityLog.filter(
        (a) =>
          (module === "all" || a.module === module) &&
          (a.user + a.description).toLowerCase().includes(query.toLowerCase()),
      ),
    [query, module],
  );

  return (
    <AppShell>
      <PageHeader
        title="Activity log"
        description="Every administrative action, recorded and immutable."
        actions={
          <Button variant="outline" size="sm" className="h-9" onClick={() => toast.success("Audit log export queued")}>
            <Download className="h-4 w-4" /> Export log
          </Button>
        }
      />

      <Section bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search user or action..." className="h-9 pl-9" />
          </div>
          <Select value={module} onValueChange={setModule}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {permissionModules.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              <SelectItem value="Returns">Returns</SelectItem>
              <SelectItem value="Content">Content</SelectItem>
              <SelectItem value="Administration">Administration</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/70 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Timestamp</th>
                <th className="px-4 py-2.5 font-medium">User</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Module</th>
                <th className="px-4 py-2.5 font-medium">Description</th>
                <th className="px-4 py-2.5 font-medium">IP address</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.time + a.user} className="border-t transition-colors hover:bg-surface-muted/50">
                  <td className="num px-4 py-2.5 whitespace-nowrap text-muted-foreground">{a.time}</td>
                  <td className="px-4 py-2.5 font-medium whitespace-nowrap">{a.user}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{a.role}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{a.action}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{a.module}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{a.description}</td>
                  <td className="num px-4 py-2.5 whitespace-nowrap text-muted-foreground">{a.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </AppShell>
  );
}

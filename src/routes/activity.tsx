import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { EmptyState, PageHeader, Section } from "@/components/kit";

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
  return (
    <AppShell>
      <PageHeader
        title="Activity log"
        description="Every administrative action, recorded and immutable."
      />

      <Section>
        <EmptyState
          title="Audit trail is not available yet"
          description="There is no audit-log backend in this build, so no admin activity can be listed or exported. The previous preview data has been removed to avoid presenting fabricated records."
        />
      </Section>
    </AppShell>
  );
}

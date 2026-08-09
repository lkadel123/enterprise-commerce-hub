import type { ReactNode } from "react";

import { AppSidebar } from "@/components/layout/AppSidebar";
import { Topbar } from "@/components/layout/Topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <Topbar />
          <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
            <div className="mx-auto w-full max-w-[1600px]">{children}</div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

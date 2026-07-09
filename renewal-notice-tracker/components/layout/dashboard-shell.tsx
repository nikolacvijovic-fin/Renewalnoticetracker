import { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { LEGAL_DISCLAIMER } from "@/lib/constants";

export function DashboardShell({
  children
}: {
  children: ReactNode;
}) {
  return (
    <div className="page-shell grid gap-6 py-6 lg:grid-cols-[260px_1fr]">
      <AppSidebar />
      <main className="space-y-6">
        {children}
        <div className="rounded-2xl border border-line bg-white px-4 py-3 text-sm text-muted shadow-sm">
          {LEGAL_DISCLAIMER}
        </div>
      </main>
    </div>
  );
}

import { redirect } from "next/navigation";
import { RevenueCommandCenter } from "@/components/revenue-intelligence/revenue-command-center";
import { hasRequiredRole, requireOrganization } from "@/lib/auth";
import { getRevenueIntelligenceDashboard } from "@/lib/revenue-intelligence/revenue-intelligence";

export default async function RevenueIntelligencePage() {
  const context = await requireOrganization();
  const canView = hasRequiredRole(context.role, ["admin", "operator", "reviewer"]);
  if (!canView) {
    redirect("/dashboard");
  }

  const dashboard = await getRevenueIntelligenceDashboard({
    organizationId: context.organizationId
  });

  return <RevenueCommandCenter dashboard={dashboard} canAct={canView} />;
}

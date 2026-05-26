import { redirect } from "next/navigation";
import {
  requireOrganization,
  type ActiveOrganizationContext
} from "@/lib/auth";
import {
  assertCanAccessIntelligenceSurface,
  type IntelligenceSurface
} from "@/lib/intelligence/access";

export async function requireIntelligencePageContext(
  surface: IntelligenceSurface
): Promise<ActiveOrganizationContext> {
  const context = await requireOrganization();

  try {
    await assertCanAccessIntelligenceSurface({
      context,
      surface
    });
  } catch {
    redirect("/dashboard");
  }

  return context;
}

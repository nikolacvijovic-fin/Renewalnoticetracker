"use server";

import { revalidatePath } from "next/cache";
import { assertCanUseShippedAction, hasRequiredRole, requireOrganization } from "@/lib/auth";
import {
  archiveRevenueSignal,
  enqueueRevenueIntelligenceRefreshJob,
  generateRevenueIntelligenceSnapshot,
  markExecutiveInsightReviewed
} from "@/lib/revenue-intelligence/revenue-intelligence";

export type RevenueIntelligenceActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; code: string };

function safeError(error: unknown): RevenueIntelligenceActionResult {
  const message = error instanceof Error ? error.message : "Revenue intelligence action failed.";
  return {
    ok: false,
    message: message.includes("Revenue intelligence")
      ? message
      : "Revenue intelligence action failed safely.",
    code: "ERR_REVENUE_INTELLIGENCE_ACTION_FAILED_001"
  };
}

async function requireRevenueOperator() {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "review_p0");
  if (!hasRequiredRole(context.role, ["admin", "operator", "reviewer"])) {
    throw new Error("Revenue intelligence refresh requires an admin, operator, or reviewer.");
  }
  return context;
}

function revalidateRevenue() {
  revalidatePath("/dashboard/revenue-intelligence");
  revalidatePath("/dashboard");
}

export async function generateRevenueIntelligenceSnapshotAction(): Promise<RevenueIntelligenceActionResult> {
  try {
    const context = await requireRevenueOperator();
    await generateRevenueIntelligenceSnapshot({
      organizationId: context.organizationId,
      actorUserId: context.user.id
    });
    revalidateRevenue();
    return { ok: true, message: "Revenue intelligence snapshot generated." };
  } catch (error) {
    return safeError(error);
  }
}

export async function refreshRevenueIntelligenceDashboardAction(): Promise<RevenueIntelligenceActionResult> {
  return generateRevenueIntelligenceSnapshotAction();
}

export async function refreshRevenueForecastAction(): Promise<RevenueIntelligenceActionResult> {
  return generateRevenueIntelligenceSnapshotAction();
}

export async function refreshExecutiveInsightsAction(): Promise<RevenueIntelligenceActionResult> {
  return generateRevenueIntelligenceSnapshotAction();
}

export async function enqueueRevenueIntelligenceRefreshJobAction(): Promise<RevenueIntelligenceActionResult> {
  try {
    const context = await requireRevenueOperator();
    await enqueueRevenueIntelligenceRefreshJob({
      organizationId: context.organizationId,
      actorUserId: context.user.id
    });
    revalidateRevenue();
    return { ok: true, message: "Revenue intelligence refresh job queued." };
  } catch (error) {
    return safeError(error);
  }
}

export async function markExecutiveInsightReviewedAction(insightId: string): Promise<RevenueIntelligenceActionResult> {
  try {
    const context = await requireRevenueOperator();
    await markExecutiveInsightReviewed({
      organizationId: context.organizationId,
      insightId,
      actorUserId: context.user.id
    });
    revalidateRevenue();
    return { ok: true, message: "Executive insight marked reviewed." };
  } catch (error) {
    return safeError(error);
  }
}

export async function archiveRevenueSignalAction(signalId: string): Promise<RevenueIntelligenceActionResult> {
  try {
    const context = await requireRevenueOperator();
    await archiveRevenueSignal({
      organizationId: context.organizationId,
      signalId,
      actorUserId: context.user.id
    });
    revalidateRevenue();
    return { ok: true, message: "Revenue risk signal archived." };
  } catch (error) {
    return safeError(error);
  }
}

export async function generateRevenueIntelligenceSnapshotFormAction() {
  await generateRevenueIntelligenceSnapshotAction();
}

export async function enqueueRevenueIntelligenceRefreshJobFormAction() {
  await enqueueRevenueIntelligenceRefreshJobAction();
}

export async function markExecutiveInsightReviewedFormAction(insightId: string) {
  await markExecutiveInsightReviewedAction(insightId);
}

export async function archiveRevenueSignalFormAction(signalId: string) {
  await archiveRevenueSignalAction(signalId);
}

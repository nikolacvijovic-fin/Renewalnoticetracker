import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { getExportRows } from "@/lib/contracts/kernel-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildExecutiveValuePdf, buildExecutiveValueWorkbook, type ExecutiveValueReportInput } from "@/lib/subscription-usage/executive-value-report";
import { listConfirmedRenewalOutcomes } from "@/lib/renewal-workspace/renewal-workspace-service";

export async function handleExecutiveValueReport(format: "pdf" | "xlsx") {
  const context = await requireOrganization();
  if (!['owner', 'admin', 'operator'].includes(context.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createServerSupabaseClient();
  const periodStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [renewalRows, findingsResult, connectionsResult, organizationResult, confirmedOutcomes] = await Promise.all([
    getExportRows(context.organizationId, "basic_contract_register"),
    supabase.from("license_waste_opportunities")
      .select("id, finding_type, review_status, estimated_savings, realized_savings, currency, confidence, is_sample, resolved_at, superseded_at, matched_contract_ids, involved_providers, feedback_classification, reviewed_at")
      .eq("organization_id", context.organizationId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("subscription_usage_provider_connections")
      .select("id, provider, last_successful_sync_at")
      .eq("organization_id", context.organizationId)
      .order("updated_at", { ascending: false })
      .limit(10),
    supabase.from("organizations").select("name").eq("id", context.organizationId).single(),
    listConfirmedRenewalOutcomes({ organizationId: context.organizationId, from: periodStart, limit: 500 })
  ]);
  if (findingsResult.error) throw findingsResult.error;
  if (connectionsResult.error) throw connectionsResult.error;
  if (organizationResult.error) throw organizationResult.error;
  const generatedAt = new Date();
  const input: ExecutiveValueReportInput = {
    organizationId: context.organizationId,
    organizationName: organizationResult.data.name,
    periodStart,
    periodEnd: generatedAt.toISOString().slice(0, 10),
    generatedAt: generatedAt.toISOString(),
    contractsMonitored: renewalRows.length,
    protectedDeadlineCount: renewalRows.filter((row) =>
      Boolean(row.notice_deadline_date)
      && String(row.needs_review ?? "").toLowerCase() !== "yes"
      && (Boolean(row.latest_reminder_status) || Boolean(row.renewal_decision_status))
    ).length,
    providerFreshness: (connectionsResult.data ?? []).map((row) => ({ connectionId: row.id, provider: row.provider, lastSuccessfulSyncAt: row.last_successful_sync_at })),
    upcomingActions: renewalRows.filter((row) => row.notice_deadline_date).slice(0, 20).map((row, index) => ({
      contractId: String(row.contract_id ?? `contract-${index + 1}`),
      title: String(row.contract_title ?? "Untitled contract").slice(0, 120),
      deadline: String(row.notice_deadline_date).slice(0, 10)
    })),
    findings: (findingsResult.data ?? []).map((row) => ({
      id: row.id,
      findingType: row.finding_type,
      reviewStatus: row.review_status,
      estimatedSavings: row.estimated_savings,
      realizedSavings: row.realized_savings,
      currency: row.currency,
      confidence: row.confidence,
      isSample: row.is_sample,
      resolvedAt: row.resolved_at,
      supersededAt: row.superseded_at,
      contractIds: row.matched_contract_ids,
      providerNames: row.involved_providers
      ,feedbackClassification: row.feedback_classification,
      reviewedAt: row.reviewed_at
    })),
    confirmedOutcomes: confirmedOutcomes.map((outcome) => ({
      id: outcome.id,
      realizedSavings: outcome.realized_savings,
      currency: outcome.currency,
      renewalCompletedAt: outcome.renewal_completed_at
    }))
  };
  await createAuditLog({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    action: "subscription_usage.executive_value_report_exported",
    entityType: "subscription_usage_report",
    details: { format, reporting_period_start: input.periodStart, reporting_period_end: input.periodEnd, finding_count: input.findings.length }
  });
  const buffer = format === "pdf" ? await buildExecutiveValuePdf(input) : buildExecutiveValueWorkbook(input);
  return new NextResponse(new Uint8Array(buffer), { headers: {
    "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="noticecontrol-executive-value-report.${format}"`
  }});
}

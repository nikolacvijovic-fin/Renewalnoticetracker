import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { EvidenceReadinessAssessment } from "@/lib/evidence-readiness/types";

function admin() {
  return createAdminSupabaseClient();
}

export async function loadAdminEvidenceReadinessSources(input: {
  organizationId: string;
  contractId: string;
  decisionId?: string | null;
}) {
  const client = admin();
  const [contract, owner, workspaceDefaults, connections, matches, findings, quotes, quoteFindings, tasks, scenarios] = await Promise.all([
    client.from("contracts").select("*, contract_metadata(*)").eq("organization_id", input.organizationId).eq("id", input.contractId).maybeSingle(),
    client.from("memberships").select("user_id, users(notification_email)").eq("organization_id", input.organizationId),
    client.from("audit_logs").select("id").eq("organization_id", input.organizationId).eq("action", "beta.workspace_defaults_configured").limit(1),
    client.from("subscription_usage_provider_connections").select("id, status, last_successful_sync_at").eq("organization_id", input.organizationId).order("updated_at", { ascending: false }).limit(10),
    client.from("contract_usage_matches").select("id, match_confidence, usage_row_id, usage_import_rows(seats_purchased, seats_used, purchased_seats, assigned_seats, evidence_state, trust_state, is_sample)").eq("organization_id", input.organizationId).eq("contract_id", input.contractId).order("created_at", { ascending: false }).limit(10),
    client.from("license_waste_opportunities").select("id, review_status, status, resolved_at, superseded_at, is_sample, requires_new_review, warnings").eq("organization_id", input.organizationId).eq("contract_id", input.contractId).is("resolved_at", null).is("superseded_at", null).eq("is_sample", false).limit(100),
    client.from("renewal_quote_comparisons").select("id, status, proposed_total_amount, currency, quote_file_id, updated_at").eq("organization_id", input.organizationId).eq("contract_id", input.contractId).order("created_at", { ascending: false }).limit(1),
    client.from("renewal_quote_comparison_findings").select("id, status, severity, confidence").eq("organization_id", input.organizationId).eq("contract_id", input.contractId).limit(100),
    input.decisionId
      ? client.from("renewal_workspace_tasks").select("id, status, evidence_requirement").eq("organization_id", input.organizationId).eq("contract_id", input.contractId).eq("decision_id", input.decisionId).not("evidence_requirement", "is", null).neq("status", "completed")
      : Promise.resolve({ data: [], error: null }),
    input.decisionId
      ? client.from("renewal_decision_scenarios").select("id, exchange_rate_source, is_preferred").eq("organization_id", input.organizationId).eq("contract_id", input.contractId).eq("decision_id", input.decisionId).eq("is_preferred", true).limit(1)
      : Promise.resolve({ data: [], error: null })
  ]);

  const error = [contract, owner, workspaceDefaults, connections, matches, findings, quotes, quoteFindings, tasks, scenarios]
    .map((result) => result.error).find(Boolean);
  if (error) throw error;
  if (!contract.data) throw new Error("Contract not found in the active organization.");

  return {
    contract: contract.data as unknown as Record<string, unknown>,
    members: (owner.data ?? []) as unknown as Array<Record<string, unknown>>,
    workspaceTimezoneConfigured: Boolean(workspaceDefaults.data?.length),
    connections: (connections.data ?? []) as unknown as Array<Record<string, unknown>>,
    matches: (matches.data ?? []) as unknown as Array<Record<string, unknown>>,
    findings: (findings.data ?? []) as unknown as Array<Record<string, unknown>>,
    quotes: (quotes.data ?? []) as unknown as Array<Record<string, unknown>>,
    quoteFindings: (quoteFindings.data ?? []) as unknown as Array<Record<string, unknown>>,
    openEvidenceTasks: (tasks.data ?? []) as unknown as Array<Record<string, unknown>>,
    preferredScenarios: (scenarios.data ?? []) as unknown as Array<Record<string, unknown>>
  };
}

export async function persistAdminEvidenceReadinessAssessment(assessment: EvidenceReadinessAssessment) {
  const items = assessment.items.map((item) => ({
    requirementKey: item.requirementKey,
    label: item.label,
    category: item.category,
    state: item.state,
    weight: item.weight,
    earnedWeight: item.earnedWeight,
    isCritical: item.critical,
    evidenceSource: item.evidenceSource,
    sourceRecordId: item.sourceRecordId,
    verifiedBy: item.verifiedBy,
    verifiedAt: item.verifiedAt,
    freshnessDate: item.freshnessDate,
    explanation: item.explanation,
    recommendedAction: item.recommendedAction
  }));
  return admin().rpc("persist_evidence_readiness_assessment" as never, {
    p_organization_id: assessment.organizationId,
    p_contract_id: assessment.contractId,
    p_decision_profile: assessment.decisionProfile,
    p_score: assessment.score,
    p_readiness_state: assessment.readinessState,
    p_calculation_version: assessment.calculationVersion,
    p_evidence_hash: assessment.evidenceHash,
    p_next_recommended_action: assessment.nextRecommendedAction,
    p_calculated_at: assessment.calculatedAt,
    p_items: items
  } as never) as unknown as Promise<{
    data: { assessmentId: string; changed: boolean; historyId: string | null } | null;
    error: Error | null;
  }>;
}

export async function listAdminEvidenceReadinessAssessments(input: {
  organizationId: string;
  limit?: number;
}) {
  return admin()
    .from("evidence_readiness_assessments" as never)
    .select("*, evidence_readiness_items(category, state)" as never)
    .eq("organization_id" as never, input.organizationId)
    .order("calculated_at" as never, { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 250, 1), 500)) as unknown as Promise<{
      data: Array<Record<string, unknown>> | null;
      error: Error | null;
    }>;
}

export async function loadAdminFounderEvidenceReadinessSources(input: {
  organizationIds: string[];
  rowLimit?: number;
}) {
  if (!input.organizationIds.length) return { assessments: [], connections: [], contracts: [], history: [], files: [] };
  const client = admin();
  const limit = Math.min(Math.max(input.rowLimit ?? 1000, 1), 5000);
  const [assessments, connections, contracts, history] = await Promise.all([
    client.from("evidence_readiness_assessments" as never).select("*, evidence_readiness_items(category, state)" as never).in("organization_id" as never, input.organizationIds).order("calculated_at" as never, { ascending: false }).limit(limit),
    client.from("subscription_usage_provider_connections").select("organization_id, status, last_successful_sync_at").in("organization_id", input.organizationIds).limit(limit),
    client.from("contracts").select("id, organization_id, contract_metadata(notice_deadline_date, reviewed_at, needs_review, has_weak_evidence)").in("organization_id", input.organizationIds).eq("is_sample", false).limit(limit),
    client.from("evidence_readiness_history" as never).select("contract_id, readiness_state, calculated_at" as never).in("organization_id" as never, input.organizationIds).eq("readiness_state" as never, "decision_ready").order("calculated_at" as never, { ascending: true }).limit(limit)
  ]);
  const error = [assessments, connections, contracts, history].map((result) => result.error).find(Boolean);
  if (error) throw error;
  const contractIds = (contracts.data ?? []).map((row) => String((row as { id: string }).id));
  const files = contractIds.length
    ? await client.from("contract_files").select("contract_id, uploaded_at").in("contract_id", contractIds).order("uploaded_at", { ascending: true }).limit(limit)
    : { data: [], error: null };
  if (files.error) throw files.error;
  return {
    assessments: (assessments.data ?? []) as unknown as Array<Record<string, unknown>>,
    connections: (connections.data ?? []) as unknown as Array<Record<string, unknown>>,
    contracts: (contracts.data ?? []) as unknown as Array<Record<string, unknown>>,
    history: (history.data ?? []) as unknown as Array<Record<string, unknown>>,
    files: (files.data ?? []) as unknown as Array<Record<string, unknown>>
  };
}

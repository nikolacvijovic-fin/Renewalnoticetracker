import type { ContractFilter } from "@/lib/constants";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { ExportRow } from "@/lib/contracts/export";
import type { Database } from "@/lib/supabase/database.types";
import {
  calculateDashboardMetrics,
  filterContractsForDashboard,
  type DashboardContractRow
} from "@/lib/contracts/dashboard";
import { buildCounterpartyDirectoryRecords } from "@/lib/contracts/counterparty-summaries";
import {
  buildCapacityAlerts,
  buildCapacitySnapshotSummary,
  persistCapacitySnapshot
} from "@/lib/commercial/capacity-snapshot";
import {
  buildReadinessAlerts,
  buildReadinessSnapshotSummary,
  persistReadinessSnapshot
} from "@/lib/commercial/readiness-snapshot";
import {
  buildProfitabilitySnapshotDetails,
  calculateSupportEconomicsSnapshot
} from "@/lib/commercial/support-economics";
import { calculatePrivacyOperationsSnapshot } from "@/lib/commercial/privacy-operations";
import {
  buildOrganizationHealthDetails,
  calculateOrganizationHealthSnapshot,
  type OrganizationHealthSnapshot
} from "@/lib/commercial/organization-health";
import { getMonthlyRevenueForPlan, getTrackedContractLimit } from "@/lib/billing/policy";
import { summarizeWorkflowGuardrails } from "@/lib/contracts/workflow-guardrails";
import type { MetricAlertRecord, ScoreSummary, ReadinessKey, CapacityKey } from "@/lib/commercial/ops-metrics";
import { getAppConfig } from "@/lib/config";

export type OrganizationMember = {
  user_id: string;
  role: string;
  user: {
    id: string;
    full_name: string | null;
    notification_email: string | null;
    monthly_digest_enabled: boolean;
  } | null;
};

export type ContractFacets = {
  owners: Array<{ user_id: string; label: string }>;
  departments: string[];
  statusTags: string[];
};

export type CounterpartyRecord = {
  id: string;
  name: string;
  raw_counterparty_name: string;
  normalized_counterparty_name: string;
  contract_count: number;
  alias_names: string[];
  duplicate_suggestions: Array<{ id: string; raw_counterparty_name: string; score: number }>;
};

type ContractMetadataRow = Database["public"]["Tables"]["contract_metadata"]["Row"];
type ContractRow = Database["public"]["Tables"]["contracts"]["Row"];
type ContractFileRow = Database["public"]["Tables"]["contract_files"]["Row"];
type ReminderRow = Database["public"]["Tables"]["reminders"]["Row"];
type NoteRow = Database["public"]["Tables"]["notes"]["Row"];
type AuditLogRow = Database["public"]["Tables"]["audit_logs"]["Row"];
type RenewalDecisionRow = Database["public"]["Tables"]["renewal_decisions"]["Row"];
type PlaybookRunRow = Database["public"]["Tables"]["playbook_runs"]["Row"];
type ReminderRunRow = Database["public"]["Tables"]["reminder_runs"]["Row"];
type ExtractedFieldEvidenceRow = Database["public"]["Tables"]["extracted_field_evidence"]["Row"];
type ProcessingErrorRow = Database["public"]["Tables"]["processing_errors"]["Row"];
type ReadinessSnapshotRow = Database["public"]["Tables"]["readiness_snapshots"]["Row"];
type CapacitySnapshotRow = Database["public"]["Tables"]["capacity_snapshots"]["Row"];
type ProfitabilitySnapshotRow =
  Database["public"]["Tables"]["organization_profitability_snapshots"]["Row"];
type OrganizationHealthSnapshotRow =
  Database["public"]["Tables"]["organization_health_snapshots"]["Row"];
type DataExportRequestRow = Database["public"]["Tables"]["data_export_requests"]["Row"];
type OcrJobRow = Database["public"]["Tables"]["ocr_jobs"]["Row"];
const BACKGROUND_EXPORT_STALE_PROCESSING_MS = 60 * 60 * 1000;

type ContractDetailRecord = ContractRow & {
  contract_files: ContractFileRow[];
  contract_metadata: ContractMetadataRow | ContractMetadataRow[] | null;
  reminders: ReminderRow[];
  notes: NoteRow[];
  audit_logs: AuditLogRow[];
  renewal_decisions: RenewalDecisionRow[];
  playbook_runs: PlaybookRunRow[];
};

type ExportContractRow = Pick<ContractRow, "department" | "status_tag" | "owner_user_id"> & {
  contract_metadata:
    | Pick<
        ContractMetadataRow,
        | "contract_title"
        | "counterparty_name"
        | "contract_type"
        | "expiration_date"
        | "notice_deadline_date"
        | "auto_renewal"
        | "payment_terms"
        | "needs_review"
      >
    | Array<
        Pick<
          ContractMetadataRow,
          | "contract_title"
          | "counterparty_name"
          | "contract_type"
          | "expiration_date"
          | "notice_deadline_date"
          | "auto_renewal"
          | "payment_terms"
          | "needs_review"
        >
      >
    | null;
};

function firstMetadata<T>(metadata: T | T[] | null | undefined): T | null {
  if (Array.isArray(metadata)) {
    return metadata[0] ?? null;
  }

  return metadata ?? null;
}

function maskEmail(email: string | null) {
  if (!email) return null;
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "[redacted]";
  const visible = localPart.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(localPart.length - 2, 1))}@${domain}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getDiagnosticFromEvidence(
  value: unknown,
  fallback: { code: string | null; category: string | null }
) {
  const evidence = asRecord(value);
  return {
    diagnostic_code:
      typeof evidence.failure_code === "string" ? evidence.failure_code : fallback.code,
    diagnostic_category:
      typeof evidence.failure_category === "string"
        ? evidence.failure_category
        : fallback.category
  };
}

function getReminderDiagnostic(status: string | null) {
  if (status === "failed_terminal") {
    return {
      diagnostic_code: "ERR_REMINDER_TERMINAL_FAILURE_001",
      diagnostic_category: "reminder_terminal_failure"
    };
  }

  if (status === "retry_pending") {
    return {
      diagnostic_code: "ERR_REMINDER_RETRY_SCHEDULED_001",
      diagnostic_category: "reminder_retry_scheduled"
    };
  }

  return {
    diagnostic_code: null,
    diagnostic_category: null
  };
}

function getOcrDiagnostic(status: string | null) {
  if (status === "failed_terminal") {
    return {
      diagnostic_code: "ERR_OCR_JOB_TERMINAL_FAILURE_001",
      diagnostic_category: "ocr_job_terminal_failure"
    };
  }

  if (status === "retry_pending") {
    return {
      diagnostic_code: "ERR_OCR_JOB_RETRY_SCHEDULED_001",
      diagnostic_category: "ocr_job_retry_scheduled"
    };
  }

  return {
    diagnostic_code: null,
    diagnostic_category: null
  };
}

function toEvidenceDiagnosticFallback(input: {
  diagnostic_code: string | null;
  diagnostic_category: string | null;
}) {
  return {
    code: input.diagnostic_code,
    category: input.diagnostic_category
  };
}

function ageMinutes(value: string | null | undefined, now = new Date()) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 60000));
}

function oldestAgeMinutes<T>(
  rows: T[],
  getValue: (row: T) => string | null | undefined,
  now = new Date()
) {
  const ages = rows
    .map((row) => ageMinutes(getValue(row), now))
    .filter((age): age is number => typeof age === "number");
  return ages.length > 0 ? Math.max(...ages) : null;
}

async function readExactCount(
  query: PromiseLike<{ count: number | null; error: unknown | null }>
) {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function readBoundedRows<T>(
  query: PromiseLike<{ data: unknown[] | null; error: unknown | null }>
) {
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as T[];
}

function applyNullableOrganizationScope<T extends { eq: (column: string, value: string) => T; is: (column: string, value: null) => T }>(
  query: T,
  organizationId?: string | null
) {
  return organizationId ? query.eq("organization_id", organizationId) : query.is("organization_id", null);
}

export async function getDashboardMetrics(organizationId: string) {
  const contracts = await getContracts(organizationId, "all");
  return calculateDashboardMetrics(contracts);
}

export async function getOrganizationContractCount(organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { count, error } = await supabase
    .from("contracts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (error) throw error;
  return count ?? 0;
}

export async function getContracts(
  organizationId: string,
  filter: ContractFilter,
  options?: {
    ownerUserId?: string;
    department?: string;
    statusTag?: string;
  }
) {
  const supabase = createServerSupabaseClient();
  let query = supabase
    .from("contracts")
    .select(
      `
      id,
      status,
      cycle_status,
      status_tag,
      department,
      owner_user_id,
      counterparty_id,
      renewal_decision_status,
      created_at,
      contract_metadata (
        contract_title,
        counterparty_name,
        renewal_date,
        expiration_date,
        notice_deadline_date,
        termination_window,
        auto_renewal,
        needs_review,
        field_confidence
      )
    `
    )
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false });

  if (options?.ownerUserId) {
    query = query.eq("owner_user_id", options.ownerUserId);
  }

  if (options?.department) {
    query = query.eq("department", options.department);
  }

  if (options?.statusTag) {
    query = query.eq("status_tag", options.statusTag);
  }

  const { data, error } = await query;

  if (error) throw error;
  const rows = (data ?? []) as DashboardContractRow[];
  const members = await getOrganizationMembers(organizationId);
  const ownerMap = new Map(
    members.map((member) => [
      member.user_id,
      member.user?.full_name ?? member.user?.notification_email ?? "Unassigned"
    ])
  );

  return filterContractsForDashboard(rows, filter).map((row) => ({
    ...row,
    owner_name:
      (row as DashboardContractRow & { owner_user_id?: string | null }).owner_user_id
        ? ownerMap.get(
            (row as DashboardContractRow & { owner_user_id?: string | null }).owner_user_id ?? ""
          ) ?? "Unassigned"
        : "Unassigned"
  }));
}

export async function getContractFacets(organizationId: string): Promise<ContractFacets> {
  const [members, contracts] = await Promise.all([
    getOrganizationMembers(organizationId),
    createServerSupabaseClient()
      .from("contracts")
      .select("owner_user_id, department, status_tag")
      .eq("organization_id", organizationId)
  ]);

  if (contracts.error) throw contracts.error;

  const typedContracts = (contracts.data ?? []) as Array<{
    owner_user_id: string | null;
    department: string | null;
    status_tag: string | null;
  }>;

  const ownerLabels = new Map(
    members.map((member) => [
      member.user_id,
      member.user?.full_name ?? member.user?.notification_email ?? member.user_id
    ])
  );

  return {
    owners: Array.from(
      new Set(typedContracts.map((contract) => contract.owner_user_id).filter(Boolean))
    ).map((userId) => ({
      user_id: userId!,
      label: ownerLabels.get(userId!) ?? "Unknown owner"
    })),
    departments: Array.from(
      new Set(typedContracts.map((contract) => contract.department).filter(Boolean))
    ) as string[],
    statusTags: Array.from(
      new Set(typedContracts.map((contract) => contract.status_tag).filter(Boolean))
    ) as string[]
  };
}

export async function getContractById(contractId: string, organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contracts")
    .select(
      `
      *,
      contract_files (*),
      contract_metadata (*),
      reminders (*),
      notes (*),
      audit_logs (*),
      renewal_decisions (*),
      playbook_runs (*)
    `
    )
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .single();

  if (error) throw error;
  const typedData = data as ContractDetailRecord;
  const metadataId = Array.isArray(typedData.contract_metadata)
    ? typedData.contract_metadata[0]?.id
    : typedData.contract_metadata?.id;

  const [evidence, processingErrors] = await Promise.all([
    metadataId
      ? supabase
          .from("extracted_field_evidence")
          .select("*")
          .eq("contract_metadata_id", metadataId)
          .order("field_name")
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("processing_errors")
      .select("*")
      .eq("contract_id", contractId)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
  ]);

  if (evidence.error) throw evidence.error;
  if (processingErrors.error) throw processingErrors.error;

  return {
    ...typedData,
    extracted_field_evidence: (evidence.data ?? []) as ExtractedFieldEvidenceRow[],
    processing_errors: (processingErrors.data ?? []) as ProcessingErrorRow[]
  };
}

export async function requireScopedContract(contractId: string, organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contracts")
    .select("id, organization_id")
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new Error("Contract not found for active organization.");
  }

  return data;
}

export async function getScopedContractMetadataId(contractId: string, organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contracts")
    .select("contract_metadata(id)")
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;

  const metadata = data as
    | {
        contract_metadata:
          | { id: string }
          | Array<{ id: string }>
          | null;
      }
    | null;

  const metadataId = Array.isArray(metadata?.contract_metadata)
    ? metadata?.contract_metadata[0]?.id
    : metadata?.contract_metadata?.id;

  if (!metadataId) {
    throw new Error("Contract metadata not found for active organization.");
  }

  return metadataId;
}

export async function getOrganizationMembers(
  organizationId: string
): Promise<OrganizationMember[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, role, user:users(id, full_name, notification_email, monthly_digest_enabled)")
    .eq("organization_id", organizationId);

  if (error) throw error;

  return ((data ?? []) as Array<{
    user_id: string;
    role: string;
    user?: OrganizationMember["user"] | OrganizationMember["user"][];
    users?: OrganizationMember["user"] | OrganizationMember["user"][];
  }>).map((membership) => {
    const joinedUser = membership.user ?? membership.users ?? null;
    const user = Array.isArray(joinedUser) ? joinedUser[0] ?? null : joinedUser;
    return {
      user_id: membership.user_id,
      role: membership.role,
      user
    };
  });
}

export async function getOrganizationBilling(organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organizations")
    .select(
      "id, name, created_at, billing_email, plan_tier, subscription_status, subscription_current_period_end, billing_provider, billing_customer_id, billing_subscription_id, billing_plan_code, billing_price_id, billing_subscription_status, billing_current_period_end, slack_webhook_url, slack_channel, slack_fallback_channel, teams_webhook_url, teams_fallback_channel, trial_started_at, trial_ends_at, acquisition_source, acquisition_campaign"
    )
    .eq("id", organizationId)
    .single();

  if (error) throw error;

  if (!data.billing_subscription_status && data.subscription_status) {
    data.billing_subscription_status = data.subscription_status;
  }

  if (!data.billing_current_period_end && data.subscription_current_period_end) {
    data.billing_current_period_end = data.subscription_current_period_end;
  }

  return data;
}

export async function getSupportEconomicsSnapshot(organizationId: string) {
  const admin = createAdminSupabaseClient();
  const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const billing = await getOrganizationBilling(organizationId);
  const monthlyRecurringRevenue = getMonthlyRevenueForPlan(
    billing.plan_tier === "growth" || billing.plan_tier === "starter" ? billing.plan_tier : "free"
  );

  const [supportLogs, onboardingLogs, usageCosts, processingErrors, failedReminders, importJobs, contracts] =
    await Promise.all([
      admin
        .from("support_time_logs")
        .select("minutes_spent")
        .eq("organization_id", organizationId)
        .gte("created_at", last30d),
      admin
        .from("onboarding_time_logs")
        .select("minutes_spent")
        .eq("organization_id", organizationId)
        .gte("created_at", last30d),
      admin
        .from("cost_usage_logs")
        .select("estimated_cost, cost_category")
        .eq("organization_id", organizationId)
        .gte("captured_at", last30d),
      admin
        .from("processing_errors")
        .select("stage")
        .eq("organization_id", organizationId)
        .gte("created_at", last30d),
      admin
        .from("reminders")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "failed_terminal"),
      admin
        .from("import_jobs")
        .select("status")
        .eq("organization_id", organizationId)
        .gte("created_at", last30d),
      admin
        .from("contracts")
        .select("id, contract_metadata ( needs_review )")
        .eq("organization_id", organizationId)
    ]);

  const supportMinutes30d = (supportLogs.data ?? []).reduce(
    (sum, row) => sum + (row.minutes_spent ?? 0),
    0
  );
  const onboardingMinutes30d = (onboardingLogs.data ?? []).reduce(
    (sum, row) => sum + (row.minutes_spent ?? 0),
    0
  );
  const usageCost30d = (usageCosts.data ?? []).reduce(
    (sum, row) => sum + Number(row.estimated_cost ?? 0),
    0
  );
  const ocrCost30d = (usageCosts.data ?? [])
    .filter((row) => row.cost_category === "ocr")
    .reduce((sum, row) => sum + Number(row.estimated_cost ?? 0), 0);
  const importFailures30d = (importJobs.data ?? []).filter(
    (row) => row.status === "failed" || row.status === "completed_with_errors"
  ).length;
  const completedImports30d = (importJobs.data ?? []).filter(
    (row) => row.status === "completed" || row.status === "completed_with_errors"
  ).length;
  const extractionFailures30d = (processingErrors.data ?? []).filter(
    (row) => row.stage === "field_extraction" || row.stage === "text_extraction"
  ).length;
  const reviewedContracts = ((contracts.data ?? []) as Array<{
    contract_metadata:
      | { needs_review?: boolean | null }
      | Array<{ needs_review?: boolean | null }>
      | null;
  }>).filter((row) => {
    const metadata = Array.isArray(row.contract_metadata)
      ? row.contract_metadata[0]
      : row.contract_metadata;
    return metadata?.needs_review === false;
  }).length;

  const snapshot = calculateSupportEconomicsSnapshot({
    supportMinutes30d,
    onboardingMinutes30d,
    usageCost30d,
    ocrCost30d,
    monthlyRecurringRevenue,
    importFailures30d,
    completedImports30d,
    importsCompletedWithoutActivation: completedImports30d > 0 && reviewedContracts === 0,
    reminderFailures30d: failedReminders.count ?? 0,
    extractionFailures30d,
    missingSupportLogs: (supportLogs.data ?? []).length === 0,
    missingOnboardingLogs: (onboardingLogs.data ?? []).length === 0,
    missingUsageCostLogs: (usageCosts.data ?? []).length === 0
  });

  return snapshot;
}

export async function getOrganizationHealthSnapshot(
  organizationId: string
): Promise<OrganizationHealthSnapshot> {
  const admin = createAdminSupabaseClient();
  const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [billing, dashboardMetrics, contracts, supportEconomics, analyticsEvents, failedReminders, extractionFailures] =
    await Promise.all([
      getOrganizationBilling(organizationId),
      getDashboardMetrics(organizationId),
      getContracts(organizationId, "all"),
      getSupportEconomicsSnapshot(organizationId),
      admin
        .from("analytics_events")
        .select("event_name")
        .eq("organization_id", organizationId)
        .gte("event_timestamp", last30d),
      admin
        .from("reminders")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "failed_terminal"),
      admin
        .from("processing_errors")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .in("stage", ["field_extraction", "text_extraction", "ocr"])
    ]);

  const eventCounts = new Map<string, number>();
  for (const row of analyticsEvents.data ?? []) {
    eventCounts.set(row.event_name, (eventCounts.get(row.event_name) ?? 0) + 1);
  }

  const reviewedContracts = contracts.filter((contract) => contract.contract_metadata?.needs_review === false).length;
  const ownerAssignedContracts = contracts.filter((contract) => contract.owner_user_id).length;
  const decisionCount = contracts.filter(
    (contract) => (contract.renewal_decision_status ?? "undecided") !== "undecided"
  ).length;
  const contractLimit = getTrackedContractLimit(
    billing.plan_tier === "growth" || billing.plan_tier === "starter" ? billing.plan_tier : "free"
  );
  const guardrails = summarizeWorkflowGuardrails(
    contracts.map((contract) => ({
      id: contract.id ?? "",
      created_at: contract.created_at ?? new Date(0).toISOString(),
      owner_user_id: contract.owner_user_id ?? null,
      contract_metadata: contract.contract_metadata
        ? {
            expiration_date: contract.contract_metadata.expiration_date,
            notice_deadline_date: contract.contract_metadata.notice_deadline_date,
            needs_review: contract.contract_metadata.needs_review
          }
        : null
    }))
  );

  return calculateOrganizationHealthSnapshot({
    totalContracts: dashboardMetrics.totalContracts,
    reviewedContracts,
    ownerAssignedContracts,
    reminderCount: eventCounts.get("reminder_scheduled") ?? 0,
    decisionCount,
    contractLimit,
    supportMinutes30d: supportEconomics.supportMinutes30d,
    onboardingMinutes30d: supportEconomics.onboardingMinutes30d,
    ocrCost30d: supportEconomics.ocrCost30d,
    reminderFailures30d: failedReminders.count ?? 0,
    extractionFailures30d: extractionFailures.count ?? 0,
    repeatedReminderFailures: (failedReminders.count ?? 0) >= 3,
    repeatedExtractionFailures: (extractionFailures.count ?? 0) >= 3,
    checkoutStarted30d: eventCounts.get("billing_checkout_started") ?? 0,
    checkoutCompleted30d: eventCounts.get("checkout_completed") ?? 0,
    lowWorkflowRevisit: (eventCounts.get("contract_review_completed") ?? 0) <= 1,
    dueSoonNeedsReviewCount: guardrails.dueSoonNeedsReviewCount,
    dueSoonOwnerMissingCount: guardrails.dueSoonOwnerMissingCount,
    staleNeedsReviewCount: guardrails.staleNeedsReviewCount,
    missingSupportTelemetry: supportEconomics.missingTelemetry.includes("Support time logs are missing."),
    missingOnboardingTelemetry: supportEconomics.missingTelemetry.includes("Onboarding time logs are missing."),
    missingCostTelemetry: supportEconomics.missingTelemetry.includes("Usage cost logs are missing.")
  });
}

export async function persistOrganizationHealthSnapshot(organizationId: string) {
  const admin = createAdminSupabaseClient();
  const snapshot = await getOrganizationHealthSnapshot(organizationId);
  const { data, error } = await admin
    .from("organization_health_snapshots")
    .insert({
      organization_id: organizationId,
      activation_score: snapshot.activationScore,
      retention_score: snapshot.retentionScore,
      commercial_score: snapshot.commercialScore,
      support_burden_score: snapshot.supportBurdenScore,
      trust_score: snapshot.trustScore,
      overall_health_score: snapshot.overallHealthScore,
      status: snapshot.status,
      details_json: buildOrganizationHealthDetails(snapshot)
    })
    .select("*")
    .single();

  if (error) throw error;
  return { snapshot: data as OrganizationHealthSnapshotRow, summary: snapshot };
}

export async function persistOrganizationProfitabilitySnapshot(organizationId: string) {
  const admin = createAdminSupabaseClient();
  const snapshot = await getSupportEconomicsSnapshot(organizationId);
  const { data, error } = await admin
    .from("organization_profitability_snapshots")
    .insert({
      organization_id: organizationId,
      monthly_recurring_revenue: snapshot.monthlyRecurringRevenue,
      support_minutes_30d: snapshot.supportMinutes30d,
      onboarding_minutes_30d: snapshot.onboardingMinutes30d,
      estimated_usage_cost_30d: snapshot.usageCost30d,
      estimated_service_cost_30d: snapshot.estimatedServiceCost30d,
      contribution_margin_30d: snapshot.contributionMargin30d,
      margin_risk_status: snapshot.marginRiskStatus,
      details_json: buildProfitabilitySnapshotDetails(snapshot)
    })
    .select("*")
    .single();

  if (error) throw error;
  return { snapshot: data as ProfitabilitySnapshotRow, summary: snapshot };
}

export async function getPrivacyOperationsSnapshot(organizationId: string) {
  const admin = createAdminSupabaseClient();
  const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [exportRequests, deletionRequests, latestBackupCheck] = await Promise.all([
    admin
      .from("data_export_requests")
      .select("requested_at", { count: "exact" })
      .eq("organization_id", organizationId)
      .gte("requested_at", last30d)
      .order("requested_at", { ascending: false }),
    admin
      .from("deletion_requests")
      .select("requested_at, status", { count: "exact" })
      .eq("organization_id", organizationId)
      .order("requested_at", { ascending: false }),
    admin
      .from("backup_readiness_checks")
      .select("checked_at, status, restore_tested_at")
      .eq("environment", "production")
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  return calculatePrivacyOperationsSnapshot({
    exportRequests30d: exportRequests.count ?? 0,
    openDeletionRequests: (deletionRequests.data ?? []).filter((row) => row.status !== "completed").length,
    latestExportAt: exportRequests.data?.[0]?.requested_at ?? null,
    latestDeletionRequestAt: deletionRequests.data?.[0]?.requested_at ?? null,
    latestBackupCheckAt: latestBackupCheck.data?.checked_at ?? null,
    latestBackupStatus: latestBackupCheck.data?.status ?? null,
    latestRestoreTestedAt: latestBackupCheck.data?.restore_tested_at ?? null
  });
}

export async function getExportRows(organizationId: string): Promise<ExportRow[]> {
  const supabase = createServerSupabaseClient();
  const [contracts, members] = await Promise.all([
    supabase
      .from("contracts")
      .select(
        `
        id,
        department,
        status_tag,
        owner_user_id,
        contract_metadata (
          contract_title,
          counterparty_name,
          contract_type,
          expiration_date,
          notice_deadline_date,
          auto_renewal,
          payment_terms,
          needs_review
        )
      `
      )
      .eq("organization_id", organizationId),
    getOrganizationMembers(organizationId)
  ]);

  if (contracts.error) throw contracts.error;

  const ownerMap = new Map(
    members.map((member) => {
      return [
        member.user_id,
        member.user?.full_name ?? member.user?.notification_email ?? "Unassigned"
      ] as const;
    })
  );

  return ((contracts.data ?? []) as ExportContractRow[]).map((contract) => {
    const metadata = firstMetadata(contract.contract_metadata);

    return {
      contract_title: metadata?.contract_title ?? "",
      counterparty_name: metadata?.counterparty_name ?? "",
      contract_type: metadata?.contract_type ?? "",
      owner_name: ownerMap.get(contract.owner_user_id ?? "") ?? "Unassigned",
      department: contract.department ?? "",
      status_tag: contract.status_tag,
      expiration_date: metadata?.expiration_date ?? "",
      notice_deadline_date: metadata?.notice_deadline_date ?? "",
      auto_renewal: metadata?.auto_renewal ? "Yes" : "No",
      payment_terms: metadata?.payment_terms ?? "",
      needs_review: metadata?.needs_review ? "Yes" : "No"
    };
  });
}

export async function getCounterparties(organizationId: string): Promise<CounterpartyRecord[]> {
  const supabase = createServerSupabaseClient();
  const [counterparties, aliases, contracts] = await Promise.all([
    supabase
      .from("counterparties")
      .select("id, name, raw_counterparty_name, normalized_counterparty_name, merged_into_counterparty_id")
      .eq("organization_id", organizationId)
      .order("raw_counterparty_name"),
    supabase
      .from("counterparty_aliases")
      .select("counterparty_id, alias_name")
      .eq("organization_id", organizationId),
    supabase.from("contracts").select("counterparty_id").eq("organization_id", organizationId)
  ]);

  if (counterparties.error) throw counterparties.error;
  if (aliases.error) throw aliases.error;
  if (contracts.error) throw contracts.error;

  return buildCounterpartyDirectoryRecords({
    counterparties: (counterparties.data ?? []) as Parameters<
      typeof buildCounterpartyDirectoryRecords
    >[0]["counterparties"],
    aliases: (aliases.data ?? []) as Parameters<typeof buildCounterpartyDirectoryRecords>[0]["aliases"],
    contracts: (contracts.data ?? []) as Parameters<typeof buildCounterpartyDirectoryRecords>[0]["contracts"]
  });
}

export async function getTemplates(organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contract_templates")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export async function getPlaybooks(organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("playbooks")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export async function getContractCalendarEvents(contractId: string, organizationId: string) {
  const contract = await getContractById(contractId, organizationId);
  const metadata = firstMetadata(contract.contract_metadata);
  return (contract.reminders ?? []).map(
    (reminder: {
      id: string;
      remind_at: string;
      reminder_type: string;
      recipient_email: string;
      escalation_level?: number;
    }) => ({
      uid: reminder.id,
      start: reminder.remind_at,
      summary: `${metadata?.contract_title ?? "Contract"} ${reminder.reminder_type.replace("_", " ")}`,
      description: `Reminder for ${reminder.recipient_email}${reminder.escalation_level ? ` (escalation ${reminder.escalation_level})` : ""}`
    })
  );
}

export async function getAdminOperationalSnapshot(organizationId: string) {
  const supabase = createServerSupabaseClient();
  const now = new Date();
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const operationsConfig = getAppConfig().operations;
  const staleReminderBefore = new Date(
    now.getTime() - operationsConfig.reminderProcessingLeaseMinutes * 60 * 1000
  ).toISOString();
  const staleOcrBefore = new Date(
    now.getTime() - operationsConfig.ocrProcessingLeaseMinutes * 60 * 1000
  ).toISOString();
  const staleExportBefore = new Date(now.getTime() - BACKGROUND_EXPORT_STALE_PROCESSING_MS).toISOString();
  const reminderStatuses = [
    "pending",
    "retry_pending",
    "processing",
    "sent",
    "failed_terminal",
    "cancelled"
  ];
  const exportStatuses = ["queued", "processing", "completed", "failed", "expired"];
  const ocrStatuses = ["pending", "retry_pending", "processing", "completed", "failed_terminal"];

  const [
    totalContracts,
    totalReminders,
    sentLast7Days,
    sentLast30Days,
    staleProcessingReminders,
    failedNotifications,
    duplicateSuppressedNotifications,
    contractsNeedingReview,
    extractionFailureCount,
    retryScheduledRuns,
    terminalFailureRuns,
    staleProcessingExports,
    staleProcessingOcrJobs,
    recentFailedReminderJobs,
    recentNotificationAttempts,
    exportProcessingRows,
    exportQueuedRows,
    ocrProcessingRows,
    ocrQueuedRows,
    reminderStatusEntries,
    exportStatusEntries,
    ocrStatusEntries
  ] = await Promise.all([
    readExactCount(
      supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
    ),
    readExactCount(
      supabase
        .from("reminders")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
    ),
    readExactCount(
      supabase
        .from("reminders")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "sent")
        .gte("sent_at", last7)
    ),
    readExactCount(
      supabase
        .from("reminders")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "sent")
        .gte("sent_at", last30)
    ),
    readExactCount(
      supabase
        .from("reminders")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "processing")
        .lt("processing_started_at", staleReminderBefore)
    ),
    readExactCount(
      supabase
        .from("notification_logs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "failed")
    ),
    readExactCount(
      supabase
        .from("notification_logs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "duplicate_suppressed")
    ),
    readExactCount(
      supabase
        .from("contracts")
        .select("id, contract_metadata!inner(needs_review)", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("contract_metadata.needs_review", true)
    ),
    readExactCount(
      supabase
        .from("processing_errors")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .in("stage", ["text_extraction", "field_extraction", "upload", "ocr"])
    ),
    readExactCount(
      supabase
        .from("reminder_runs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "retry_pending")
    ),
    readExactCount(
      supabase
        .from("reminder_runs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "failed_terminal")
    ),
    readExactCount(
      supabase
        .from("data_export_requests")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("export_scope", "contracts")
        .eq("status", "processing")
        .lt("evidence_json->>processing_started_at", staleExportBefore)
    ),
    readExactCount(
      supabase
        .from("ocr_jobs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "processing")
        .lt("started_at", staleOcrBefore)
    ),
    readBoundedRows<{ status: string; sent_at: string | null }>(
      supabase
        .from("reminders")
        .select("id, status, sent_at")
        .eq("organization_id", organizationId)
        .eq("status", "failed_terminal")
        .order("created_at", { ascending: false })
        .limit(10)
    ),
    readBoundedRows<{ status: string; sent_at: string | null }>(
      supabase
        .from("notification_logs")
        .select("id, status, channel, sent_at")
        .eq("organization_id", organizationId)
        .order("sent_at", { ascending: false })
        .limit(15)
    ),
    readBoundedRows<Pick<DataExportRequestRow, "status" | "requested_at" | "evidence_json">>(
      supabase
        .from("data_export_requests")
        .select("id, status, requested_at, evidence_json")
        .eq("organization_id", organizationId)
        .eq("export_scope", "contracts")
        .eq("status", "processing")
        .order("requested_at", { ascending: true })
        .limit(25)
    ),
    readBoundedRows<Pick<DataExportRequestRow, "status" | "requested_at">>(
      supabase
        .from("data_export_requests")
        .select("id, status, requested_at")
        .eq("organization_id", organizationId)
        .eq("export_scope", "contracts")
        .eq("status", "queued")
        .order("requested_at", { ascending: true })
        .limit(1)
    ),
    readBoundedRows<Pick<OcrJobRow, "status" | "started_at">>(
      supabase
        .from("ocr_jobs")
        .select("id, status, started_at")
        .eq("organization_id", organizationId)
        .eq("status", "processing")
        .order("started_at", { ascending: true })
        .limit(1)
    ),
    readBoundedRows<Pick<OcrJobRow, "status" | "queued_at">>(
      supabase
        .from("ocr_jobs")
        .select("id, status, queued_at")
        .eq("organization_id", organizationId)
        .in("status", ["pending", "retry_pending"])
        .order("queued_at", { ascending: true })
        .limit(1)
    ),
    Promise.all(
      reminderStatuses.map(async (status) => [
        status,
        await readExactCount(
          supabase
            .from("reminders")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .eq("status", status)
        )
      ] as const)
    ),
    Promise.all(
      exportStatuses.map(async (status) => [
        status,
        await readExactCount(
          supabase
            .from("data_export_requests")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .eq("export_scope", "contracts")
            .eq("status", status)
        )
      ] as const)
    ),
    Promise.all(
      ocrStatuses.map(async (status) => [
        status,
        await readExactCount(
          supabase
            .from("ocr_jobs")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .eq("status", status)
        )
      ] as const)
    )
  ]);

  const statusCounts = Object.fromEntries(reminderStatusEntries);
  const exportStatusCounts = Object.fromEntries(exportStatusEntries);
  const ocrStatusCounts = Object.fromEntries(ocrStatusEntries);

  return {
    totalContracts,
    totalReminders,
    sentLast7Days,
    sentLast30Days,
    failedReminders: statusCounts.failed_terminal ?? 0,
    retryPendingReminders: statusCounts.retry_pending ?? 0,
    processingReminders: statusCounts.processing ?? 0,
    staleProcessingReminders,
    cancelledReminders: statusCounts.cancelled ?? 0,
    failedNotifications,
    duplicateSuppressedNotifications,
    contractsNeedingReview,
    extractionFailureCount,
    retryScheduledRuns,
    terminalFailureRuns,
    topReminderStatuses: Object.entries(statusCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) as Array<[string, number]>,
    recentFailedReminderJobs,
    recentNotificationAttempts,
    exportJobHealth: {
      queued: exportStatusCounts.queued ?? 0,
      processing: exportStatusCounts.processing ?? 0,
      completed: exportStatusCounts.completed ?? 0,
      failed: exportStatusCounts.failed ?? 0,
      expired: exportStatusCounts.expired ?? 0,
      staleProcessing: staleProcessingExports,
      oldestQueuedAgeMinutes: oldestAgeMinutes(
        exportQueuedRows,
        (row) => row.requested_at,
        now
      ),
      oldestProcessingAgeMinutes: oldestAgeMinutes(
        exportProcessingRows,
        (row) => asRecord(row.evidence_json).processing_started_at as string | null | undefined,
        now
      )
    },
    ocrJobHealth: {
      queued: ocrStatusCounts.pending ?? 0,
      processing: ocrStatusCounts.processing ?? 0,
      retryPending: ocrStatusCounts.retry_pending ?? 0,
      completed: ocrStatusCounts.completed ?? 0,
      failedTerminal: ocrStatusCounts.failed_terminal ?? 0,
      staleProcessing: staleProcessingOcrJobs,
      oldestQueuedAgeMinutes: oldestAgeMinutes(
        ocrQueuedRows,
        (row) => row.queued_at,
        now
      ),
      oldestProcessingAgeMinutes: oldestAgeMinutes(
        ocrProcessingRows,
        (row) => row.started_at,
        now
      )
    }
  };
}

export async function getAdminDebugData(organizationId: string) {
  const supabase = createServerSupabaseClient();
  const [
    failedReminders,
    notificationLogs,
    extractionFailures,
    importJobs,
    reminderRuns,
    backgroundExports,
    ocrJobs
  ] = await Promise.all([
    supabase
      .from("reminders")
      .select("id, contract_id, status, attempt_count, next_retry_at, created_at")
      .eq("organization_id", organizationId)
      .in("status", ["retry_pending", "failed_terminal"])
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("notification_logs")
      .select("id, reminder_id, channel, status, recipient_email, destination, sent_at")
      .eq("organization_id", organizationId)
      .order("sent_at", { ascending: false })
      .limit(30),
    supabase
      .from("processing_errors")
      .select("id, contract_id, stage, details, created_at")
      .eq("organization_id", organizationId)
      .in("stage", ["text_extraction", "field_extraction", "upload"])
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("import_jobs")
      .select("id, file_name, status, error_report_json, created_at, row_count, imported_count")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("reminder_runs")
      .select("id, reminder_id, status, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("data_export_requests")
      .select("id, status, format, requested_at, completed_at, evidence_json")
      .eq("organization_id", organizationId)
      .eq("export_scope", "contracts")
      .order("requested_at", { ascending: false })
      .limit(15),
    supabase
      .from("ocr_jobs")
      .select("id, contract_id, status, attempts, queued_at, started_at, completed_at, details_json")
      .eq("organization_id", organizationId)
      .order("queued_at", { ascending: false })
      .limit(10)
  ]);

  return {
    failedReminders: (failedReminders.data ?? []).map((reminder) => ({
      id: reminder.id,
      contract_id: reminder.contract_id,
      status: reminder.status,
      attempt_count: reminder.attempt_count,
      next_retry_at: reminder.next_retry_at,
      created_at: reminder.created_at,
      ...getReminderDiagnostic(reminder.status)
    })),
    notificationLogs: (notificationLogs.data ?? []).map((log) => ({
      id: log.id,
      reminder_id: log.reminder_id,
      channel: log.channel,
      status: log.status,
      recipient_email: maskEmail(log.recipient_email) ?? "[redacted]",
      destination: log.destination,
      sent_at: log.sent_at,
      diagnostic_code:
        log.status === "failed" ? "ERR_NOTIFICATION_DELIVERY_FAILED_001" : null,
      diagnostic_category:
        log.status === "failed" ? "notification_delivery_failed" : null
    })),
    extractionFailures: (extractionFailures.data ?? []).map((failure) => ({
      id: failure.id,
      contract_id: failure.contract_id,
      stage: failure.stage,
      created_at: failure.created_at,
      ...getDiagnosticFromEvidence(failure.details, {
        code: `ERR_${String(failure.stage).toUpperCase()}_FAILED_001`,
        category: `${failure.stage}_failed`
      })
    })),
    reminderRuns: ((reminderRuns.data ?? []) as ReminderRunRow[]).map((run) => ({
      id: run.id,
      reminder_id: run.reminder_id,
      status: run.status,
      created_at: run.created_at,
      ...getReminderDiagnostic(run.status)
    })),
    backgroundExports: ((backgroundExports.data ?? []) as DataExportRequestRow[]).map((row) => {
      const evidence = asRecord(row.evidence_json);
      return {
        id: row.id,
        status: row.status,
        format: row.format,
        requested_at: row.requested_at,
        completed_at: row.completed_at,
        export_preset: evidence.export_preset ?? null,
        row_count: evidence.row_count ?? 0,
        page_count: evidence.page_count ?? null,
        failure_code: evidence.failure_code ?? null,
        failure_category: evidence.failure_category ?? null
      };
    }),
    ocrJobs: ((ocrJobs.data ?? []) as OcrJobRow[]).map((job) => ({
      id: job.id,
      contract_id: job.contract_id,
      status: job.status,
      attempts: job.attempts,
      queued_at: job.queued_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
      ...getDiagnosticFromEvidence(
        job.details_json,
        toEvidenceDiagnosticFallback(getOcrDiagnostic(job.status))
      )
    })),
    importJobs: (importJobs.data ?? []).map((job) => ({
      id: job.id,
      file_name: job.file_name,
      status: job.status,
      created_at: job.created_at,
      row_count: job.row_count,
      imported_count: job.imported_count,
      ...getDiagnosticFromEvidence(job.error_report_json, {
        code:
          job.status === "failed" || job.status === "completed_with_errors"
            ? "ERR_IMPORT_JOB_NEEDS_RESCUE_001"
            : null,
        category:
          job.status === "failed" || job.status === "completed_with_errors"
            ? "import_job_needs_rescue"
            : null
      })
    }))
  };
}

export async function getLatestReadinessSnapshot(organizationId?: string | null) {
  const supabase = createServerSupabaseClient();
  const query = applyNullableOrganizationScope(
    supabase.from("readiness_snapshots").select("*"),
    organizationId
  )
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await query;
  if (error) throw error;
  return data as ReadinessSnapshotRow | null;
}

export async function getLatestCapacitySnapshot(organizationId?: string | null) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await applyNullableOrganizationScope(
    supabase.from("capacity_snapshots").select("*"),
    organizationId
  )
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as CapacitySnapshotRow | null;
}

export async function getReadinessTrend(organizationId?: string | null, days = 7) {
  const supabase = createServerSupabaseClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await applyNullableOrganizationScope(
    supabase.from("readiness_snapshots").select("calculated_at, overall_score, confidence_score"),
    organizationId
  )
    .gte("calculated_at", since)
    .order("calculated_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getCapacityTrend(organizationId?: string | null, hoursOrDays = 24) {
  const supabase = createServerSupabaseClient();
  const since = new Date(Date.now() - hoursOrDays * 60 * 60 * 1000).toISOString();
  const { data, error } = await applyNullableOrganizationScope(
    supabase.from("capacity_snapshots").select("calculated_at, overall_capacity_percent, confidence_score"),
    organizationId
  )
    .gte("calculated_at", since)
    .order("calculated_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getMetricAlerts(organizationId?: string | null) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await applyNullableOrganizationScope(
    supabase.from("metric_alerts").select("*").eq("status", "open"),
    organizationId
  )
    .order("opened_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as MetricAlertRecord[];
}

export async function buildReadinessSnapshot(organizationId?: string | null): Promise<ScoreSummary<ReadinessKey, string>> {
  return buildReadinessSnapshotSummary(organizationId);
}

export async function buildCapacitySnapshot(organizationId?: string | null): Promise<ScoreSummary<CapacityKey, string>> {
  return buildCapacitySnapshotSummary(organizationId);
}

function snapshotHasMatchingJobKey(
  snapshot: { calculated_at: string; details_json: unknown } | null,
  jobKey?: string | null
) {
  if (!snapshot || !jobKey) return false;
  const details = (snapshot.details_json ?? {}) as Record<string, unknown>;
  if (details.job_key !== jobKey) return false;

  const snapshotAgeMs = Date.now() - new Date(snapshot.calculated_at).getTime();
  return snapshotAgeMs <= 15 * 60 * 1000;
}

export async function refreshOperationalSnapshots(
  organizationId?: string | null,
  options?: { jobKey?: string | null }
) {
  const admin = createAdminSupabaseClient();
  const [latestReadiness, latestCapacity] = await Promise.all([
    getLatestReadinessSnapshot(organizationId),
    getLatestCapacitySnapshot(organizationId)
  ]);

  const reused =
    snapshotHasMatchingJobKey(latestReadiness, options?.jobKey) &&
    snapshotHasMatchingJobKey(latestCapacity, options?.jobKey);

  const [readinessSummary, capacitySummary] = reused
    ? await Promise.all([
        buildReadinessSnapshotSummary(organizationId),
        buildCapacitySnapshotSummary(organizationId)
      ])
    : await Promise.all([
        persistReadinessSnapshot(organizationId, { jobKey: options?.jobKey }).then(
          ({ summary }) => summary
        ),
        persistCapacitySnapshot(organizationId, { jobKey: options?.jobKey }).then(
          ({ summary }) => summary
        )
      ]);

  const alertPayloads = [...buildReadinessAlerts(readinessSummary), ...buildCapacityAlerts(capacitySummary)];

  for (const payload of alertPayloads) {
    const { data: existing } = await applyNullableOrganizationScope(
      admin
        .from("metric_alerts")
        .select("id")
        .eq("status", "open")
        .eq("metric_key", payload.metric_key),
      organizationId
    ).maybeSingle();

    if (!existing?.id) {
      await admin.from("metric_alerts").insert({
        organization_id: organizationId ?? null,
        metric_key: payload.metric_key,
        severity: payload.severity,
        status: "open",
        evidence_json: payload.evidence_json
      });
    } else {
      await admin
        .from("metric_alerts")
        .update({ severity: payload.severity, evidence_json: payload.evidence_json })
        .eq("id", existing.id);
    }
  }

  const openAlerts = await applyNullableOrganizationScope(
    admin.from("metric_alerts").select("id, metric_key").eq("status", "open"),
    organizationId
  );

  const nextKeys = new Set(alertPayloads.map((alert) => alert.metric_key));
  for (const openAlert of openAlerts.data ?? []) {
    if (!nextKeys.has(openAlert.metric_key as (typeof alertPayloads)[number]["metric_key"])) {
      await admin
        .from("metric_alerts")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", openAlert.id);
    }
  }

  return {
    readiness: readinessSummary,
    capacity: capacitySummary,
    alerts: await getMetricAlerts(organizationId),
    reused
  };
}

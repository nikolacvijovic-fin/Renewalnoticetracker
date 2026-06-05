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

function summarizeError(message: string | null) {
  if (!message) return null;
  return message.length > 160 ? `${message.slice(0, 157)}...` : message;
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

  const [contracts, reminders, notifications, extractionFailures, reminderRuns] = await Promise.all([
    supabase
      .from("contracts")
      .select("id, status_tag", { count: "exact" })
      .eq("organization_id", organizationId),
    supabase
      .from("reminders")
      .select("id, status, last_error, created_at, sent_at", { count: "exact" })
      .eq("organization_id", organizationId),
    supabase
      .from("notification_logs")
      .select("id, status, channel, sent_at", { count: "exact" })
      .eq("organization_id", organizationId),
    supabase
      .from("processing_errors")
      .select("id, stage, error_message, created_at")
      .eq("organization_id", organizationId),
    supabase
      .from("reminder_runs")
      .select("id, status, error_message, created_at", { count: "exact" })
      .eq("organization_id", organizationId)
  ]);

  const reminderRows = (reminders.data ?? []) as Array<{ status: string; sent_at: string | null }>;
  const notificationRows = (notifications.data ?? []) as Array<{ status: string; sent_at: string | null }>;
  const reminderRunRows = (reminderRuns.data ?? []) as Array<{
    status: string;
    created_at: string;
    error_message: string | null;
  }>;

  const statusCounts = reminderRows.reduce((acc: Record<string, number>, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  return {
    totalContracts: contracts.count ?? 0,
    totalReminders: reminders.count ?? 0,
    sentLast7Days: reminderRows.filter((row) => row.sent_at && row.sent_at >= last7).length,
    sentLast30Days: reminderRows.filter((row) => row.sent_at && row.sent_at >= last30).length,
    failedReminders: reminderRows.filter((row) => row.status === "failed_terminal").length,
    retryPendingReminders: reminderRows.filter((row) => row.status === "retry_pending").length,
    processingReminders: reminderRows.filter((row) => row.status === "processing").length,
    cancelledReminders: reminderRows.filter((row) => row.status === "cancelled").length,
    failedNotifications: notificationRows.filter((row) => row.status === "failed").length,
    duplicateSuppressedNotifications: notificationRows.filter((row) => row.status === "duplicate_suppressed").length,
    contractsNeedingReview: (await getDashboardMetrics(organizationId)).needsReview,
    extractionFailureCount: extractionFailures.data?.length ?? 0,
    retryScheduledRuns: reminderRunRows.filter((row) => row.status === "retry_pending").length,
    terminalFailureRuns: reminderRunRows.filter((row) => row.status === "failed_terminal").length,
    topReminderStatuses: Object.entries(statusCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) as Array<[string, number]>,
    recentFailedReminderJobs: reminderRows.filter((row) => row.status === "failed_terminal").slice(0, 10),
    recentNotificationAttempts: notificationRows.slice(0, 15)
  };
}

export async function getAdminDebugData(organizationId: string) {
  const supabase = createServerSupabaseClient();
  const [failedReminders, notificationLogs, extractionFailures, importJobs, reminderRuns] = await Promise.all([
    supabase
      .from("reminders")
      .select("id, contract_id, status, last_error, attempt_count, next_retry_at, created_at")
      .eq("organization_id", organizationId)
      .in("status", ["retry_pending", "failed_terminal"])
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("notification_logs")
      .select("id, reminder_id, channel, status, recipient_email, destination, error_message, sent_at")
      .eq("organization_id", organizationId)
      .order("sent_at", { ascending: false })
      .limit(30),
    supabase
      .from("processing_errors")
      .select("id, contract_id, stage, error_message, created_at")
      .eq("organization_id", organizationId)
      .in("stage", ["text_extraction", "field_extraction", "upload"])
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("import_jobs")
      .select("id, file_name, status, error_message, created_at, row_count, imported_count")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("reminder_runs")
      .select("id, reminder_id, status, error_message, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(10)
  ]);

  return {
    failedReminders: (failedReminders.data ?? []).map((reminder) => ({
      ...reminder,
      last_error: summarizeError(reminder.last_error)
    })),
    notificationLogs: (notificationLogs.data ?? []).map((log) => ({
      ...log,
      recipient_email: maskEmail(log.recipient_email) ?? "[redacted]",
      error_message: summarizeError(log.error_message)
    })),
    extractionFailures: (extractionFailures.data ?? []).map((failure) => ({
      ...failure,
      error_message: summarizeError(failure.error_message) ?? "Processing failed"
    })),
    reminderRuns: ((reminderRuns.data ?? []) as ReminderRunRow[]).map((run) => ({
      ...run,
      error_message: summarizeError(run.error_message)
    })),
    importJobs: (importJobs.data ?? []) as Array<{
      id: string;
      file_name: string;
      status: string;
      error_message: string | null;
      created_at: string;
      row_count: number;
      imported_count: number;
    }>
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

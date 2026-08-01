import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import {
  daysUntilOptOut,
  deriveSaasOptOutWorkflowStatus,
  detectSaasContractMetadataConflicts,
  explainSaasTrustedValue,
  getOptOutDeadlineWindow,
  getOptOutUrgency,
  resolveSaasTrustedField,
  type ResolvedSaasTrustedField,
  type SaasConflictField,
  type SaasConflictResolutionInput,
  type OptOutDeadlineWindow,
  type OptOutUrgency,
  type SaasMetadataConflict,
  type SaasOptOutWorkflowStatus
} from "@/lib/saas/renewal-defense";
import type {
  NormalizedSaasRenewalImportRow,
  SaasRenewalImportCleanupIssue
} from "@/lib/saas/import-cleanup";

export type SaasSoftwareRow =
  Database["public"]["Tables"]["saas_software_inventory"]["Row"];
export type SaasContractTermRow =
  Database["public"]["Tables"]["saas_contract_terms"]["Row"];
export type SaasOptOutWindowRow =
  Database["public"]["Tables"]["saas_opt_out_windows"]["Row"];
export type SaasRiskFindingRow =
  Database["public"]["Tables"]["saas_contract_risk_findings"]["Row"];
export type SaasRenewalImportBatchRow =
  Database["public"]["Tables"]["saas_renewal_import_batches"]["Row"];
export type SaasRenewalImportQueueRow =
  Database["public"]["Tables"]["saas_renewal_import_rows"]["Row"];
export type SaasMetadataConflictResolutionRow =
  Database["public"]["Tables"]["saas_contract_metadata_conflict_resolutions"]["Row"];

export type SaasOptOutClockItem = {
  software: SaasSoftwareRow;
  latestTerm: SaasContractTermRow | null;
  optOutWindow: SaasOptOutWindowRow | null;
  openFindings: SaasRiskFindingRow[];
  ownerUserId: string | null;
  linkedContractOwnerUserId: string | null;
  ownerLabel: string;
  workflowStatus: SaasOptOutWorkflowStatus;
  nextAction: string | null;
  nextActionDueAt: string | null;
  effectiveOptOutDeadline: string | null;
  daysUntilOptOut: number | null;
  urgency: OptOutUrgency | null;
  deadlineWindow: OptOutDeadlineWindow;
  spendAtRiskAmount: number;
  spendAtRiskCurrency: string | null;
  contractId: string | null;
  metadataConflicts: SaasMetadataConflict[];
  resolvedMetadataConflicts: ResolvedSaasTrustedField[];
  trustedValueDetails: ResolvedSaasTrustedField[];
  trustedValueExplanations: string[];
};

export type SaasOptOutClock = {
  items: SaasOptOutClockItem[];
  metrics: {
    softwareCount: number;
    openWindowCount: number;
    expiredCount: number;
    criticalCount: number;
    highCount: number;
    missingNoticeDeadlineCount: number;
    autoRenewalFindingCount: number;
    dueIn7DaysCount: number;
    dueIn30DaysCount: number;
    dueIn60DaysCount: number;
    assignedOwnerCount: number;
    unassignedOwnerCount: number;
    spendAtRiskAmount: number;
    spendAtRiskCurrency: string | null;
  };
};

export type SaasContractOptOutStatus = {
  softwareName: string;
  optOutDeadline: string | null;
  urgency: OptOutUrgency | null;
  deadlineWindow: OptOutDeadlineWindow;
  workflowStatus: SaasOptOutWorkflowStatus;
  ownerLabel: string;
  nextAction: string | null;
  spendAtRiskAmount: number;
  spendAtRiskCurrency: string | null;
  openFindingCount: number;
  metadataConflictCount: number;
  trustedValueDetails: ResolvedSaasTrustedField[];
  trustedValueExplanations: string[];
};

export type SaasRenewalImportReviewRow = SaasRenewalImportQueueRow & {
  normalized: NormalizedSaasRenewalImportRow | null;
  issues: SaasRenewalImportCleanupIssue[];
};

export type SaasRenewalImportReviewBatch = SaasRenewalImportBatchRow & {
  rows: SaasRenewalImportReviewRow[];
};

type ContractMetadataForConflict = {
  contract_title: string | null;
  renewal_date: string | null;
  expiration_date: string | null;
  notice_deadline_date: string | null;
  auto_renewal: boolean | null;
  contract_value_amount: number | null;
  contract_value_currency: string | null;
};

type LinkedContractRow = {
  id: string;
  owner_user_id: string | null;
  contract_metadata: ContractMetadataForConflict | ContractMetadataForConflict[] | null;
};

function latestByCreatedAt<T extends { created_at: string }>(rows: T[]) {
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function memberLabels(
  rows: Array<{ user_id: string; users?: { full_name?: string | null; notification_email?: string | null } | null }>
) {
  return new Map(rows.map((member) => [
    member.user_id,
    member.users?.full_name ?? member.users?.notification_email ?? member.user_id
  ]));
}

function resolutionInputFromRow(
  row: SaasMetadataConflictResolutionRow,
  labelsByUserId: Map<string, string>
): SaasConflictResolutionInput {
  return {
    fieldName: row.field_name as SaasConflictField,
    trustedSource: row.trusted_source as SaasConflictResolutionInput["trustedSource"],
    manualOverride: row.manual_override_json as string | number | boolean | null,
    resolutionReason: row.resolution_reason,
    resolvedByUserId: row.resolved_by_user_id,
    resolvedByLabel: row.resolved_by_user_id ? labelsByUserId.get(row.resolved_by_user_id) ?? row.resolved_by_user_id : null,
    resolvedAt: row.resolved_at,
    reopenedAt: row.reopened_at
  };
}

function trustedScalar(
  trustedValues: Map<SaasConflictField, ResolvedSaasTrustedField>,
  field: SaasConflictField
) {
  return trustedValues.get(field)?.effectiveValue ?? null;
}

export async function requireScopedSaasSoftware(softwareId: string, organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("saas_software_inventory")
    .select("id, organization_id, owner_user_id")
    .eq("id", softwareId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new Error("SaaS software record not found for active organization.");
  }

  return data;
}

export async function getSaasOptOutClock(organizationId: string): Promise<SaasOptOutClock> {
  const supabase = createServerSupabaseClient();
  const [softwareResult, termsResult, windowsResult, findingsResult, membersResult] = await Promise.all([
    supabase
      .from("saas_software_inventory")
      .select("*")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("saas_contract_terms")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("saas_opt_out_windows")
      .select("*")
      .eq("organization_id", organizationId)
      .in("status", ["open", "expired"])
      .order("opt_out_deadline", { ascending: true }),
    supabase
      .from("saas_contract_risk_findings")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    supabase
      .from("memberships")
      .select("user_id, users(full_name, notification_email)")
      .eq("organization_id", organizationId)
  ]);

  for (const result of [softwareResult, termsResult, windowsResult, findingsResult, membersResult]) {
    if (result.error) throw result.error;
  }

  const terms = (termsResult.data ?? []) as SaasContractTermRow[];
  const contractIds = Array.from(new Set(terms.map((term) => term.contract_id).filter((id): id is string => Boolean(id))));
  const termIds = terms.map((term) => term.id);
  const linkedContractsResult = contractIds.length
    ? await supabase
        .from("contracts")
        .select(`
          id,
          owner_user_id,
          contract_metadata (
            contract_title,
            renewal_date,
            expiration_date,
            notice_deadline_date,
            auto_renewal,
            contract_value_amount,
            contract_value_currency
          )
        `)
        .eq("organization_id", organizationId)
        .in("id", contractIds)
    : { data: [], error: null };

  if (linkedContractsResult.error) throw linkedContractsResult.error;
  const resolutionsResult = termIds.length
    ? await supabase
        .from("saas_contract_metadata_conflict_resolutions")
        .select("*")
        .eq("organization_id", organizationId)
        .is("reopened_at", null)
        .in("saas_term_id", termIds)
    : { data: [], error: null };
  if (resolutionsResult.error) throw resolutionsResult.error;
  const contractsById = new Map(
    ((linkedContractsResult.data ?? []) as LinkedContractRow[]).map((contract) => [contract.id, contract])
  );
  const resolutionsByTermAndField = new Map<string, SaasMetadataConflictResolutionRow>();
  for (const resolution of (resolutionsResult.data ?? []) as SaasMetadataConflictResolutionRow[]) {
    resolutionsByTermAndField.set(`${resolution.saas_term_id}:${resolution.field_name}`, resolution);
  }
  const ownerLabels = memberLabels((membersResult.data ?? []) as Array<{
    user_id: string;
    users?: { full_name?: string | null; notification_email?: string | null } | null;
  }>);

  const termsBySoftware = new Map<string, SaasContractTermRow[]>();
  for (const term of terms) {
    termsBySoftware.set(term.software_id, [...(termsBySoftware.get(term.software_id) ?? []), term]);
  }

  const windowsBySoftware = new Map<string, SaasOptOutWindowRow[]>();
  for (const window of (windowsResult.data ?? []) as SaasOptOutWindowRow[]) {
    windowsBySoftware.set(window.software_id, [...(windowsBySoftware.get(window.software_id) ?? []), window]);
  }

  const findingsBySoftware = new Map<string, SaasRiskFindingRow[]>();
  for (const finding of (findingsResult.data ?? []) as SaasRiskFindingRow[]) {
    findingsBySoftware.set(finding.software_id, [
      ...(findingsBySoftware.get(finding.software_id) ?? []),
      finding
    ]);
  }

  const items = ((softwareResult.data ?? []) as SaasSoftwareRow[]).map((software) => {
    const latestTerm = latestByCreatedAt(termsBySoftware.get(software.id) ?? []);
    const optOutWindow =
      (windowsBySoftware.get(software.id) ?? []).sort((a, b) =>
        a.opt_out_deadline.localeCompare(b.opt_out_deadline)
      )[0] ?? null;
    const openFindings = findingsBySoftware.get(software.id) ?? [];
    const linkedContract = latestTerm?.contract_id ? contractsById.get(latestTerm.contract_id) ?? null : null;
    const linkedMetadata = first(linkedContract?.contract_metadata);
    const detectedMetadataConflicts = latestTerm
      ? detectSaasContractMetadataConflicts({
          saas: {
            renewalDate: latestTerm.renewal_date,
            expirationDate: latestTerm.expiration_date,
            noticeDeadlineDate: latestTerm.notice_deadline_date,
            noticePeriodValue: latestTerm.notice_period_value,
            noticePeriodUnit: latestTerm.notice_period_unit as never,
            autoRenewal: latestTerm.auto_renewal,
            contractValueAmount: latestTerm.contract_value_amount,
            contractValueCurrency: latestTerm.contract_value_currency
          },
          contractMetadata: linkedMetadata
            ? {
                renewalDate: linkedMetadata.renewal_date,
                expirationDate: linkedMetadata.expiration_date,
                noticeDeadlineDate: linkedMetadata.notice_deadline_date,
                autoRenewal: linkedMetadata.auto_renewal,
                contractValueAmount: linkedMetadata.contract_value_amount,
                contractValueCurrency: linkedMetadata.contract_value_currency
              }
            : null
        })
      : [];
    const trustedValues = new Map<SaasConflictField, ResolvedSaasTrustedField>();
    for (const conflict of detectedMetadataConflicts) {
      const resolution = latestTerm
        ? resolutionsByTermAndField.get(`${latestTerm.id}:${conflict.field}`) ?? null
        : null;
      const trustedValue = resolveSaasTrustedField({
        conflict,
        resolution: resolution ? resolutionInputFromRow(resolution, ownerLabels) : null
      });
      trustedValues.set(conflict.field, trustedValue);
    }
    const metadataConflicts = detectedMetadataConflicts.filter((conflict) => !trustedValues.get(conflict.field)?.resolved);
    const resolvedMetadataConflicts = Array.from(trustedValues.values()).filter((value) => value.resolved);
    const trustedValueDetails = Array.from(trustedValues.values());
    const trustedValueExplanations = trustedValueDetails.map(explainSaasTrustedValue);
    const effectiveNoticeDeadline =
      (trustedScalar(trustedValues, "notice_deadline_date") as string | null) ??
      optOutWindow?.opt_out_deadline ??
      latestTerm?.notice_deadline_date ??
      null;
    const effectiveSpendAmount = Number(
      trustedScalar(trustedValues, "contract_value_amount") ??
      latestTerm?.contract_value_amount ??
      linkedMetadata?.contract_value_amount ??
      0
    );
    const effectiveSpendCurrency =
      (trustedScalar(trustedValues, "contract_value_currency") as string | null) ??
      latestTerm?.contract_value_currency ??
      linkedMetadata?.contract_value_currency ??
      null;
    const unresolvedOpenFindings = (openFindings ?? []).filter((finding) =>
      finding.finding_type !== "contract_saas_metadata_conflict" || metadataConflicts.length > 0
    );
    const ownerUserId = optOutWindow?.owner_user_id ?? software.owner_user_id ?? linkedContract?.owner_user_id ?? null;
    const workflowStatus = deriveSaasOptOutWorkflowStatus({
      noticeDeadline: effectiveNoticeDeadline,
      ownerUserId,
      openFindingTypes: [
        ...unresolvedOpenFindings.map((finding) => finding.finding_type as never),
        ...(metadataConflicts.length ? ["contract_saas_metadata_conflict" as const] : [])
      ],
      currentStatus: optOutWindow?.workflow_status as SaasOptOutWorkflowStatus | null | undefined
    });

    return {
      software,
      latestTerm,
      optOutWindow,
      openFindings: unresolvedOpenFindings,
      ownerUserId,
      linkedContractOwnerUserId: linkedContract?.owner_user_id ?? null,
      ownerLabel: ownerUserId ? ownerLabels.get(ownerUserId) ?? "Assigned" : "Unassigned",
      workflowStatus,
      nextAction: optOutWindow?.next_action ?? null,
      nextActionDueAt: optOutWindow?.next_action_due_at ?? null,
      effectiveOptOutDeadline: effectiveNoticeDeadline,
      daysUntilOptOut: daysUntilOptOut(effectiveNoticeDeadline),
      urgency: getOptOutUrgency(effectiveNoticeDeadline),
      deadlineWindow: getOptOutDeadlineWindow(effectiveNoticeDeadline),
      spendAtRiskAmount: Number.isFinite(effectiveSpendAmount) ? Math.max(0, effectiveSpendAmount) : 0,
      spendAtRiskCurrency: effectiveSpendCurrency,
      contractId: latestTerm?.contract_id ?? software.source_contract_id ?? null,
      metadataConflicts,
      resolvedMetadataConflicts,
      trustedValueDetails,
      trustedValueExplanations
    };
  });
  const riskyItems = items.filter((item) =>
    item.workflowStatus !== "resolved" &&
    item.workflowStatus !== "ignored" &&
    (item.openFindings.length > 0 || item.deadlineWindow !== "future")
  );
  const spendAtRiskCurrency = riskyItems.find((item) => item.spendAtRiskCurrency)?.spendAtRiskCurrency ?? null;

  return {
    items,
    metrics: {
      softwareCount: items.length,
      openWindowCount: items.filter((item) => item.optOutWindow?.status === "open").length,
      expiredCount: items.filter((item) => item.urgency === "expired").length,
      criticalCount: items.filter((item) => item.urgency === "critical").length,
      highCount: items.filter((item) => item.urgency === "high").length,
      missingNoticeDeadlineCount: items.filter((item) =>
        item.openFindings.some((finding) => finding.finding_type === "missing_notice_deadline")
      ).length,
      autoRenewalFindingCount: items.filter((item) =>
        item.openFindings.some((finding) => finding.finding_type === "auto_renewal")
      ).length,
      dueIn7DaysCount: items.filter((item) => item.deadlineWindow === "due_7_days").length,
      dueIn30DaysCount: items.filter((item) => item.deadlineWindow === "due_30_days").length,
      dueIn60DaysCount: items.filter((item) => item.deadlineWindow === "due_60_days").length,
      assignedOwnerCount: items.filter((item) => Boolean(item.ownerUserId)).length,
      unassignedOwnerCount: items.filter((item) => !item.ownerUserId).length,
      spendAtRiskAmount: riskyItems.reduce((total, item) => total + item.spendAtRiskAmount, 0),
      spendAtRiskCurrency
    }
  };
}

export async function getSaasRenewalImportReviewQueue(
  organizationId: string
): Promise<SaasRenewalImportReviewBatch[]> {
  const supabase = createServerSupabaseClient();
  const { data: batches, error: batchesError } = await supabase
    .from("saas_renewal_import_batches")
    .select("*")
    .eq("organization_id", organizationId)
    .in("status", ["previewed", "needs_review", "partially_activated", "activated", "dismissed"])
    .order("created_at", { ascending: false })
    .limit(5);

  if (batchesError) throw batchesError;
  const typedBatches = (batches ?? []) as SaasRenewalImportBatchRow[];
  if (typedBatches.length === 0) return [];

  const { data: rows, error: rowsError } = await supabase
    .from("saas_renewal_import_rows")
    .select("*")
    .eq("organization_id", organizationId)
    .in("batch_id", typedBatches.map((batch) => batch.id))
    .order("row_number", { ascending: true });

  if (rowsError) throw rowsError;
  const rowsByBatch = new Map<string, SaasRenewalImportReviewRow[]>();
  for (const row of (rows ?? []) as SaasRenewalImportQueueRow[]) {
    rowsByBatch.set(row.batch_id, [
      ...(rowsByBatch.get(row.batch_id) ?? []),
      {
        ...row,
        normalized: parseImportNormalized(row.normalized_row_json),
        issues: parseImportIssueCodes(row.issue_codes)
      }
    ]);
  }

  return typedBatches.map((batch) => ({
    ...batch,
    rows: rowsByBatch.get(batch.id) ?? []
  }));
}

export async function getSaasOptOutStatusesForContracts(
  organizationId: string,
  contractIds: string[]
): Promise<Record<string, SaasContractOptOutStatus>> {
  const ids = Array.from(new Set(contractIds.filter(Boolean)));
  if (ids.length === 0) return {};

  const clock = await getSaasOptOutClock(organizationId);
  const statuses: Record<string, SaasContractOptOutStatus> = {};
  for (const item of clock.items) {
    if (!item.contractId || !ids.includes(item.contractId)) continue;
    const existing = statuses[item.contractId];
    if (existing?.optOutDeadline && item.optOutWindow?.opt_out_deadline) {
      if (existing.optOutDeadline.localeCompare(item.optOutWindow.opt_out_deadline) <= 0) {
        continue;
      }
    }
    statuses[item.contractId] = {
      softwareName: item.software.name,
      optOutDeadline: item.effectiveOptOutDeadline,
      urgency: item.urgency,
      deadlineWindow: item.deadlineWindow,
      workflowStatus: item.workflowStatus,
      ownerLabel: item.ownerLabel,
      nextAction: item.nextAction,
      spendAtRiskAmount: item.spendAtRiskAmount,
      spendAtRiskCurrency: item.spendAtRiskCurrency,
      openFindingCount: item.openFindings.length,
      metadataConflictCount: item.metadataConflicts.length,
      trustedValueDetails: item.trustedValueDetails,
      trustedValueExplanations: item.trustedValueExplanations
    };
  }
  return statuses;
}

function parseImportNormalized(value: unknown): NormalizedSaasRenewalImportRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as NormalizedSaasRenewalImportRow;
}

function parseImportIssueCodes(value: unknown): SaasRenewalImportCleanupIssue[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((code) => String(code))
    .filter(Boolean)
    .map((code) => ({
      code: code as SaasRenewalImportCleanupIssue["code"],
      field: "row",
      severity: code.startsWith("invalid_") ? "error" : "warning",
      message: code.replaceAll("_", " ")
    }));
}

export async function getSaasOptOutStatusForContract(
  organizationId: string,
  contractId: string
): Promise<SaasContractOptOutStatus | null> {
  const statuses = await getSaasOptOutStatusesForContracts(organizationId, [contractId]);
  return statuses[contractId] ?? null;
}

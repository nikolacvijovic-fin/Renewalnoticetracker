// Canonical shipped-kernel contract query surface.
// New runtime modules should import organization-scoped contract reads from here,
// not from the legacy/internal-ops compatibility surface in lib/contracts/queries.ts.

import type { ContractFilter } from "@/lib/constants";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildExportRows,
  EXPORT_BACKGROUND_PAGE_SIZE,
  EXPORT_BACKGROUND_ROW_LIMIT,
  ExportScaleLimitError,
  EXPORT_SYNC_ROW_LIMIT,
  resolveExportPreset,
  type ExportPresetId,
  type ExportRow
} from "@/lib/contracts/export";
import type { Database } from "@/lib/supabase/database.types";
import {
  calculateDashboardMetrics,
  filterContractsForDashboard,
  type DashboardContractRow
} from "@/lib/contracts/dashboard";
import { buildCounterpartyDirectoryRecords } from "@/lib/contracts/counterparty-summaries";
import { buildContractDateCalendarEvents } from "@/lib/contracts/ics";
import { getAppConfig } from "@/lib/config";

export type OrganizationMember = {
  user_id: string;
  role: string;
  user: {
    id: string;
    full_name: string | null;
    notification_email: string | null;
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

export type RenewalDecisionAnalyticsRecord = Pick<
  Database["public"]["Tables"]["renewal_decisions"]["Row"],
  "id" | "organization_id" | "contract_id" | "status" | "decision_date" | "created_at"
>;

type ContractMetadataRow = Database["public"]["Tables"]["contract_metadata"]["Row"];
type ContractRow = Database["public"]["Tables"]["contracts"]["Row"];
type ContractFileRow = Database["public"]["Tables"]["contract_files"]["Row"];
type ReminderRow = Database["public"]["Tables"]["reminders"]["Row"];
type NoteRow = Database["public"]["Tables"]["notes"]["Row"];
type AuditLogRow = Database["public"]["Tables"]["audit_logs"]["Row"];
type RenewalDecisionRow = Database["public"]["Tables"]["renewal_decisions"]["Row"];
type ExtractedFieldEvidenceRow = Database["public"]["Tables"]["extracted_field_evidence"]["Row"];
type ProcessingErrorRow = Database["public"]["Tables"]["processing_errors"]["Row"];
type TrustExceptionApprovalRow = Database["public"]["Tables"]["contract_trust_exception_approvals"]["Row"];

type ContractDetailRecord = ContractRow & {
  contract_files: ContractFileRow[];
  contract_metadata: ContractMetadataRow | ContractMetadataRow[] | null;
  reminders: ReminderRow[];
  notes: NoteRow[];
  audit_logs: AuditLogRow[];
  renewal_decisions: RenewalDecisionRow[];
  contract_trust_exception_approvals?: TrustExceptionApprovalRow[] | null;
};

type ExportContractRow = DashboardContractRow & {
  contract_metadata:
    | (ContractMetadataRow & DashboardContractRow["contract_metadata"])
    | Array<ContractMetadataRow & NonNullable<DashboardContractRow["contract_metadata"]>>
    | null;
  reminders?: Array<Pick<ReminderRow, "remind_at" | "status" | "created_at">> | null;
  notes?: Array<Pick<NoteRow, "body" | "author_user_id" | "created_at">> | null;
  renewal_decisions?: Array<Pick<RenewalDecisionRow, "status" | "decision_date" | "summary" | "created_at">> | null;
};

export type ExportRowsPage = {
  rows: ExportRow[];
  pageIndex: number;
  pageSize: number;
  rowOffset: number;
  totalRowCount: number;
};

export type CustomerOnboardingQueryEvidence = {
  hasActiveOrganizationMembership: boolean;
  completedImportCount30d: number;
  trustedReminderCount: number;
  completedExportCount: number;
  intelligenceViewCount: number;
};

export type MyRenewalActionItem = {
  contractId: string;
  requestId: string | null;
  title: string;
  counterpartyName: string;
  noticeDeadlineDate: string | null;
  renewalDate: string | null;
  expirationDate: string | null;
  daysToNoticeDeadline: number | null;
  ownerLabel: string;
  requestStatus: string | null;
  requestedAction: string | null;
  dueDate: string | null;
  dueAt: string | null;
  needsReview: boolean;
  href: string;
};

export type ContractRenewalActionRequest = {
  id: string;
  contract_id: string;
  organization_id: string;
  requested_by_user_id: string | null;
  requested_to_user_id: string;
  request_status: string;
  requested_action: string;
  due_at: string | null;
  message: string | null;
  response_status: string | null;
  response_note: string | null;
  completed_at: string | null;
  created_at: string;
};

const EXPORT_BASE_SELECT = `
  id,
  status,
  is_sample,
  cycle_status,
  department,
  status_tag,
  owner_user_id,
  renewal_decision_status,
  created_at,
  counterparty_id,
  contract_metadata (
    contract_title,
    counterparty_name,
    contract_type,
    renewal_date,
    expiration_date,
    notice_deadline_date,
    auto_renewal,
    payment_terms,
    needs_review,
    has_weak_evidence,
    accepted_unverified_risk_requested,
    contract_value_amount,
    contract_value_currency,
    financial_data_trust_status,
    price_change_trigger
  )
`;

const EXPORT_WORKFLOW_SELECT = `
  ${EXPORT_BASE_SELECT},
  reminders (
    remind_at,
    status,
    created_at
  ),
  renewal_decisions (
    status,
    decision_date,
    summary,
    created_at
  )
`;

function getExportSelectForPreset(presetId: ExportPresetId) {
  if (presetId === "notes_and_decisions_export") {
    return `
      ${EXPORT_WORKFLOW_SELECT},
      notes (
        body,
        author_user_id,
        created_at
      )
    `;
  }

  if (presetId === "workflow_export" || presetId === "intelligence_export") {
    return EXPORT_WORKFLOW_SELECT;
  }

  return EXPORT_BASE_SELECT;
}

function firstMetadata<T>(metadata: T | T[] | null | undefined): T | null {
  if (Array.isArray(metadata)) {
    return metadata[0] ?? null;
  }

  return metadata ?? null;
}

function getUtcDayDifference(dateValue: string | null, now = new Date()) {
  if (!dateValue) return null;
  const target = new Date(`${dateValue.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.ceil((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export async function getDashboardMetrics(organizationId: string) {
  const contracts = await getContracts(organizationId, "all");
  return calculateDashboardMetrics(contracts);
}

export async function getCustomerOnboardingQueryEvidence(
  organizationId: string
): Promise<CustomerOnboardingQueryEvidence> {
  const supabase = createServerSupabaseClient();
  const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    activeMemberships,
    completedImports,
    trustedReminders,
    completedDataExports,
    completedExportAudits,
    intelligenceViews
  ] = await Promise.all([
    supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .limit(1),
    supabase
      .from("import_jobs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["completed", "completed_with_errors"])
      .gte("created_at", last30d),
    supabase
      .from("reminders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .not("status", "in", '("cancelled","superseded")'),
    supabase
      .from("data_export_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "completed"),
    supabase
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("action", ["contracts.exported", "contracts.export_background_completed"]),
    supabase
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("action", [
        "intelligence.risk_badge_viewed",
        "intelligence.risk_explanation_viewed",
        "intelligence.risk_queue_viewed",
        "intelligence.financial_viewed",
        "intelligence.procurement_viewed"
      ])
  ]);

  for (const result of [
    activeMemberships,
    completedImports,
    trustedReminders,
    completedDataExports,
    completedExportAudits,
    intelligenceViews
  ]) {
    if (result.error) throw result.error;
  }

  return {
    hasActiveOrganizationMembership: (activeMemberships.count ?? 0) > 0,
    completedImportCount30d: completedImports.count ?? 0,
    trustedReminderCount: trustedReminders.count ?? 0,
    completedExportCount: (completedDataExports.count ?? 0) + (completedExportAudits.count ?? 0),
    intelligenceViewCount: intelligenceViews.count ?? 0
  };
}

export async function getOrganizationContractCount(organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { count, error } = await supabase
    .from("contracts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .neq("status", "archived");

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
      is_sample,
      cycle_status,
      status_tag,
      department,
      owner_user_id,
      counterparty_id,
      renewal_decision_status,
      last_acknowledged_at,
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
          field_confidence,
          has_weak_evidence,
          accepted_unverified_risk_requested,
          contract_value_amount,
          contract_value_currency,
          contract_value_period,
          price_change_trigger,
          payment_trigger,
          financial_data_trust_status
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

  const rows = (data ?? []) as unknown as DashboardContractRow[];
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

export async function getMyRenewalActionItems(
  organizationId: string,
  userId: string,
  options?: { limit?: number }
): Promise<MyRenewalActionItem[]> {
  const supabase = createServerSupabaseClient();
  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 50);
  const [members, requestsResult, assignedContractsResult] = await Promise.all([
    getOrganizationMembers(organizationId),
    supabase
      .from("renewal_action_requests")
      .select("id, contract_id, request_status, requested_action, due_date, due_at, created_at")
      .eq("organization_id", organizationId)
      .eq("requested_to_user_id", userId)
      .eq("request_status", "pending")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("contracts")
      .select(
        `
        id,
        owner_user_id,
        updated_at,
        contract_metadata (
          contract_title,
          counterparty_name,
          notice_deadline_date,
          renewal_date,
          expiration_date,
          needs_review
        )
      `
      )
      .eq("organization_id", organizationId)
      .eq("owner_user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(limit)
  ]);

  if (requestsResult.error) throw requestsResult.error;
  if (assignedContractsResult.error) throw assignedContractsResult.error;

  const requestRows = (requestsResult.data ?? []) as Array<{
    id: string;
    contract_id: string;
    request_status: string;
    requested_action: string;
    due_date: string | null;
    due_at: string | null;
  }>;
  const assignedContracts = (assignedContractsResult.data ?? []) as unknown as Array<{
    id: string;
    owner_user_id: string | null;
    contract_metadata:
      | {
          contract_title: string | null;
          counterparty_name: string | null;
          notice_deadline_date: string | null;
          renewal_date: string | null;
          expiration_date: string | null;
          needs_review: boolean | null;
        }
      | Array<{
          contract_title: string | null;
          counterparty_name: string | null;
          notice_deadline_date: string | null;
          renewal_date: string | null;
          expiration_date: string | null;
          needs_review: boolean | null;
        }>
      | null;
  }>;

  const requestedContractIds = Array.from(new Set(requestRows.map((request) => request.contract_id)));
  const requestedContractsResult = requestedContractIds.length
    ? await supabase
        .from("contracts")
        .select(
          `
          id,
          owner_user_id,
          contract_metadata (
            contract_title,
            counterparty_name,
            notice_deadline_date,
            renewal_date,
            expiration_date,
            needs_review
          )
        `
        )
        .eq("organization_id", organizationId)
        .in("id", requestedContractIds)
    : { data: [], error: null };

  if (requestedContractsResult.error) throw requestedContractsResult.error;

  const ownerLabels = new Map(
    members.map((member) => [
      member.user_id,
      member.user?.full_name ?? member.user?.notification_email ?? member.user_id
    ])
  );
  const contractsById = new Map(
    [
      ...assignedContracts,
      ...((requestedContractsResult.data ?? []) as typeof assignedContracts)
    ].map((contract) => [contract.id, contract])
  );
  const requestByContractId = new Map(requestRows.map((request) => [request.contract_id, request]));
  const contractIds = Array.from(
    new Set([...requestRows.map((request) => request.contract_id), ...assignedContracts.map((contract) => contract.id)])
  );

  return contractIds
    .map((contractId) => {
      const contract = contractsById.get(contractId);
      if (!contract) return null;
      const metadata = firstMetadata(contract.contract_metadata);
      const request = requestByContractId.get(contractId) ?? null;
      const noticeDeadlineDate = metadata?.notice_deadline_date ?? null;
      return {
        contractId,
        requestId: request?.id ?? null,
        title: metadata?.contract_title ?? "Untitled contract",
        counterpartyName: metadata?.counterparty_name ?? "Counterparty not set",
        noticeDeadlineDate,
        renewalDate: metadata?.renewal_date ?? null,
        expirationDate: metadata?.expiration_date ?? null,
        daysToNoticeDeadline: getUtcDayDifference(noticeDeadlineDate),
        ownerLabel: ownerLabels.get(contract.owner_user_id ?? "") ?? "Assigned",
        requestStatus: request?.request_status ?? null,
        requestedAction: request?.requested_action ?? null,
        dueDate: request?.due_date ?? null,
        dueAt: request?.due_at ?? null,
        needsReview: Boolean(metadata?.needs_review),
        href: `/dashboard/contracts/${contractId}`
      } satisfies MyRenewalActionItem;
    })
    .filter((item): item is MyRenewalActionItem => Boolean(item))
    .sort((left, right) => {
      if (left.requestId && !right.requestId) return -1;
      if (!left.requestId && right.requestId) return 1;
      const leftDays = left.daysToNoticeDeadline ?? Number.POSITIVE_INFINITY;
      const rightDays = right.daysToNoticeDeadline ?? Number.POSITIVE_INFINITY;
      return leftDays - rightDays;
    })
    .slice(0, limit);
}

export async function getContractRenewalActionRequests(
  organizationId: string,
  contractId: string,
  options?: { includeClosed?: boolean; limit?: number }
): Promise<ContractRenewalActionRequest[]> {
  const supabase = createServerSupabaseClient();
  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 50);
  let query = supabase
    .from("renewal_action_requests")
    .select(
      "id, contract_id, organization_id, requested_by_user_id, requested_to_user_id, request_status, requested_action, due_date, due_at, message, response_status, response_note, completed_at, created_at"
    )
    .eq("organization_id", organizationId)
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!options?.includeClosed) {
    query = query.eq("request_status", "pending");
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ContractRenewalActionRequest[];
}

export async function getContractPendingRenewalActionRequestCount(
  organizationId: string,
  contractId: string
): Promise<number> {
  const supabase = createServerSupabaseClient();
  const { count, error } = await supabase
    .from("renewal_action_requests")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("contract_id", contractId)
    .eq("request_status", "pending");

  if (error) throw error;
  return count ?? 0;
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
      contract_trust_exception_approvals (*)
    `
    )
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .single();

  if (error) throw error;
  const typedData = data as unknown as ContractDetailRecord;
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

export async function getContractRiskAuditContext(contractId: string, organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contracts")
    .select("id, owner_user_id")
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    return null;
  }

  return data as { id: string; owner_user_id: string | null };
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
        contract_metadata: { id: string } | Array<{ id: string }> | null;
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
  organizationId: string,
  client: ReturnType<typeof createServerSupabaseClient> = createServerSupabaseClient()
): Promise<OrganizationMember[]> {
  const supabase = client;
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, role, user:users(id, full_name, notification_email)")
    .eq("organization_id", organizationId);

  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
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
      "id, name, created_at, billing_email, plan_tier, subscription_status, subscription_current_period_end, billing_provider, billing_customer_id, billing_subscription_id, billing_plan_code, billing_price_id, billing_subscription_status, billing_current_period_end, trial_started_at, trial_ends_at, acquisition_source, acquisition_campaign"
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

export async function getExportRows(
  organizationId: string,
  presetId: ExportPresetId = "basic_contract_register",
  options?: {
    maxRows?: number;
    client?: ReturnType<typeof createServerSupabaseClient>;
  }
): Promise<ExportRow[]> {
  const preset = resolveExportPreset(presetId);
  const maxRows = options?.maxRows ?? EXPORT_SYNC_ROW_LIMIT;
  const supabase = options?.client ?? createServerSupabaseClient();
  const [contracts, members] = await Promise.all([
    supabase
      .from("contracts")
      .select(getExportSelectForPreset(preset.id), { count: "exact" })
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(0, maxRows - 1),
    getOrganizationMembers(organizationId, supabase)
  ]);

  if (contracts.error) throw contracts.error;
  if ((contracts.count ?? 0) > maxRows) {
    throw new ExportScaleLimitError({
      presetId: preset.id,
      rowCount: contracts.count ?? 0,
      maxRows
    });
  }

  const ownerMap = new Map(
    members.map((member) => [
      member.user_id,
      member.user?.full_name ?? member.user?.notification_email ?? "Unassigned"
    ] as const)
  );

  return buildExportRows({
    preset,
    contracts: (contracts.data ?? []) as unknown as ExportContractRow[],
    ownerLabelsByUserId: ownerMap
  });
}

export async function* iterateExportRows(
  organizationId: string,
  presetId: ExportPresetId,
  options?: {
    maxRows?: number;
    pageSize?: number;
    client?: ReturnType<typeof createServerSupabaseClient>;
  }
): AsyncGenerator<ExportRowsPage> {
  const preset = resolveExportPreset(presetId);
  const maxRows = options?.maxRows ?? EXPORT_BACKGROUND_ROW_LIMIT;
  const pageSize = Math.min(
    Math.max(Math.trunc(options?.pageSize ?? EXPORT_BACKGROUND_PAGE_SIZE), 1),
    maxRows
  );
  const supabase = options?.client ?? createServerSupabaseClient();
  const members = await getOrganizationMembers(organizationId, supabase);
  const ownerMap = new Map(
    members.map((member) => [
      member.user_id,
      member.user?.full_name ?? member.user?.notification_email ?? "Unassigned"
    ] as const)
  );

  let offset = 0;
  let pageIndex = 0;
  let totalRowCount = 0;

  while (offset < maxRows) {
    const { data, error, count } = await supabase
      .from("contracts")
      .select(getExportSelectForPreset(preset.id), pageIndex === 0 ? { count: "exact" } : undefined)
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, Math.min(offset + pageSize - 1, maxRows - 1));

    if (error) throw error;

    if (pageIndex === 0) {
      totalRowCount = count ?? (data ?? []).length;
      if (totalRowCount > maxRows) {
        throw new ExportScaleLimitError({
          presetId: preset.id,
          rowCount: totalRowCount,
          maxRows
        });
      }
    }

    const pageRows = (data ?? []) as unknown as ExportContractRow[];
    if (pageRows.length === 0) break;

    yield {
      rows: buildExportRows({
        preset,
        contracts: pageRows,
        ownerLabelsByUserId: ownerMap
      }),
      pageIndex,
      pageSize,
      rowOffset: offset,
      totalRowCount
    };

    offset += pageRows.length;
    pageIndex += 1;

    if (offset >= totalRowCount || pageRows.length < pageSize) break;
  }
}

export async function getBackgroundExportRows(
  organizationId: string,
  presetId: ExportPresetId,
  options?: {
    client?: ReturnType<typeof createServerSupabaseClient>;
  }
) {
  const rows: ExportRow[] = [];
  for await (const page of iterateExportRows(organizationId, presetId, {
    maxRows: EXPORT_BACKGROUND_ROW_LIMIT,
    pageSize: EXPORT_BACKGROUND_PAGE_SIZE,
    client: options?.client
  })) {
    rows.push(...page.rows);
  }
  return rows;
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

export async function getOrganizationTimezone(organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("timezone")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return data?.timezone ?? null;
}

export async function getContractCalendarEvents(contractId: string, organizationId: string) {
  const contract = await getContractById(contractId, organizationId);
  const metadata = firstMetadata(contract.contract_metadata);
  const members = await getOrganizationMembers(organizationId);
  const ownerLabel = contract.owner_user_id
    ? members.find((member) => member.user_id === contract.owner_user_id)?.user?.full_name ??
      members.find((member) => member.user_id === contract.owner_user_id)?.user?.notification_email ??
      "Assigned"
    : null;

  return buildContractDateCalendarEvents({
    contractId,
    contractTitle: metadata?.contract_title,
    counterpartyName: metadata?.counterparty_name,
    ownerLabel,
    metadata: metadata
      ? {
          contract_title: metadata.contract_title,
          counterparty_name: metadata.counterparty_name,
          renewal_date: metadata.renewal_date,
          expiration_date: metadata.expiration_date,
          notice_deadline_date: metadata.notice_deadline_date,
          needs_review: metadata.needs_review,
          has_weak_evidence: metadata.has_weak_evidence,
          field_confidence: metadata.field_confidence as Record<string, number> | null,
          contract_value_amount: metadata.contract_value_amount,
          contract_value_currency: metadata.contract_value_currency
        }
      : null,
    appUrl: getAppConfig().public.appUrl,
    includeTentativeNoticeDeadline: true
  });
}

export async function getRenewalDecisionAnalyticsRows(
  organizationId: string
): Promise<RenewalDecisionAnalyticsRecord[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("renewal_decisions")
    .select("id, organization_id, contract_id, status, decision_date, created_at")
    .eq("organization_id", organizationId)
    .order("decision_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as RenewalDecisionAnalyticsRecord[];
}

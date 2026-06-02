import type { ContractFilter } from "@/lib/constants";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildExportRows,
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
import { formatReminderTypeLabel } from "@/lib/contracts/shipped-reminder-policy";

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

type ContractDetailRecord = ContractRow & {
  contract_files: ContractFileRow[];
  contract_metadata: ContractMetadataRow | ContractMetadataRow[] | null;
  reminders: ReminderRow[];
  notes: NoteRow[];
  audit_logs: AuditLogRow[];
  renewal_decisions: RenewalDecisionRow[];
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

const EXPORT_BASE_SELECT = `
  id,
  status,
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
      renewal_decisions (*)
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
  const [{ data: memberships, error: membershipError }, { data: users, error: usersError }] =
    await Promise.all([
      supabase
        .from("memberships")
        .select("user_id, role")
        .eq("organization_id", organizationId),
      supabase.from("users").select("id, full_name, notification_email")
    ]);

  if (membershipError) throw membershipError;
  if (usersError) throw usersError;

  const typedUsers = (users ?? []) as Array<{
    id: string;
    full_name: string | null;
    notification_email: string | null;
  }>;
  const typedMemberships = (memberships ?? []) as Array<{ user_id: string; role: string }>;

  const userMap = new Map(typedUsers.map((user) => [user.id, user] as const));

  return typedMemberships.map((membership) => ({
    ...membership,
    user: userMap.get(membership.user_id) ?? null
  }));
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

export async function getBackgroundExportRows(
  organizationId: string,
  presetId: ExportPresetId,
  options?: {
    client?: ReturnType<typeof createServerSupabaseClient>;
  }
) {
  return getExportRows(organizationId, presetId, {
    maxRows: EXPORT_BACKGROUND_ROW_LIMIT,
    client: options?.client
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

export async function getContractCalendarEvents(contractId: string, organizationId: string) {
  const contract = await getContractById(contractId, organizationId);
  const metadata = firstMetadata(contract.contract_metadata);
  return (contract.reminders ?? []).map(
    (reminder: {
      id: string;
      remind_at: string;
      reminder_type: string;
      recipient_email: string;
    }) => ({
      uid: reminder.id,
      start: reminder.remind_at,
      summary: `${metadata?.contract_title ?? "Contract"} ${formatReminderTypeLabel(reminder.reminder_type)}`,
      description: `Reminder for ${reminder.recipient_email}`
    })
  );
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

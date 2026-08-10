import { buildBetaSupportNoteInsert, buildFounderBetaReliabilityDashboard } from "@/lib/internal/beta-reliability";
import type {
  BetaOrganizationReliabilityInput,
  BetaOrganizationReliabilityMetrics,
  BetaSupportNoteInput,
  CustomerFeedbackSummaryRow
} from "@/lib/internal/beta-reliability";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

type UntypedSupabaseClient = {
  from: (table: string) => {
    select: (columns?: string, options?: Record<string, unknown>) => QueryBuilder;
    insert: (payload: unknown) => Promise<{ data: unknown; error: { message?: string } | null }>;
    update: (payload: unknown) => {
      eq: (column: string, value: unknown) => QueryBuilder;
    };
  };
};

type QueryBuilder = PromiseLike<{ data: unknown[] | null; count?: number | null; error: { message?: string } | null }> & {
  in: (column: string, values: string[]) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  is: (column: string, value: unknown) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
};

type OrganizationRow = {
  id: string;
  name: string;
  created_at: string;
};

type ContractRow = {
  id: string;
  organization_id: string;
  owner_user_id: string | null;
  status: string;
  cycle_status: string;
  renewal_decision_status: string;
  created_at: string;
  updated_at: string;
};

type ContractFileSignalRow = {
  id: string;
  contract_id: string;
  mime_type: string;
  ocr_status: string | null;
  ocr_confidence: number | null;
  uploaded_at: string;
  uploaded_by: string;
};

type MetadataSignalRow = {
  contract_id: string;
  notice_deadline_date: string | null;
  needs_review: boolean;
  field_confidence: Json;
  has_weak_evidence: boolean;
  reviewed_at: string | null;
  updated_at: string;
};

type ProcessingErrorSignalRow = {
  id: string;
  organization_id: string;
  contract_id: string;
  contract_file_id: string | null;
  stage: string;
  resolved_at: string | null;
  created_at: string;
};

type ReminderSignalRow = {
  id: string;
  organization_id: string;
  contract_id: string;
  reminder_type: string;
  status: string;
  remind_at: string;
  sent_at: string | null;
  delivery_key: string | null;
  created_at: string;
};

type NotificationSignalRow = {
  id: string;
  organization_id: string;
  channel: string;
  status: string;
  notification_kind: string;
  delivery_key: string | null;
  sent_at: string;
};

type DecisionSignalRow = {
  id: string;
  organization_id: string;
  contract_id: string;
  status: string;
  created_at: string;
};

type AuditSignalRow = {
  id: string;
  organization_id: string;
  action: string;
  created_at: string;
};

type ActivationEventRow = {
  id: string;
  organization_id: string;
  event_type: string;
  created_at: string;
};

type CustomerFeedbackSignalRow = {
  id: string;
  organization_id: string;
  contract_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  submitted_by_user_id: string;
  feedback_type: string;
  severity: string;
  status: string;
  message: string | null;
  created_at: string;
};

type CustomerFeedbackStatusRow = CustomerFeedbackSignalRow;

export type FounderBetaReliabilityOptions = {
  organizationLimit?: number;
  rowLimitPerOrganization?: number;
  now?: string;
};

const DEFAULT_ORGANIZATION_LIMIT = 25;
const DEFAULT_ROW_LIMIT_PER_ORGANIZATION = 150;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function adminClient(): UntypedSupabaseClient {
  return createAdminSupabaseClient() as unknown as UntypedSupabaseClient;
}

async function runQuery<T>(query: QueryBuilder): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message ?? "admin_beta_reliability_query_failed");
  return (data ?? []) as T[];
}

function groupByOrganization<T extends { organization_id: string }>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.organization_id) ?? [];
    bucket.push(row);
    grouped.set(row.organization_id, bucket);
  }
  return grouped;
}

function groupMetadataByContract(rows: MetadataSignalRow[]) {
  const grouped = new Map<string, MetadataSignalRow>();
  for (const row of rows) grouped.set(row.contract_id, row);
  return grouped;
}

function groupFilesByContract(rows: ContractFileSignalRow[]) {
  const grouped = new Map<string, ContractFileSignalRow[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.contract_id) ?? [];
    bucket.push(row);
    grouped.set(row.contract_id, bucket);
  }
  return grouped;
}

function isTrustedDeadline(metadata: MetadataSignalRow | undefined) {
  return Boolean(metadata?.notice_deadline_date && !metadata.needs_review && !metadata.has_weak_evidence);
}

function isLowConfidenceCriticalField(metadata: MetadataSignalRow | undefined) {
  if (!metadata) return false;
  if (metadata.needs_review || metadata.has_weak_evidence) return true;
  if (!metadata.notice_deadline_date) return true;

  const confidence = metadata.field_confidence;
  if (!confidence || typeof confidence !== "object" || Array.isArray(confidence)) return false;
  const noticeConfidence = (confidence as Record<string, unknown>).notice_deadline_date;
  return typeof noticeConfidence === "number" && noticeConfidence < 0.75;
}

function isUrgentDeadline(metadata: MetadataSignalRow | undefined, nowMs: number) {
  if (!isTrustedDeadline(metadata) || !metadata?.notice_deadline_date) return false;
  const deadlineMs = new Date(`${metadata.notice_deadline_date}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(deadlineMs)) return false;
  return deadlineMs - nowMs <= THIRTY_DAYS_MS;
}

function maxIso(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

function buildOrganizationInput(params: {
  organization: OrganizationRow;
  contracts: ContractRow[];
  filesByContract: Map<string, ContractFileSignalRow[]>;
  metadataByContract: Map<string, MetadataSignalRow>;
  processingErrors: ProcessingErrorSignalRow[];
  reminders: ReminderSignalRow[];
  notifications: NotificationSignalRow[];
  decisions: DecisionSignalRow[];
  auditSignals: AuditSignalRow[];
  activationEvents: ActivationEventRow[];
  now: string;
}): BetaOrganizationReliabilityInput {
  const nowMs = new Date(params.now).getTime();
  const activeContracts = params.contracts.filter(
    (contract) => contract.status !== "archived" && contract.cycle_status !== "archived"
  );
  const contractIds = new Set(activeContracts.map((contract) => contract.id));
  const files = activeContracts.flatMap((contract) => params.filesByContract.get(contract.id) ?? []);
  const metadataRows = activeContracts
    .map((contract) => params.metadataByContract.get(contract.id))
    .filter((metadata): metadata is MetadataSignalRow => Boolean(metadata));
  const unresolvedProcessingErrors = params.processingErrors.filter((row) => row.resolved_at === null);
  const calendarExportCount =
    params.auditSignals.filter((row) => row.action === "contract.ics_exported" || row.action === "contracts.exported").length +
    params.activationEvents.filter((row) => row.event_type === "calendar_exported").length;

  const metrics: BetaOrganizationReliabilityMetrics = {
    contractCount: activeContracts.length,
    pdfUploadCount: files.filter((file) => file.mime_type === "application/pdf").length,
    extractionSuccessCount: metadataRows.filter((metadata) => metadata.reviewed_at || !metadata.needs_review).length,
    extractionFailureCount: unresolvedProcessingErrors.filter((row) =>
      ["text_extraction", "field_extraction", "ocr", "upload"].includes(row.stage)
    ).length,
    contractsNeedingReviewCount: metadataRows.filter((metadata) => metadata.needs_review).length,
    trustedNoticeDeadlinesCount: metadataRows.filter(isTrustedDeadline).length,
    urgentDeadlineCount: metadataRows.filter((metadata) => isUrgentDeadline(metadata, nowMs)).length,
    ownerAssignmentCount: activeContracts.filter((contract) => contract.owner_user_id).length,
    reminderEmailSuccessCount:
      params.notifications.filter((row) => row.status === "sent" || row.status === "delivered").length +
      params.reminders.filter((row) => row.status === "sent").length,
    reminderEmailFailureCount:
      params.notifications.filter((row) => row.status === "failed").length +
      params.reminders.filter((row) => row.status === "failed").length,
    calendarExportCount,
    decisionCount: params.decisions.filter((decision) => contractIds.has(decision.contract_id)).length,
    lowConfidenceCriticalFieldCount: metadataRows.filter(isLowConfidenceCriticalField).length,
    failedUploadCount: unresolvedProcessingErrors.filter((row) => row.stage === "upload").length,
    ocrFailureCount: unresolvedProcessingErrors.filter((row) => row.stage === "ocr").length,
    skippedReminderCount: params.notifications.filter((row) => row.status === "skipped").length,
    duplicateReminderConflictCount: params.notifications.filter((row) => row.status === "duplicate_suppressed").length,
    lastActivityAt: maxIso([
      ...activeContracts.map((contract) => contract.updated_at),
      ...files.map((file) => file.uploaded_at),
      ...metadataRows.map((metadata) => metadata.updated_at),
      ...params.reminders.map((reminder) => reminder.created_at),
      ...params.notifications.map((notification) => notification.sent_at),
      ...params.decisions.map((decision) => decision.created_at),
      ...params.auditSignals.map((audit) => audit.created_at),
      ...params.activationEvents.map((event) => event.created_at)
    ])
  };

  return {
    organizationId: params.organization.id,
    organizationName: params.organization.name,
    createdAt: params.organization.created_at,
    metrics
  };
}

export async function getFounderBetaReliabilityDashboard(options: FounderBetaReliabilityOptions = {}) {
  const organizationLimit = Math.max(1, Math.min(options.organizationLimit ?? DEFAULT_ORGANIZATION_LIMIT, 100));
  const rowLimitPerOrganization = Math.max(
    25,
    Math.min(options.rowLimitPerOrganization ?? DEFAULT_ROW_LIMIT_PER_ORGANIZATION, 500)
  );
  const now = options.now ?? new Date().toISOString();
  const admin = adminClient();

  const organizations = await runQuery<OrganizationRow>(
    admin
      .from("organizations")
      .select("id,name,created_at")
      .order("created_at", { ascending: false })
      .limit(organizationLimit)
  );
  const organizationIds = organizations.map((organization) => organization.id);
  if (organizationIds.length === 0) {
    return buildFounderBetaReliabilityDashboard([], now);
  }

  const rowLimit = organizationIds.length * rowLimitPerOrganization;
  const contracts = await runQuery<ContractRow>(
    admin
      .from("contracts")
      .select("id,organization_id,owner_user_id,status,cycle_status,renewal_decision_status,created_at,updated_at")
      .in("organization_id", organizationIds)
      .order("updated_at", { ascending: false })
      .limit(rowLimit)
  );
  const contractIds = contracts.map((contract) => contract.id);

  const [
    files,
    metadata,
    processingErrors,
    reminders,
    notifications,
    decisions,
    auditSignals,
    activationEvents,
    customerFeedback
  ] = await Promise.all([
    contractIds.length
      ? runQuery<ContractFileSignalRow>(
          admin
            .from("contract_files")
            .select("id,contract_id,mime_type,ocr_status,ocr_confidence,uploaded_at,uploaded_by")
            .in("contract_id", contractIds)
            .order("uploaded_at", { ascending: false })
            .limit(rowLimit)
        )
      : Promise.resolve([]),
    contractIds.length
      ? runQuery<MetadataSignalRow>(
          admin
            .from("contract_metadata")
            .select(
              "contract_id,notice_deadline_date,needs_review,field_confidence,has_weak_evidence,reviewed_at,updated_at"
            )
            .in("contract_id", contractIds)
            .limit(contractIds.length)
        )
      : Promise.resolve([]),
    runQuery<ProcessingErrorSignalRow>(
      admin
        .from("processing_errors")
        .select("id,organization_id,contract_id,contract_file_id,stage,resolved_at,created_at")
        .in("organization_id", organizationIds)
        .order("created_at", { ascending: false })
        .limit(rowLimit)
    ),
    runQuery<ReminderSignalRow>(
      admin
        .from("reminders")
        .select("id,organization_id,contract_id,reminder_type,status,remind_at,sent_at,delivery_key,created_at")
        .in("organization_id", organizationIds)
        .order("created_at", { ascending: false })
        .limit(rowLimit)
    ),
    runQuery<NotificationSignalRow>(
      admin
        .from("notification_logs")
        .select("id,organization_id,channel,status,notification_kind,delivery_key,sent_at")
        .in("organization_id", organizationIds)
        .order("sent_at", { ascending: false })
        .limit(rowLimit)
    ),
    runQuery<DecisionSignalRow>(
      admin
        .from("renewal_decisions")
        .select("id,organization_id,contract_id,status,created_at")
        .in("organization_id", organizationIds)
        .order("created_at", { ascending: false })
        .limit(rowLimit)
    ),
    runQuery<AuditSignalRow>(
      admin
        .from("audit_logs")
        .select("id,organization_id,action,created_at")
        .in("organization_id", organizationIds)
        .order("created_at", { ascending: false })
        .limit(rowLimit)
    ),
    runQuery<ActivationEventRow>(
      admin
        .from("organization_activation_events")
        .select("id,organization_id,event_type,created_at")
        .in("organization_id", organizationIds)
        .order("created_at", { ascending: false })
        .limit(rowLimit)
    ),
    runQuery<CustomerFeedbackSignalRow>(
      admin
        .from("customer_feedback")
        .select(
          "id,organization_id,contract_id,entity_type,entity_id,submitted_by_user_id,feedback_type,severity,status,message,created_at"
        )
        .in("organization_id", organizationIds)
        .order("created_at", { ascending: false })
        .limit(rowLimit)
    )
  ]);

  const contractsByOrg = groupByOrganization(contracts);
  const processingErrorsByOrg = groupByOrganization(processingErrors);
  const remindersByOrg = groupByOrganization(reminders);
  const notificationsByOrg = groupByOrganization(notifications);
  const decisionsByOrg = groupByOrganization(decisions);
  const auditSignalsByOrg = groupByOrganization(auditSignals);
  const activationEventsByOrg = groupByOrganization(activationEvents);
  const filesByContract = groupFilesByContract(files);
  const metadataByContract = groupMetadataByContract(metadata);
  const organizationNameById = new Map(organizations.map((organization) => [organization.id, organization.name]));
  const feedbackRows: CustomerFeedbackSummaryRow[] = customerFeedback.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    organizationName: organizationNameById.get(row.organization_id) ?? row.organization_id,
    contractId: row.contract_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    submittedByUserId: row.submitted_by_user_id,
    feedbackType: row.feedback_type,
    severity: row.severity,
    status: row.status,
    messagePreview: row.message ?? "No message provided.",
    createdAt: row.created_at
  }));

  return buildFounderBetaReliabilityDashboard(
    organizations.map((organization) =>
      buildOrganizationInput({
        organization,
        contracts: contractsByOrg.get(organization.id) ?? [],
        filesByContract,
        metadataByContract,
        processingErrors: processingErrorsByOrg.get(organization.id) ?? [],
        reminders: remindersByOrg.get(organization.id) ?? [],
        notifications: notificationsByOrg.get(organization.id) ?? [],
        decisions: decisionsByOrg.get(organization.id) ?? [],
        auditSignals: auditSignalsByOrg.get(organization.id) ?? [],
        activationEvents: activationEventsByOrg.get(organization.id) ?? [],
        now
      })
    ),
    feedbackRows,
    now
  );
}

export async function insertBetaSupportNote(input: BetaSupportNoteInput) {
  const payload = buildBetaSupportNoteInsert(input);
  const admin = adminClient();
  const { error } = await admin.from("beta_support_notes").insert(payload);
  if (error) throw new Error(error.message ?? "beta_support_note_insert_failed");
  return payload;
}

export async function getCustomerFeedbackByIdForInternalStatusChange(feedbackId: string, organizationId: string) {
  const admin = adminClient();
  const rows = await runQuery<CustomerFeedbackStatusRow>(
    admin
      .from("customer_feedback")
      .select(
        "id,organization_id,contract_id,entity_type,entity_id,submitted_by_user_id,feedback_type,severity,status,message,created_at"
      )
      .eq("id", feedbackId)
      .eq("organization_id", organizationId)
      .limit(1)
  );

  const row = rows[0] ?? null;
  if (!row) throw new Error("customer_feedback_not_found");
  return row;
}

export async function updateCustomerFeedbackStatusAsInternal(input: {
  feedbackId: string;
  organizationId: string;
  status: string;
  resolvedByUserId: string | null;
  resolutionNote: string | null;
}) {
  const admin = adminClient();
  const terminal = input.status === "resolved" || input.status === "dismissed";
  const { error } = await admin
    .from("customer_feedback")
    .update({
      status: input.status,
      resolved_by_user_id: terminal ? input.resolvedByUserId : null,
      resolved_at: terminal ? new Date().toISOString() : null,
      resolution_note: input.resolutionNote
    })
    .eq("id", input.feedbackId)
    .eq("organization_id", input.organizationId);

  if (error) throw new Error(error.message ?? "customer_feedback_status_update_failed");
}

import {
  buildBetaOrganizationReliabilitySummary,
  buildBetaSupportNoteInsert,
  buildFounderBetaReliabilityDashboard
} from "@/lib/internal/beta-reliability";
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
  ilike: (column: string, value: string) => QueryBuilder;
  is: (column: string, value: unknown) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  range: (from: number, to: number) => QueryBuilder;
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
  is_sample: boolean | null;
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
  page?: number;
  search?: string;
  filter?:
    | "sample_only"
    | "no_real_contract"
    | "activation_blocked"
    | "trial_ending_soon"
    | "extraction_upload_failure"
    | "reminder_email_failure"
    | "open_customer_feedback"
    | "healthy_activated";
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

async function runQueryWithCount<T>(query: QueryBuilder): Promise<{ rows: T[]; count: number | null }> {
  const { data, count, error } = await query;
  if (error) throw new Error(error.message ?? "admin_beta_reliability_query_failed");
  return { rows: (data ?? []) as T[], count: count ?? null };
}

async function runPerOrganizationQuery<T>(
  organizationIds: string[],
  rowLimitPerOrganization: number,
  buildQuery: (organizationId: string) => QueryBuilder
): Promise<T[]> {
  const batches = await Promise.all(
    organizationIds.map((organizationId) => runQuery<T>(buildQuery(organizationId).limit(rowLimitPerOrganization)))
  );
  return batches.flat();
}

function matchesFounderFilter(
  input: BetaOrganizationReliabilityInput,
  feedbackRows: CustomerFeedbackSummaryRow[],
  filter: FounderBetaReliabilityOptions["filter"]
) {
  const metrics = input.metrics;
  switch (filter) {
    case "sample_only":
      return (metrics.sampleContractCount ?? 0) > 0 && metrics.contractCount === 0;
    case "no_real_contract":
      return metrics.contractCount === 0;
    case "activation_blocked":
      return buildBetaOrganizationReliabilitySummary(input).stuckReason !== null;
    case "trial_ending_soon":
      return false;
    case "extraction_upload_failure":
      return metrics.extractionFailureCount > 0 || (metrics.failedUploadCount ?? 0) > 0 || (metrics.ocrFailureCount ?? 0) > 0;
    case "reminder_email_failure":
      return metrics.reminderEmailFailureCount > 0 || (metrics.skippedReminderCount ?? 0) > 0;
    case "open_customer_feedback":
      return feedbackRows.some(
        (row) =>
          row.organizationId === input.organizationId &&
          (row.status === "open" || row.status === "in_review")
      );
    case "healthy_activated":
      return buildBetaOrganizationReliabilitySummary(input).currentStage === "activated";
    default:
      return true;
  }
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
  const sampleContracts = activeContracts.filter((contract) => contract.is_sample === true);
  const realContracts = activeContracts.filter((contract) => contract.is_sample !== true);
  const sampleContractIds = new Set(sampleContracts.map((contract) => contract.id));
  const realContractIds = new Set(realContracts.map((contract) => contract.id));
  const files = realContracts.flatMap((contract) => params.filesByContract.get(contract.id) ?? []);
  const metadataRows = realContracts
    .map((contract) => params.metadataByContract.get(contract.id))
    .filter((metadata): metadata is MetadataSignalRow => Boolean(metadata));
  const sampleFiles = sampleContracts.flatMap((contract) => params.filesByContract.get(contract.id) ?? []);
  const sampleProcessingErrors = params.processingErrors.filter((row) => sampleContractIds.has(row.contract_id));
  const realProcessingErrors = params.processingErrors.filter((row) => !row.contract_id || realContractIds.has(row.contract_id));
  const calendarExportCount =
    params.auditSignals.filter((row) => row.action === "contract.ics_exported" || row.action === "contracts.exported").length +
    params.activationEvents.filter((row) => row.event_type === "calendar_exported").length;

  const metrics: BetaOrganizationReliabilityMetrics = {
    contractCount: realContracts.length,
    pdfUploadCount: files.filter((file) => file.mime_type === "application/pdf").length,
    extractionSuccessCount: metadataRows.filter((metadata) => metadata.reviewed_at || !metadata.needs_review).length,
    extractionFailureCount: realProcessingErrors.filter((row) => row.resolved_at === null).filter((row) =>
      ["text_extraction", "field_extraction", "ocr", "upload"].includes(row.stage)
    ).length,
    contractsNeedingReviewCount: metadataRows.filter((metadata) => metadata.needs_review).length,
    trustedNoticeDeadlinesCount: metadataRows.filter(isTrustedDeadline).length,
    urgentDeadlineCount: metadataRows.filter((metadata) => isUrgentDeadline(metadata, nowMs)).length,
    ownerAssignmentCount: realContracts.filter((contract) => contract.owner_user_id).length,
    reminderEmailSuccessCount:
      params.notifications.filter((row) => row.status === "sent" || row.status === "delivered").length +
      params.reminders.filter((row) => row.status === "sent").length,
    reminderEmailFailureCount:
      params.notifications.filter((row) => row.status === "failed").length +
      params.reminders.filter((row) => row.status === "failed").length,
    calendarExportCount,
    decisionCount: params.decisions.filter((decision) => realContractIds.has(decision.contract_id)).length,
    lowConfidenceCriticalFieldCount: metadataRows.filter(isLowConfidenceCriticalField).length,
    failedUploadCount: realProcessingErrors.filter((row) => row.resolved_at === null && row.stage === "upload").length,
    ocrFailureCount: realProcessingErrors.filter((row) => row.resolved_at === null && row.stage === "ocr").length,
    skippedReminderCount: params.notifications.filter((row) => row.status === "skipped").length,
    duplicateReminderConflictCount: params.notifications.filter((row) => row.status === "duplicate_suppressed").length,
    sampleContractCount: sampleContracts.length,
    sampleExploredCount: params.auditSignals.filter((row) => row.action === "contract.sample_opened").length,
    sampleDiagnosticIssueCount:
      sampleProcessingErrors.filter((row) => row.resolved_at === null).length +
      sampleFiles.filter((file) => file.ocr_status === "failed").length,
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
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const offset = (page - 1) * organizationLimit;
  const rowLimitPerOrganization = Math.max(
    25,
    Math.min(options.rowLimitPerOrganization ?? DEFAULT_ROW_LIMIT_PER_ORGANIZATION, 500)
  );
  const now = options.now ?? new Date().toISOString();
  const admin = adminClient();

  let organizationQuery = admin
    .from("organizations")
    .select("id,name,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + organizationLimit - 1);
  const search = options.search?.trim();
  if (search) {
    organizationQuery = organizationQuery.ilike("name", `%${search.slice(0, 80)}%`);
  }
  const { rows: organizations, count: totalOrganizationCount } =
    await runQueryWithCount<OrganizationRow>(organizationQuery);
  const organizationIds = organizations.map((organization) => organization.id);
  if (organizationIds.length === 0) {
    return {
      ...buildFounderBetaReliabilityDashboard([], [], now),
      page: {
        page,
        pageSize: organizationLimit,
        totalOrganizationCount: totalOrganizationCount ?? 0,
        returnedOrganizationCount: 0,
        boundedPage: true,
        rowLimitPerOrganization
      }
    };
  }

  const contracts = await runPerOrganizationQuery<ContractRow>(
    organizationIds,
    rowLimitPerOrganization,
    (organizationId) =>
      admin
        .from("contracts")
        .select("id,organization_id,owner_user_id,status,cycle_status,is_sample,renewal_decision_status,created_at,updated_at")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false })
  );
  const contractIds = contracts.map((contract) => contract.id);
  const rowLimit = Math.max(contractIds.length, organizationIds.length) * rowLimitPerOrganization;

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
    runPerOrganizationQuery<ProcessingErrorSignalRow>(
      organizationIds,
      rowLimitPerOrganization,
      (organizationId) =>
        admin
          .from("processing_errors")
          .select("id,organization_id,contract_id,contract_file_id,stage,resolved_at,created_at")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
    ),
    runPerOrganizationQuery<ReminderSignalRow>(
      organizationIds,
      rowLimitPerOrganization,
      (organizationId) =>
        admin
          .from("reminders")
          .select("id,organization_id,contract_id,reminder_type,status,remind_at,sent_at,delivery_key,created_at")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
    ),
    runPerOrganizationQuery<NotificationSignalRow>(
      organizationIds,
      rowLimitPerOrganization,
      (organizationId) =>
        admin
          .from("notification_logs")
          .select("id,organization_id,channel,status,notification_kind,delivery_key,sent_at")
          .eq("organization_id", organizationId)
          .order("sent_at", { ascending: false })
    ),
    runPerOrganizationQuery<DecisionSignalRow>(
      organizationIds,
      rowLimitPerOrganization,
      (organizationId) =>
        admin
          .from("renewal_decisions")
          .select("id,organization_id,contract_id,status,created_at")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
    ),
    runPerOrganizationQuery<AuditSignalRow>(
      organizationIds,
      rowLimitPerOrganization,
      (organizationId) =>
        admin
          .from("audit_logs")
          .select("id,organization_id,action,created_at")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
    ),
    runPerOrganizationQuery<ActivationEventRow>(
      organizationIds,
      rowLimitPerOrganization,
      (organizationId) =>
        admin
          .from("organization_activation_events")
          .select("id,organization_id,event_type,created_at")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
    ),
    runPerOrganizationQuery<CustomerFeedbackSignalRow>(
      organizationIds,
      rowLimitPerOrganization,
      (organizationId) =>
        admin
          .from("customer_feedback")
          .select(
            "id,organization_id,contract_id,entity_type,entity_id,submitted_by_user_id,feedback_type,severity,status,message,created_at"
          )
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
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

  const organizationInputs = organizations.map((organization) =>
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
    );
  const filteredInputs = organizationInputs.filter((input) => matchesFounderFilter(input, feedbackRows, options.filter));
  const dashboard = buildFounderBetaReliabilityDashboard(filteredInputs, feedbackRows, now);

  return {
    ...dashboard,
    page: {
      page,
      pageSize: organizationLimit,
      totalOrganizationCount: totalOrganizationCount ?? organizations.length,
      returnedOrganizationCount: filteredInputs.length,
      boundedPage: true,
      rowLimitPerOrganization
    }
  };
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

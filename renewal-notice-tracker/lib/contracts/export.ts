import * as XLSX from "xlsx";
import {
  buildRiskQueueRow,
  createRiskWorkflowSubjectFromDashboardContract
} from "@/lib/intelligence/risk/dashboard";
import type { CommercialFeature } from "@/lib/billing/entitlements";
import type { MembershipRole } from "@/lib/auth";
import type { DashboardContractRow } from "@/lib/contracts/dashboard";

export const EXPORT_FORMATS = ["csv", "xlsx"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_PRESET_IDS = [
  "basic_contract_register",
  "workflow_export",
  "notes_and_decisions_export",
  "intelligence_export",
  "audit_export"
] as const;

export type ExportPresetId = (typeof EXPORT_PRESET_IDS)[number];
export type ExportCellValue = string | number | boolean | null | undefined;
export type ExportRow = Record<string, ExportCellValue>;

export type ExportColumnDefinition = {
  key: string;
  label: string;
};

export type ExportPreset = {
  id: ExportPresetId;
  label: string;
  description: string;
  includedSections: string[];
  requiredCommercialFeature: CommercialFeature | null;
  minimumPlan: "starter" | "growth" | "portfolio" | null;
  allowedRoles: readonly MembershipRole[];
  supportedFormats: readonly ExportFormat[];
  columns: readonly ExportColumnDefinition[];
  sensitiveSectionsIncluded: boolean;
  selectable: boolean;
};

export const EXPORT_SYNC_ROW_LIMIT = 5000;
export const EXPORT_BACKGROUND_EXPORT_THRESHOLD = EXPORT_SYNC_ROW_LIMIT;
export const EXPORT_BACKGROUND_ROW_LIMIT = 25000;
export const EXPORT_BACKGROUND_ARTIFACT_MAX_BYTES = 50 * 1024 * 1024;
export const EXPORT_NOTE_PREVIEW_MAX_LENGTH = 160;
export const EXPORT_DECISION_HISTORY_MAX_LENGTH = 500;

export class ExportScaleLimitError extends Error {
  constructor(
    public readonly input: {
      presetId: ExportPresetId;
      rowCount: number;
      maxRows: number;
    }
  ) {
    super(
      `Export preset "${input.presetId}" has ${input.rowCount} rows, above the synchronous limit of ${input.maxRows}.`
    );
    this.name = "ExportScaleLimitError";
  }
}

const BASIC_COLUMNS = [
  { key: "contract_title", label: "Contract title" },
  { key: "counterparty_name", label: "Counterparty" },
  { key: "contract_type", label: "Contract type" },
  { key: "owner_name", label: "Owner" },
  { key: "department", label: "Department" },
  { key: "status_tag", label: "Status tag" },
  { key: "renewal_date", label: "Renewal date" },
  { key: "expiration_date", label: "Expiration date" },
  { key: "notice_deadline_date", label: "Notice deadline" },
  { key: "auto_renewal", label: "Auto-renewal" },
  { key: "payment_terms", label: "Payment terms" },
  { key: "needs_review", label: "Needs review" }
] as const;

const WORKFLOW_COLUMNS = [
  ...BASIC_COLUMNS,
  { key: "cycle_status", label: "Cycle status" },
  { key: "renewal_decision_status", label: "Renewal decision status" },
  { key: "next_reminder_date", label: "Next reminder date" },
  { key: "latest_reminder_status", label: "Latest reminder status" },
  { key: "latest_renewal_decision", label: "Latest renewal decision" },
  { key: "latest_decision_date", label: "Latest decision date" }
] as const;

const NOTES_AND_DECISIONS_COLUMNS = [
  ...WORKFLOW_COLUMNS,
  { key: "note_count", label: "Note count" },
  { key: "latest_note_date", label: "Latest note date" },
  { key: "latest_note_author", label: "Latest note author" },
  { key: "latest_note_preview", label: "Latest note preview" },
  { key: "decision_history_summary", label: "Decision history summary" }
] as const;

const INTELLIGENCE_COLUMNS = [
  ...WORKFLOW_COLUMNS,
  { key: "risk_band", label: "Risk band" },
  { key: "score_points", label: "Score points" },
  { key: "confidence_level", label: "Confidence level" },
  { key: "missing_data_warnings_count", label: "Missing data warnings count" },
  { key: "contract_value_amount", label: "Contract value amount" },
  { key: "contract_value_currency", label: "Contract value currency" },
  { key: "financial_data_trust_status", label: "Financial data trust status" }
] as const;

const AUDIT_COLUMNS = [
  { key: "audit_export_deferred", label: "Audit export status" }
] as const;

export const EXPORT_PRESETS: Record<ExportPresetId, ExportPreset> = {
  basic_contract_register: {
    id: "basic_contract_register",
    label: "Basic Contract Register",
    description: "Default contract register export with non-sensitive contract metadata.",
    includedSections: ["contract_register"],
    requiredCommercialFeature: "exports",
    minimumPlan: "starter",
    allowedRoles: ["admin", "operator", "reviewer", "owner"],
    supportedFormats: ["csv", "xlsx"],
    columns: BASIC_COLUMNS,
    sensitiveSectionsIncluded: false,
    selectable: true
  },
  workflow_export: {
    id: "workflow_export",
    label: "Workflow Export",
    description: "Contract register plus renewal workflow, reminder, and decision status.",
    includedSections: ["contract_register", "workflow", "reminders", "decisions"],
    requiredCommercialFeature: "risk_scores",
    minimumPlan: "growth",
    allowedRoles: ["admin", "operator", "reviewer"],
    supportedFormats: ["csv", "xlsx"],
    columns: WORKFLOW_COLUMNS,
    sensitiveSectionsIncluded: false,
    selectable: true
  },
  notes_and_decisions_export: {
    id: "notes_and_decisions_export",
    label: "Notes & Decisions Export",
    description: "Workflow export plus sanitized note and decision history summaries.",
    includedSections: ["contract_register", "workflow", "reminders", "decisions", "notes"],
    requiredCommercialFeature: "risk_scores",
    minimumPlan: "growth",
    allowedRoles: ["admin", "operator"],
    supportedFormats: ["csv", "xlsx"],
    columns: NOTES_AND_DECISIONS_COLUMNS,
    sensitiveSectionsIncluded: true,
    selectable: true
  },
  intelligence_export: {
    id: "intelligence_export",
    label: "Intelligence Export",
    description: "Workflow export plus risk, confidence, warning, and trusted financial fields.",
    includedSections: ["contract_register", "workflow", "reminders", "decisions", "intelligence"],
    requiredCommercialFeature: "risk_scores",
    minimumPlan: "growth",
    allowedRoles: ["admin", "operator", "reviewer"],
    supportedFormats: ["csv", "xlsx"],
    columns: INTELLIGENCE_COLUMNS,
    sensitiveSectionsIncluded: true,
    selectable: true
  },
  audit_export: {
    id: "audit_export",
    label: "Audit Export",
    description: "Deferred admin-only audit export placeholder. Not selectable until audit packaging is hardened.",
    includedSections: ["audit"],
    requiredCommercialFeature: "intelligence_settings",
    minimumPlan: "portfolio",
    allowedRoles: ["admin"],
    supportedFormats: ["csv", "xlsx"],
    columns: AUDIT_COLUMNS,
    sensitiveSectionsIncluded: true,
    selectable: false
  }
} as const;

export class ExportPresetSelectionError extends Error {
  constructor(public readonly presetId: string | null | undefined) {
    super(`Export preset "${presetId ?? ""}" is not available.`);
    this.name = "ExportPresetSelectionError";
  }
}

export function resolveExportPreset(value: string | null | undefined): ExportPreset {
  const presetId = value || "basic_contract_register";
  const preset = EXPORT_PRESETS[presetId as ExportPresetId];

  if (!preset || !preset.selectable) {
    throw new ExportPresetSelectionError(value);
  }

  return preset;
}

export function assertExportFormatSupported(preset: ExportPreset, format: ExportFormat) {
  if (!preset.supportedFormats.includes(format)) {
    throw new ExportPresetSelectionError(preset.id);
  }
}

type ExportContractRecord = DashboardContractRow & {
  contract_metadata?: (DashboardContractRow["contract_metadata"] & {
    contract_type?: string | null;
    payment_terms?: string | null;
    renewal_date?: string | null;
  }) | Array<DashboardContractRow["contract_metadata"] & {
    contract_type?: string | null;
    payment_terms?: string | null;
    renewal_date?: string | null;
  }> | null;
  reminders?: Array<{
    remind_at: string | null;
    status: string | null;
    created_at?: string | null;
  }> | null;
  renewal_decisions?: Array<{
    status: string | null;
    decision_date: string | null;
    summary?: string | null;
    created_at?: string | null;
  }> | null;
  notes?: Array<{
    body: string | null;
    author_user_id: string | null;
    created_at: string | null;
  }> | null;
};

export type ExportBuildInput = {
  preset: ExportPreset;
  contracts: ExportContractRecord[];
  ownerLabelsByUserId: Map<string, string>;
};

function firstMetadata(contract: ExportContractRecord) {
  const metadata = contract.contract_metadata;
  return Array.isArray(metadata) ? metadata[0] ?? null : metadata ?? null;
}

function formatBoolean(value: boolean | null | undefined) {
  return value ? "Yes" : "No";
}

function sortNewestFirst<T extends { created_at?: string | null; decision_date?: string | null }>(
  rows: T[] | null | undefined
) {
  return [...(rows ?? [])].sort((left, right) => {
    const leftDate = left.decision_date ?? left.created_at ?? "";
    const rightDate = right.decision_date ?? right.created_at ?? "";
    return rightDate.localeCompare(leftDate);
  });
}

function selectNextReminder(reminders: ExportContractRecord["reminders"]) {
  const now = new Date().toISOString();
  return [...(reminders ?? [])]
    .filter((reminder) => reminder.remind_at && reminder.remind_at >= now)
    .sort((left, right) => (left.remind_at ?? "").localeCompare(right.remind_at ?? ""))[0] ?? null;
}

function selectLatestReminder(reminders: ExportContractRecord["reminders"]) {
  return [...(reminders ?? [])].sort((left, right) => {
    const leftDate = left.remind_at ?? left.created_at ?? "";
    const rightDate = right.remind_at ?? right.created_at ?? "";
    return rightDate.localeCompare(leftDate);
  })[0] ?? null;
}

function truncateNotePreview(value: string | null | undefined) {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
  return cleaned.length > EXPORT_NOTE_PREVIEW_MAX_LENGTH
    ? `${cleaned.slice(0, EXPORT_NOTE_PREVIEW_MAX_LENGTH - 3)}...`
    : cleaned;
}

function truncateDecisionHistorySummary(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > EXPORT_DECISION_HISTORY_MAX_LENGTH
    ? `${cleaned.slice(0, EXPORT_DECISION_HISTORY_MAX_LENGTH - 3)}...`
    : cleaned;
}

function buildBasicFields(contract: ExportContractRecord, ownerLabelsByUserId: Map<string, string>) {
  const metadata = firstMetadata(contract);

  return {
    contract_title: metadata?.contract_title ?? "",
    counterparty_name: metadata?.counterparty_name ?? "",
    contract_type: metadata?.contract_type ?? "",
    owner_name: ownerLabelsByUserId.get(contract.owner_user_id ?? "") ?? "Unassigned",
    department: contract.department ?? "",
    status_tag: contract.status_tag ?? "",
    renewal_date: metadata?.renewal_date ?? "",
    expiration_date: metadata?.expiration_date ?? "",
    notice_deadline_date: metadata?.notice_deadline_date ?? "",
    auto_renewal: formatBoolean(metadata?.auto_renewal),
    payment_terms: metadata?.payment_terms ?? "",
    needs_review: formatBoolean(metadata?.needs_review)
  };
}

function buildWorkflowFields(contract: ExportContractRecord, ownerLabelsByUserId: Map<string, string>) {
  const latestDecision = sortNewestFirst(contract.renewal_decisions)[0] ?? null;
  const nextReminder = selectNextReminder(contract.reminders);
  const latestReminder = selectLatestReminder(contract.reminders);

  return {
    ...buildBasicFields(contract, ownerLabelsByUserId),
    cycle_status: contract.cycle_status ?? "",
    renewal_decision_status: contract.renewal_decision_status ?? "",
    next_reminder_date: nextReminder?.remind_at ?? "",
    latest_reminder_status: latestReminder?.status ?? "",
    latest_renewal_decision: latestDecision?.status ?? "",
    latest_decision_date: latestDecision?.decision_date ?? latestDecision?.created_at ?? ""
  };
}

function buildNotesAndDecisionsFields(
  contract: ExportContractRecord,
  ownerLabelsByUserId: Map<string, string>
) {
  const latestNote = sortNewestFirst(contract.notes)[0] ?? null;
  const decisions = sortNewestFirst(contract.renewal_decisions);

  return {
    ...buildWorkflowFields(contract, ownerLabelsByUserId),
    note_count: contract.notes?.length ?? 0,
    latest_note_date: latestNote?.created_at ?? "",
    latest_note_author: ownerLabelsByUserId.get(latestNote?.author_user_id ?? "") ?? "",
    latest_note_preview: truncateNotePreview(latestNote?.body),
    decision_history_summary: truncateDecisionHistorySummary(
      decisions
        .map((decision) => [decision.status, decision.decision_date ?? decision.created_at]
          .filter(Boolean)
          .join(" on "))
        .filter(Boolean)
        .join("; ")
    )
  };
}

function buildIntelligenceFields(
  contract: ExportContractRecord,
  ownerLabelsByUserId: Map<string, string>
) {
  const metadata = firstMetadata(contract);
  const risk = buildRiskQueueRow(
    createRiskWorkflowSubjectFromDashboardContract({
      ...contract,
      contract_metadata: metadata
    })
  );

  return {
    ...buildWorkflowFields(contract, ownerLabelsByUserId),
    risk_band: risk.riskBand,
    score_points: risk.scorePoints,
    confidence_level: risk.confidenceLevel,
    missing_data_warnings_count: risk.missingDataWarnings.length,
    contract_value_amount: metadata?.contract_value_amount ?? "",
    contract_value_currency: metadata?.contract_value_currency ?? "",
    financial_data_trust_status: metadata?.financial_data_trust_status ?? ""
  };
}

function pickPresetColumns(row: ExportRow, preset: ExportPreset): ExportRow {
  return Object.fromEntries(
    preset.columns.map((column) => [column.key, row[column.key] ?? ""])
  );
}

export function buildExportRows(input: ExportBuildInput): ExportRow[] {
  return input.contracts.map((contract) => {
    const row =
      input.preset.id === "notes_and_decisions_export"
        ? buildNotesAndDecisionsFields(contract, input.ownerLabelsByUserId)
        : input.preset.id === "intelligence_export"
          ? buildIntelligenceFields(contract, input.ownerLabelsByUserId)
          : input.preset.id === "workflow_export"
            ? buildWorkflowFields(contract, input.ownerLabelsByUserId)
            : buildBasicFields(contract, input.ownerLabelsByUserId);

    return pickPresetColumns(row, input.preset);
  });
}

export function toCsv(rows: ExportRow[], columns?: readonly ExportColumnDefinition[]) {
  const headers = columns?.map((column) => column.key) ?? Object.keys(rows[0] ?? {});

  return [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => escapeCsv(String(sanitizeSpreadsheetValue(row[header] ?? ""))))
        .join(",")
    )
  ].join("\n");
}

export function toXlsxBuffer(rows: ExportRow[], columns?: readonly ExportColumnDefinition[]) {
  const headers = columns?.map((column) => column.key) ?? Object.keys(rows[0] ?? {});
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(
    rows.map((row) =>
      Object.fromEntries(
        headers.map((key) => [key, sanitizeSpreadsheetValue(row[key] ?? "")])
      )
    ),
    { header: headers }
  );
  XLSX.utils.book_append_sheet(workbook, worksheet, "Contracts");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export function buildExportAuditDetails(input: {
  preset: ExportPreset;
  format: ExportFormat;
  rowCount: number;
}) {
  return {
    export_preset: input.preset.id,
    format: input.format,
    row_count: input.rowCount,
    included_sections: input.preset.includedSections,
    sensitive_sections_included: input.preset.sensitiveSectionsIncluded,
    exported_at: new Date().toISOString()
  };
}

function escapeCsv(value: string) {
  const escaped = value.replace(/"/g, '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

export function sanitizeSpreadsheetValue(value: unknown) {
  const stringValue = String(value ?? "");
  return /^[=+\-@]/.test(stringValue) ? `'${stringValue}` : stringValue;
}

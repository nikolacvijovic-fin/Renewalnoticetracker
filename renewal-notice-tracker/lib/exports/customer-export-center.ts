import * as XLSX from "xlsx";
import type { ExportCellValue, ExportRow } from "@/lib/contracts/export";
import { sanitizeSpreadsheetValue, toCsv } from "@/lib/contracts/export";

export const CUSTOMER_EXPORT_FORMATS = ["csv", "xlsx", "pdf", "json", "ics"] as const;
export type CustomerExportFormat = (typeof CUSTOMER_EXPORT_FORMATS)[number];

export const CUSTOMER_EXPORT_TYPES = [
  "renewal_deadline_register",
  "urgent_deadlines",
  "saas_opt_out_clock",
  "owner_action_list",
  "renewal_decisions",
  "risk_findings",
  "audit_safe_activity_history",
  "full_mvp_export_bundle"
] as const;

export type CustomerExportType = (typeof CUSTOMER_EXPORT_TYPES)[number];

export type CustomerExportOption = {
  id: CustomerExportType;
  label: string;
  description: string;
  includedFields: string[];
  availability: "available" | "partial";
  availabilityNote?: string;
  formats: CustomerExportFormat[];
  requiresAdminOrOperator: boolean;
  hrefs: Partial<Record<CustomerExportFormat, string>>;
};

export const CUSTOMER_EXPORT_CENTER_OPTIONS: CustomerExportOption[] = [
  {
    id: "renewal_deadline_register",
    label: "Renewal deadline register",
    description: "Safe spreadsheet register of contracts, vendors, notice dates, owners, values, and review state.",
    includedFields: [
      "contract title",
      "vendor/counterparty",
      "notice deadline",
      "renewal date",
      "expiration date",
      "auto-renewal",
      "owner",
      "department",
      "value amount/currency",
      "review/trust status",
      "decision status",
      "next action"
    ],
    availability: "available",
    formats: ["csv", "xlsx", "json"],
    requiresAdminOrOperator: true,
    hrefs: {
      csv: "/dashboard/contracts/export/csv?preset=basic_contract_register",
      xlsx: "/dashboard/contracts/export/xlsx?preset=basic_contract_register",
      json: "/dashboard/exports/customer-data.json"
    }
  },
  {
    id: "urgent_deadlines",
    label: "Urgent deadlines",
    description: "Missed, due-soon, and needs-review deadline rows for immediate finance/procurement action.",
    includedFields: ["contract title", "vendor/counterparty", "deadline", "days left", "owner", "value", "review status"],
    availability: "available",
    formats: ["xlsx", "ics"],
    requiresAdminOrOperator: true,
    hrefs: {
      xlsx: "/dashboard/exports/customer-data.xlsx",
      ics: "/dashboard/contracts/urgent-deadlines/ics"
    }
  },
  {
    id: "saas_opt_out_clock",
    label: "SaaS opt-out clock",
    description: "SaaS opt-out deadline calendar and trusted workflow status for renewal defense.",
    includedFields: ["software/vendor", "linked contract", "opt-out deadline", "urgency", "owner", "spend at risk", "workflow status"],
    availability: "partial",
    availabilityNote: "Calendar export is available. Spreadsheet and JSON SaaS opt-out datasets are intentionally deferred until the SaaS review queue is fully persisted.",
    formats: ["ics"],
    requiresAdminOrOperator: true,
    hrefs: {
      ics: "/dashboard/saas-opt-out-clock/ics"
    }
  },
  {
    id: "owner_action_list",
    label: "Owner action list",
    description: "Assigned contracts, pending requests, due dates, decision status, and next action by owner.",
    includedFields: ["owner", "assigned contracts", "pending requests", "due dates", "decision status", "next action"],
    availability: "available",
    formats: ["xlsx", "json"],
    requiresAdminOrOperator: true,
    hrefs: {
      xlsx: "/dashboard/exports/customer-data.xlsx",
      json: "/dashboard/exports/customer-data.json"
    }
  },
  {
    id: "renewal_decisions",
    label: "Renewal decisions",
    description: "Safe decision status history and date fields without private notes or raw contract text.",
    includedFields: ["contract", "decision status", "decision date", "safe summary", "accepted risk flag"],
    availability: "available",
    formats: ["xlsx", "json"],
    requiresAdminOrOperator: true,
    hrefs: {
      xlsx: "/dashboard/exports/customer-data.xlsx",
      json: "/dashboard/exports/customer-data.json"
    }
  },
  {
    id: "risk_findings",
    label: "Risk findings",
    description: "Derived renewal-control risk rows from safe metadata only. Deep intelligence findings are not included in this beta export.",
    includedFields: ["finding type", "severity", "status", "contract", "safe evidence code"],
    availability: "partial",
    availabilityNote: "Risk rows are derived from the renewal register, such as missing deadlines, needs-review metadata, and high spend. Raw clauses and intelligence evidence are excluded.",
    formats: ["xlsx", "json"],
    requiresAdminOrOperator: true,
    hrefs: {
      xlsx: "/dashboard/exports/customer-data.xlsx",
      json: "/dashboard/exports/customer-data.json"
    }
  },
  {
    id: "audit_safe_activity_history",
    label: "Audit-safe activity history",
    description: "Safe event/action history metadata only. Raw payloads, private notes, and provider data stay excluded.",
    includedFields: ["timestamp", "actor", "entity type/id", "event/action", "safe status metadata"],
    availability: "available",
    formats: ["json"],
    requiresAdminOrOperator: true,
    hrefs: {
      json: "/dashboard/exports/customer-data.json"
    }
  },
  {
    id: "full_mvp_export_bundle",
    label: "Full MVP export bundle",
    description: "One controlled export bundle for finance/procurement review. ZIP packaging is deferred; workbook, JSON, PDF, and ICS are separate downloads.",
    includedFields: ["summary", "renewal deadlines", "urgent deadlines", "decisions", "owners", "derived risk findings", "audit history", "calendar links"],
    availability: "partial",
    availabilityNote: "The bundle is complete for renewal-control datasets. SaaS opt-out spreadsheet/JSON packaging remains deferred; use the dedicated calendar export for opt-out dates.",
    formats: ["xlsx", "pdf", "json", "ics"],
    requiresAdminOrOperator: true,
    hrefs: {
      xlsx: "/dashboard/exports/customer-data.xlsx",
      pdf: "/dashboard/exports/leadership-summary.pdf",
      json: "/dashboard/exports/customer-data.json",
      ics: "/dashboard/contracts/trusted-upcoming/ics"
    }
  }
] as const;

export type AuditSafeHistoryInput = {
  timestamp: string;
  actorUserId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  metadata?: Record<string, unknown> | null;
};

export type CustomerExportBundleInput = {
  organizationId: string;
  generatedAt: string;
  renewalRows: ExportRow[];
  auditHistory?: AuditSafeHistoryInput[];
};

const RENEWAL_REGISTER_COLUMNS = [
  "contract_title",
  "counterparty_name",
  "notice_deadline_date",
  "renewal_date",
  "expiration_date",
  "auto_renewal",
  "owner_name",
  "department",
  "contract_value_amount",
  "contract_value_currency",
  "needs_review",
  "renewal_decision_status",
  "next_reminder_date",
  "latest_reminder_status"
] as const;

const FORBIDDEN_METADATA_KEY_PATTERN =
  /(raw|body|text|clause|ocr|payload|secret|token|password|private|note|email_body|storage|path|provider|prompt|response|file)/i;

const FORBIDDEN_VALUE_PATTERN =
  /(raw contract|ocr output|provider payload|private note|email body|secret_|token_|bearer\s+[a-z0-9._-]+|-----BEGIN|storage\/|scraped personal)/i;

function pickSafeValue(row: ExportRow, key: string): ExportCellValue {
  return row[key] ?? "";
}

export function buildRenewalDeadlineRegisterRows(rows: ExportRow[]) {
  return rows.map((row) =>
    Object.fromEntries(RENEWAL_REGISTER_COLUMNS.map((column) => [column, pickSafeValue(row, column)])) as ExportRow
  );
}

function parseDate(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const time = new Date(`${value.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Number.isFinite(time) ? time : null;
}

function isYes(value: unknown) {
  return String(value ?? "").toLowerCase() === "yes" || value === true;
}

export function buildUrgentDeadlineRows(rows: ExportRow[], now = new Date().toISOString()) {
  const nowMs = new Date(`${now.slice(0, 10)}T00:00:00.000Z`).getTime();
  return buildRenewalDeadlineRegisterRows(rows).filter((row) => {
    if (isYes(row.needs_review)) return true;
    const deadline = parseDate(row.notice_deadline_date);
    if (deadline === null) return true;
    const days = Math.ceil((deadline - nowMs) / (24 * 60 * 60 * 1000));
    return days <= 30;
  });
}

export function buildOwnerActionRows(rows: ExportRow[]) {
  return buildRenewalDeadlineRegisterRows(rows).map((row) => ({
    owner_name: row.owner_name || "Unassigned",
    contract_title: row.contract_title,
    counterparty_name: row.counterparty_name,
    notice_deadline_date: row.notice_deadline_date,
    renewal_date: row.renewal_date,
    decision_status: row.renewal_decision_status,
    next_action: row.next_reminder_date ? "Review upcoming reminder" : isYes(row.needs_review) ? "Review metadata" : "Monitor",
    latest_reminder_status: row.latest_reminder_status
  }));
}

export function buildRenewalDecisionRows(rows: ExportRow[]) {
  return buildRenewalDeadlineRegisterRows(rows).map((row) => ({
    contract_title: row.contract_title,
    counterparty_name: row.counterparty_name,
    decision_status: row.renewal_decision_status || "not_recorded",
    notice_deadline_date: row.notice_deadline_date,
    renewal_date: row.renewal_date,
    expiration_date: row.expiration_date,
    needs_review: row.needs_review
  }));
}

export function buildRiskFindingRows(rows: ExportRow[], now = new Date().toISOString()) {
  const nowMs = new Date(`${now.slice(0, 10)}T00:00:00.000Z`).getTime();
  const findings: ExportRow[] = [];
  for (const row of buildRenewalDeadlineRegisterRows(rows)) {
    const base = {
      contract_title: row.contract_title,
      counterparty_name: row.counterparty_name,
      owner_name: row.owner_name
    };
    if (!row.notice_deadline_date) {
      findings.push({
        ...base,
        finding_type: "missing_notice_deadline",
        severity: "high",
        status: "needs_review",
        safe_evidence_code: "missing_notice_deadline"
      });
    }
    if (isYes(row.needs_review)) {
      findings.push({
        ...base,
        finding_type: "metadata_needs_review",
        severity: "medium",
        status: "needs_review",
        safe_evidence_code: "metadata_review_required"
      });
    }
    const deadline = parseDate(row.notice_deadline_date);
    if (deadline !== null && deadline < nowMs) {
      findings.push({
        ...base,
        finding_type: "missed_notice_deadline",
        severity: "critical",
        status: "open",
        safe_evidence_code: "deadline_elapsed"
      });
    }
    const amount = Number(row.contract_value_amount ?? 0);
    if (Number.isFinite(amount) && amount >= 50000) {
      findings.push({
        ...base,
        finding_type: "high_spend_at_risk",
        severity: "medium",
        status: "open",
        safe_evidence_code: "structured_contract_value"
      });
    }
  }
  return findings;
}

export function sanitizeAuditSafeMetadata(metadata: Record<string, unknown> | null | undefined) {
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (FORBIDDEN_METADATA_KEY_PATTERN.test(key)) continue;
    if (value === null || typeof value === "boolean" || typeof value === "number") {
      output[key] = value;
      continue;
    }
    if (typeof value === "string" && !FORBIDDEN_VALUE_PATTERN.test(value)) {
      output[key] = value.slice(0, 160);
    }
  }
  return output;
}

export function buildAuditSafeHistoryRows(rows: AuditSafeHistoryInput[] = []) {
  return rows.map((row) => ({
    timestamp: row.timestamp,
    actor_user_id: row.actorUserId ?? "",
    entity_type: row.entityType,
    entity_id: row.entityId ?? "",
    action: row.action,
    safe_metadata: JSON.stringify(sanitizeAuditSafeMetadata(row.metadata))
  }));
}

export function buildCustomerExportSummary(input: CustomerExportBundleInput) {
  const renewalRows = buildRenewalDeadlineRegisterRows(input.renewalRows);
  const urgentRows = buildUrgentDeadlineRows(input.renewalRows, input.generatedAt);
  const spendAtRisk = renewalRows.reduce((sum, row) => {
    const amount = Number(row.contract_value_amount ?? 0);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);

  return {
    organizationId: input.organizationId,
    generatedAt: input.generatedAt,
    contractCount: renewalRows.length,
    urgentDeadlineCount: urgentRows.length,
    missedOrMissingDeadlineCount: urgentRows.filter((row) => !row.notice_deadline_date || isYes(row.needs_review)).length,
    needsReviewCount: renewalRows.filter((row) => isYes(row.needs_review)).length,
    decisionRecordedCount: renewalRows.filter((row) => String(row.renewal_decision_status ?? "").trim()).length,
    spendAtRiskAmount: spendAtRisk
  };
}

export function buildCustomerExportJson(input: CustomerExportBundleInput) {
  return {
    schemaVersion: "noticecontrol.customer_export.v1",
    organizationId: input.organizationId,
    generatedAt: input.generatedAt,
    summary: buildCustomerExportSummary(input),
    datasets: {
      renewalDeadlineRegister: buildRenewalDeadlineRegisterRows(input.renewalRows),
      urgentDeadlines: buildUrgentDeadlineRows(input.renewalRows, input.generatedAt),
      ownerActionList: buildOwnerActionRows(input.renewalRows),
      renewalDecisions: buildRenewalDecisionRows(input.renewalRows),
      riskFindings: buildRiskFindingRows(input.renewalRows, input.generatedAt),
      auditSafeHistory: buildAuditSafeHistoryRows(input.auditHistory)
    }
  };
}

function makeSheet(rows: ExportRow[]) {
  return XLSX.utils.json_to_sheet(
    rows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, sanitizeSpreadsheetValue(value)]))
    )
  );
}

export function buildCustomerExportWorkbookBuffer(input: CustomerExportBundleInput) {
  const workbook = XLSX.utils.book_new();
  const summary = buildCustomerExportSummary(input);
  XLSX.utils.book_append_sheet(workbook, makeSheet([summary as unknown as ExportRow]), "Summary");
  XLSX.utils.book_append_sheet(workbook, makeSheet(buildRenewalDeadlineRegisterRows(input.renewalRows)), "Renewal Deadlines");
  XLSX.utils.book_append_sheet(workbook, makeSheet(buildUrgentDeadlineRows(input.renewalRows, input.generatedAt)), "Urgent Deadlines");
  XLSX.utils.book_append_sheet(workbook, makeSheet(buildRenewalDecisionRows(input.renewalRows)), "Decisions");
  XLSX.utils.book_append_sheet(workbook, makeSheet(buildOwnerActionRows(input.renewalRows)), "Owners");
  XLSX.utils.book_append_sheet(workbook, makeSheet(buildRiskFindingRows(input.renewalRows, input.generatedAt)), "Risk Findings");
  XLSX.utils.book_append_sheet(
    workbook,
    makeSheet([
      {
        dataset: "SaaS Opt-Out",
        status: "partial",
        note: "Use the dedicated opt-out ICS export. Spreadsheet and JSON SaaS opt-out datasets are deferred for beta."
      }
    ]),
    "Dataset Notes"
  );
  XLSX.utils.book_append_sheet(workbook, makeSheet(buildAuditSafeHistoryRows(input.auditHistory)), "Audit History");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function buildCustomerExportCsv(rows: ExportRow[]) {
  return toCsv(buildRenewalDeadlineRegisterRows(rows));
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildSimplePdf(lines: string[]) {
  const content = lines
    .slice(0, 34)
    .map((line, index) => `BT /F1 11 Tf 50 ${760 - index * 20} Td (${escapePdfText(line)}) Tj ET`)
    .join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(content, "utf8")} >> stream\n${content}\nendstream endobj`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${object}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

export function buildLeadershipSummaryPdfBuffer(input: CustomerExportBundleInput) {
  const summary = buildCustomerExportSummary(input);
  const urgentRows = buildUrgentDeadlineRows(input.renewalRows, input.generatedAt).slice(0, 8);
  const lines = [
    "NoticeControl Leadership Renewal Summary",
    `Generated: ${input.generatedAt}`,
    `Contracts: ${summary.contractCount}`,
    `Urgent deadlines: ${summary.urgentDeadlineCount}`,
    `Needs review: ${summary.needsReviewCount}`,
    `Decisions recorded: ${summary.decisionRecordedCount}`,
    `Spend at risk: ${summary.spendAtRiskAmount}`,
    "Next recommended actions:",
    "1. Review missed or due-soon notice deadlines.",
    "2. Assign owners for unowned renewal actions.",
    "3. Resolve untrusted AI-extracted or missing dates.",
    "Urgent rows:"
  ];
  for (const row of urgentRows) {
    lines.push(`${row.contract_title || "Untitled"} - ${row.counterparty_name || "Unknown vendor"} - ${row.notice_deadline_date || "Needs review"}`);
  }
  return buildSimplePdf(lines);
}

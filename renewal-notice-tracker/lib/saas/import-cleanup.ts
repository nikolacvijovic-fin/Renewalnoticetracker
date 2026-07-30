import * as XLSX from "xlsx";
import {
  calculateNoticeDeadline,
  calculateSaasContractRiskFindings,
  type NoticePeriodUnit
} from "@/lib/saas/renewal-defense";

export const SAAS_RENEWAL_IMPORT_TEMPLATE_HEADERS = [
  "vendor_name",
  "product_name",
  "renewal_date",
  "notice_deadline_date",
  "notice_period",
  "contract_value_amount",
  "contract_value_currency",
  "owner_email",
  "department_category",
  "source_notes"
] as const;

export type SaasRenewalImportHeader = (typeof SAAS_RENEWAL_IMPORT_TEMPLATE_HEADERS)[number];
export type SaasRenewalImportCellValue = string | number | boolean | Date | null | undefined;

export type SaasRenewalImportRow = Record<SaasRenewalImportHeader, SaasRenewalImportCellValue>;

export type SaasRenewalImportStatus = "ready" | "needs_review" | "rejected";

export type SaasRenewalImportOwner = {
  userId: string;
  label: string;
};

export type NormalizedSaasRenewalImportRow = {
  vendorName: string;
  vendorKey: string;
  productName: string;
  productKey: string;
  renewalDate: string | null;
  noticeDeadlineDate: string | null;
  noticePeriodValue: number | null;
  noticePeriodUnit: NoticePeriodUnit | null;
  calculatedNoticeDeadline: string | null;
  contractValueAmount: number | null;
  contractValueCurrency: string | null;
  ownerEmail: string | null;
  ownerUserId: string | null;
  ownerLabel: string | null;
  departmentCategory: string | null;
  sourceNotes: string | null;
  evidenceConfidence: number;
  duplicateKey: string | null;
};

export type SaasRenewalImportCleanupIssueCode =
  | "missing_vendor"
  | "missing_product"
  | "missing_renewal_and_notice_deadline"
  | "invalid_renewal_date"
  | "invalid_notice_deadline_date"
  | "invalid_notice_period"
  | "missing_notice_deadline"
  | "invalid_contract_value_amount"
  | "invalid_contract_value_currency"
  | "owner_email_unmapped"
  | "owner_email_missing"
  | "duplicate_suspected"
  | "weak_evidence";

export type SaasRenewalImportCleanupIssue = {
  code: SaasRenewalImportCleanupIssueCode;
  field: SaasRenewalImportHeader | "row";
  severity: "error" | "warning";
  message: string;
};

export type SaasRenewalImportCleanupResult = {
  rowNumber: number;
  status: SaasRenewalImportStatus;
  issues: SaasRenewalImportCleanupIssue[];
  normalized: NormalizedSaasRenewalImportRow;
};

export type SaasRenewalImportAssessment = {
  results: SaasRenewalImportCleanupResult[];
  summary: {
    totalRows: number;
    readyCount: number;
    needsReviewCount: number;
    rejectedCount: number;
    missingNoticeDeadlineCount: number;
    missingOwnerCount: number;
    duplicateSuspectedCount: number;
    weakEvidenceCount: number;
    spendAtRiskAmount: number;
    spendAtRiskCurrency: string | null;
  };
};

export type SaasRenewalActivationPlan = {
  readyRows: Array<{
    rowNumber: number;
    software: {
      name: string;
      vendorName: string;
      category: string | null;
      ownerUserId: string | null;
    };
    term: {
      renewalDate: string | null;
      noticeDeadlineDate: string | null;
      noticePeriodValue: number | null;
      noticePeriodUnit: NoticePeriodUnit | null;
      autoRenewal: true;
      contractValueAmount: number | null;
      contractValueCurrency: string | null;
      termSummary: string;
    };
    optOutWindow: {
      optOutDeadline: string;
      ownerUserId: string | null;
      source: "explicit" | "calculated";
      workflowStatus: "ready" | "owner_assigned";
    };
    riskFindings: ReturnType<typeof calculateSaasContractRiskFindings>;
  }>;
  blockedRows: Array<{
    rowNumber: number;
    status: Exclude<SaasRenewalImportStatus, "ready">;
    issueCodes: SaasRenewalImportCleanupIssueCode[];
  }>;
};

export class SaasRenewalImportTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaasRenewalImportTemplateError";
  }
}

export function buildSaasRenewalImportDuplicateKey(input: {
  vendorName: string | null;
  productName: string | null;
  renewalDate?: string | null;
  noticeDeadlineDate?: string | null;
}) {
  const vendorKey = normalizeVendorKey(input.vendorName ?? "");
  const productKey = normalizeDuplicatePart(input.productName ?? "");
  const renewalDate = normalizeDate(input.renewalDate);
  const noticeDeadlineDate = normalizeDate(input.noticeDeadlineDate);
  if (!vendorKey || !productKey || (!renewalDate && !noticeDeadlineDate)) return null;
  return [vendorKey, productKey, renewalDate ?? "", noticeDeadlineDate ?? ""].join("|");
}

export function parseSaasRenewalImportFile(fileName: string, buffer: Buffer): SaasRenewalImportRow[] {
  if (fileName.toLowerCase().endsWith(".csv")) {
    return parseCsv(buffer.toString("utf8"));
  }

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) return [];

  const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | Date>>(worksheet, {
    header: 1,
    defval: ""
  });
  const [headerRow, ...dataRows] = rows;
  const headers = (headerRow ?? []).map((value) => String(value ?? "").trim());
  assertSaasRenewalImportTemplateHeaders(headers);

  return dataRows
    .filter((row) => row.some((value) => String(value ?? "").trim().length > 0))
    .map((row) => mapRowFromHeaders(headers, row));
}

export function assessSaasRenewalImportRows(
  rows: SaasRenewalImportRow[],
  options?: {
    organizationId?: string;
    ownersByEmail?: Map<string, SaasRenewalImportOwner> | Record<string, SaasRenewalImportOwner>;
    existingDuplicateKeys?: Set<string>;
    acceptedWeakEvidenceRowNumbers?: Set<number>;
    acceptedDuplicateRowNumbers?: Set<number>;
  }
): SaasRenewalImportAssessment {
  const ownersByEmail = normalizeOwnersByEmail(options?.ownersByEmail);
  const normalizedRows = rows.map((row) => normalizeSaasRenewalImportRow(row, ownersByEmail));
  const duplicateCounts = new Map<string, number>();

  for (const row of normalizedRows) {
    if (!row.duplicateKey) continue;
    duplicateCounts.set(row.duplicateKey, (duplicateCounts.get(row.duplicateKey) ?? 0) + 1);
  }

  const results = normalizedRows.map<SaasRenewalImportCleanupResult>((row, index) => {
    const raw = rows[index] ?? emptyRow();
    const issues: SaasRenewalImportCleanupIssue[] = [];

    if (!row.vendorName) {
      issues.push(issue("missing_vendor", "vendor_name", "error", "Vendor name is required."));
    }
    if (!row.productName) {
      issues.push(issue("missing_product", "product_name", "error", "Product name is required."));
    }
    if (raw.renewal_date && !row.renewalDate) {
      issues.push(issue("invalid_renewal_date", "renewal_date", "error", "Renewal date must be YYYY-MM-DD or a valid spreadsheet date."));
    }
    if (raw.notice_deadline_date && !row.noticeDeadlineDate) {
      issues.push(issue("invalid_notice_deadline_date", "notice_deadline_date", "error", "Notice deadline must be YYYY-MM-DD or a valid spreadsheet date."));
    }
    if (raw.notice_period && (row.noticePeriodValue === null || row.noticePeriodUnit === null)) {
      issues.push(issue("invalid_notice_period", "notice_period", "error", "Notice period must look like '30 days', '8 weeks', or '2 months'."));
    }
    if (!row.renewalDate && !row.calculatedNoticeDeadline) {
      issues.push(issue(
        "missing_renewal_and_notice_deadline",
        "renewal_date",
        "error",
        "A renewal date or notice deadline is required before this can become an opt-out clock record."
      ));
    } else if (!row.calculatedNoticeDeadline) {
      issues.push(issue(
        "missing_notice_deadline",
        "notice_deadline_date",
        "warning",
        "Notice deadline is missing or cannot be calculated, so the row needs review."
      ));
    }
    if (raw.contract_value_amount && row.contractValueAmount === null) {
      issues.push(issue("invalid_contract_value_amount", "contract_value_amount", "error", "Contract value must be a valid non-negative number."));
    }
    if (raw.contract_value_currency && row.contractValueCurrency === null) {
      issues.push(issue("invalid_contract_value_currency", "contract_value_currency", "error", "Currency must be a 3-letter ISO-style code such as USD or EUR."));
    }
    if (!row.ownerEmail) {
      issues.push(issue("owner_email_missing", "owner_email", "warning", "Owner email is missing."));
    } else if (!row.ownerUserId) {
      issues.push(issue("owner_email_unmapped", "owner_email", "warning", "Owner email does not match an active organization member."));
    }
    if (
      row.duplicateKey &&
      !options?.acceptedDuplicateRowNumbers?.has(index + 2) &&
      ((duplicateCounts.get(row.duplicateKey) ?? 0) > 1 || options?.existingDuplicateKeys?.has(row.duplicateKey))
    ) {
      issues.push(issue("duplicate_suspected", "row", "warning", "This vendor/product/renewal combination looks like a duplicate."));
    }
    if (row.evidenceConfidence < 0.75 && !options?.acceptedWeakEvidenceRowNumbers?.has(index + 2)) {
      issues.push(issue("weak_evidence", "source_notes", "warning", "Evidence is manual-only or weak and needs review before activation."));
    }

    const hasErrors = issues.some((item) => item.severity === "error");
    const status: SaasRenewalImportStatus = hasErrors
      ? "rejected"
      : issues.length > 0
        ? "needs_review"
        : "ready";

    return {
      rowNumber: index + 2,
      status,
      issues,
      normalized: row
    };
  });

  const readyRows = results.filter((row) => row.status === "ready");
  const riskyCurrency = readyRows.find((row) => row.normalized.contractValueCurrency)?.normalized.contractValueCurrency ?? null;

  return {
    results,
    summary: {
      totalRows: results.length,
      readyCount: readyRows.length,
      needsReviewCount: results.filter((row) => row.status === "needs_review").length,
      rejectedCount: results.filter((row) => row.status === "rejected").length,
      missingNoticeDeadlineCount: countIssue(results, "missing_notice_deadline"),
      missingOwnerCount: countIssue(results, "owner_email_missing") + countIssue(results, "owner_email_unmapped"),
      duplicateSuspectedCount: countIssue(results, "duplicate_suspected"),
      weakEvidenceCount: countIssue(results, "weak_evidence"),
      spendAtRiskAmount: readyRows.reduce((total, row) => total + Math.max(0, row.normalized.contractValueAmount ?? 0), 0),
      spendAtRiskCurrency: riskyCurrency
    }
  };
}

export function buildSaasRenewalImportRow(overrides: Partial<SaasRenewalImportRow> = {}): SaasRenewalImportRow {
  return {
    ...emptyRow(),
    ...overrides
  };
}

export function buildSaasRenewalActivationPlan(
  assessment: SaasRenewalImportAssessment
): SaasRenewalActivationPlan {
  return {
    readyRows: assessment.results
      .filter((result) => result.status === "ready")
      .map((result) => {
        const row = result.normalized;
        const noticeDeadline = row.calculatedNoticeDeadline;
        if (!noticeDeadline) {
          throw new Error("Ready SaaS renewal import rows must have a notice deadline.");
        }

        return {
          rowNumber: result.rowNumber,
          software: {
            name: row.productName,
            vendorName: row.vendorName,
            category: row.departmentCategory,
            ownerUserId: row.ownerUserId
          },
          term: {
            renewalDate: row.renewalDate,
            noticeDeadlineDate: noticeDeadline,
            noticePeriodValue: row.noticePeriodValue,
            noticePeriodUnit: row.noticePeriodUnit,
            autoRenewal: true,
            contractValueAmount: row.contractValueAmount,
            contractValueCurrency: row.contractValueCurrency,
            termSummary: "Imported from SaaS renewal cleanup template."
          },
          optOutWindow: {
            optOutDeadline: noticeDeadline,
            ownerUserId: row.ownerUserId,
            source: row.noticeDeadlineDate ? "explicit" : "calculated",
            workflowStatus: row.ownerUserId ? "ready" : "owner_assigned"
          },
          riskFindings: calculateSaasContractRiskFindings({
            renewalDate: row.renewalDate,
            noticeDeadlineDate: row.noticeDeadlineDate,
            noticePeriodValue: row.noticePeriodValue,
            noticePeriodUnit: row.noticePeriodUnit,
            autoRenewal: true,
            ownerUserId: row.ownerUserId,
            evidenceConfidence: row.evidenceConfidence,
            contractValueAmount: row.contractValueAmount,
            contractValueCurrency: row.contractValueCurrency
          })
        };
      }),
    blockedRows: assessment.results
      .filter((result): result is SaasRenewalImportCleanupResult & { status: "needs_review" | "rejected" } => result.status !== "ready")
      .map((result) => ({
        rowNumber: result.rowNumber,
        status: result.status,
        issueCodes: result.issues.map((item) => item.code)
      }))
  };
}

function parseCsv(value: string): SaasRenewalImportRow[] {
  const [headerLine, ...lines] = value.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!headerLine) return [];
  const headers = splitCsv(headerLine).map((item) => item.trim());
  assertSaasRenewalImportTemplateHeaders(headers);

  return lines
    .map((line) => mapRowFromHeaders(headers, splitCsv(line)))
    .filter((row) => Object.values(row).some((cell) => String(cell ?? "").trim().length > 0));
}

function splitCsv(line: string) {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map((item) => item.trim());
}

function assertSaasRenewalImportTemplateHeaders(headers: string[]) {
  const expected = [...SAAS_RENEWAL_IMPORT_TEMPLATE_HEADERS];
  const matches =
    headers.length === expected.length &&
    headers.every((header, index) => header === expected[index]);

  if (!matches) {
    throw new SaasRenewalImportTemplateError(
      `SaaS renewal import must use these columns: ${expected.join(", ")}.`
    );
  }
}

function mapRowFromHeaders(
  headers: string[],
  values: Array<string | number | boolean | Date | undefined>
): SaasRenewalImportRow {
  const row = emptyRow();
  headers.forEach((header, index) => {
    if (SAAS_RENEWAL_IMPORT_TEMPLATE_HEADERS.includes(header as SaasRenewalImportHeader)) {
      row[header as SaasRenewalImportHeader] = values[index] ?? "";
    }
  });
  return row;
}

function normalizeSaasRenewalImportRow(
  row: SaasRenewalImportRow,
  ownersByEmail: Map<string, SaasRenewalImportOwner>
): NormalizedSaasRenewalImportRow {
  const vendorName = normalizeOptionalString(row.vendor_name) ?? "";
  const productName = normalizeOptionalString(row.product_name) ?? "";
  const noticePeriod = parseNoticePeriod(row.notice_period);
  const renewalDate = normalizeDate(row.renewal_date);
  const noticeDeadlineDate = normalizeDate(row.notice_deadline_date);
  const ownerEmail = normalizeOptionalString(row.owner_email)?.toLowerCase() ?? null;
  const owner = ownerEmail ? ownersByEmail.get(ownerEmail) ?? null : null;
  const sourceNotes = normalizeOptionalString(row.source_notes);
  const contractValueAmount = normalizeMoney(row.contract_value_amount);
  const contractValueCurrency = normalizeCurrency(row.contract_value_currency);
  const calculatedNoticeDeadline = calculateNoticeDeadline({
    renewalDate,
    noticeDeadlineDate,
    noticePeriodValue: noticePeriod.value,
    noticePeriodUnit: noticePeriod.unit,
    autoRenewal: true
  });

  const vendorKey = normalizeVendorKey(vendorName);
  const productKey = normalizeDuplicatePart(productName);
  return {
    vendorName,
    vendorKey,
    productName,
    productKey,
    renewalDate,
    noticeDeadlineDate,
    noticePeriodValue: noticePeriod.value,
    noticePeriodUnit: noticePeriod.unit,
    calculatedNoticeDeadline,
    contractValueAmount,
    contractValueCurrency,
    ownerEmail,
    ownerUserId: owner?.userId ?? null,
    ownerLabel: owner?.label ?? null,
    departmentCategory: normalizeOptionalString(row.department_category),
    sourceNotes,
    evidenceConfidence: deriveEvidenceConfidence(sourceNotes),
    duplicateKey: buildSaasRenewalImportDuplicateKey({
      vendorName,
      productName,
      renewalDate,
      noticeDeadlineDate: calculatedNoticeDeadline
    })
  };
}

function emptyRow(): SaasRenewalImportRow {
  return SAAS_RENEWAL_IMPORT_TEMPLATE_HEADERS.reduce<SaasRenewalImportRow>((acc, header) => {
    acc[header] = "";
    return acc;
  }, {} as SaasRenewalImportRow);
}

function normalizeOwnersByEmail(
  ownersByEmail?: Map<string, SaasRenewalImportOwner> | Record<string, SaasRenewalImportOwner>
) {
  if (!ownersByEmail) return new Map<string, SaasRenewalImportOwner>();
  if (ownersByEmail instanceof Map) {
    return new Map(Array.from(ownersByEmail.entries()).map(([email, owner]) => [email.toLowerCase(), owner]));
  }
  return new Map(Object.entries(ownersByEmail).map(([email, owner]) => [email.toLowerCase(), owner]));
}

function normalizeOptionalString(value: unknown) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function normalizeDate(value: unknown) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed?.y || !parsed.m || !parsed.d) return null;
    return [
      String(parsed.y).padStart(4, "0"),
      String(parsed.m).padStart(2, "0"),
      String(parsed.d).padStart(2, "0")
    ].join("-");
  }

  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  if (/^\d{4}-\d{2}-\d{2}T/.test(normalized)) return normalized.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(normalized)) return null;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeMoney(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized.replaceAll(",", ""));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function normalizeCurrency(value: unknown) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function parseNoticePeriod(value: unknown): { value: number | null; unit: NoticePeriodUnit | null } {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return { value: null, unit: null };
  const match = /^(\d+)\s*(day|days|week|weeks|month|months)$/.exec(normalized);
  if (!match) return { value: null, unit: null };
  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount <= 0) return { value: null, unit: null };
  const unitText = match[2];
  const unit: NoticePeriodUnit = unitText?.startsWith("day")
    ? "days"
    : unitText?.startsWith("week")
      ? "weeks"
      : "months";
  return { value: amount, unit };
}

function normalizeVendorKey(value: string) {
  return normalizeDuplicatePart(value)
    .replace(/\b(inc|inc\.|llc|ltd|limited|corp|corporation|gmbh|s\.?a\.?|plc)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDuplicatePart(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function deriveEvidenceConfidence(sourceNotes: string | null) {
  if (!sourceNotes) return 0.45;
  if (/manual|estimated|unknown|verbal|spreadsheet only/i.test(sourceNotes)) return 0.6;
  if (/contract|invoice|order form|renewal notice|vendor portal|imported source/i.test(sourceNotes)) return 0.9;
  return 0.75;
}

function issue(
  code: SaasRenewalImportCleanupIssueCode,
  field: SaasRenewalImportCleanupIssue["field"],
  severity: SaasRenewalImportCleanupIssue["severity"],
  message: string
): SaasRenewalImportCleanupIssue {
  return { code, field, severity, message };
}

function countIssue(results: SaasRenewalImportCleanupResult[], code: SaasRenewalImportCleanupIssueCode) {
  return results.filter((row) => row.issues.some((issueItem) => issueItem.code === code)).length;
}

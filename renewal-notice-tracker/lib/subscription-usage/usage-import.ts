import crypto from "node:crypto";
import * as XLSX from "xlsx";
import {
  SUBSCRIPTION_USAGE_IMPORT_TEMPLATE_HEADERS,
  type NormalizedSubscriptionUsageRow,
  type SubscriptionUsageImportAssessment,
  type SubscriptionUsageImportAssessmentRow,
  type SubscriptionUsageImportHeader,
  type SubscriptionUsageImportIssue,
  type SubscriptionUsageImportRow,
  type SubscriptionUsageIssueCode
} from "@/lib/subscription-usage/types";

export class SubscriptionUsageImportTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionUsageImportTemplateError";
  }
}

export function parseSubscriptionUsageImportFile(fileName: string, buffer: Buffer): SubscriptionUsageImportRow[] {
  if (fileName.toLowerCase().endsWith(".csv")) {
    return parseCsv(buffer.toString("utf8"));
  }

  if (!/\.(xlsx|xls)$/i.test(fileName)) {
    throw new SubscriptionUsageImportTemplateError("Subscription usage import must be a CSV or XLSX file.");
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
  assertTemplateHeaders(headers);

  return dataRows
    .filter((row) => row.some((value) => String(value ?? "").trim().length > 0))
    .map((row) => mapRowFromHeaders(headers, row));
}

export function assessSubscriptionUsageRows(
  rows: SubscriptionUsageImportRow[],
  options: {
    sourceLabel: string;
    collectedAt?: string;
    existingRowHashes?: Set<string>;
    allowMissingPurchasedSeats?: boolean;
    allowMissingCostCurrency?: boolean;
  }
): SubscriptionUsageImportAssessment {
  const collectedAt = normalizeTimestamp(options.collectedAt) ?? new Date().toISOString();
  const normalizedRows = rows.map((row) => normalizeSubscriptionUsageRow(row, options.sourceLabel, collectedAt));
  const counts = new Map<string, number>();

  for (const row of normalizedRows) {
    counts.set(row.sourceRowHash, (counts.get(row.sourceRowHash) ?? 0) + 1);
  }

  const assessedRows = normalizedRows.map<SubscriptionUsageImportAssessmentRow>((row, index) => {
    const raw = rows[index] ?? emptyRow();
    const issues: SubscriptionUsageImportIssue[] = [];

    if (!row.vendor) issues.push(issue("missing_vendor", "vendor", "error", "Vendor is required."));
    if (!row.product) issues.push(issue("missing_product", "product", "error", "Product is required."));
    if (raw.annual_cost !== undefined && raw.annual_cost !== null && String(raw.annual_cost).trim() && row.annualCost === null) {
      issues.push(issue("invalid_annual_cost", "annual_cost", "error", "Annual cost must be a finite non-negative number."));
    }
    if (!row.currency) {
      issues.push(issue("invalid_currency", "currency", options.allowMissingCostCurrency ? "warning" : "error", options.allowMissingCostCurrency
        ? "Reviewed cost currency is unavailable; savings cannot be calculated."
        : "Currency must be exactly 3 uppercase letters."));
    }
    if (raw.purchased_seats === undefined || raw.purchased_seats === null || String(raw.purchased_seats).trim() === "") {
      issues.push(issue("missing_purchased_seats", "purchased_seats", options.allowMissingPurchasedSeats ? "warning" : "error", options.allowMissingPurchasedSeats
        ? "Purchased seats are unavailable; assigned-user evidence may be reviewed but seat waste cannot be calculated."
        : "Purchased seats are required for utilization calculations."));
    } else if (row.purchasedSeats === null) {
      issues.push(issue("invalid_purchased_seats", "purchased_seats", "error", "Purchased seats must be a finite non-negative number."));
    }
    if (raw.assigned_seats && row.assignedSeats === null) {
      issues.push(issue("invalid_assigned_seats", "assigned_seats", "error", "Assigned seats must be a finite non-negative number."));
    }
    if (raw.active_users_30d && row.activeUsers30d === null) {
      issues.push(issue("invalid_active_users_30d", "active_users_30d", "error", "Active users over 30 days must be a finite non-negative number."));
    }
    if (raw.active_users_90d && row.activeUsers90d === null) {
      issues.push(issue("invalid_active_users_90d", "active_users_90d", "error", "Active users over 90 days must be a finite non-negative number."));
    }
    if (row.purchasedSeats !== null && row.activeUsers30d !== null && row.activeUsers30d > row.purchasedSeats) {
      issues.push(issue("active_users_exceed_purchased", "active_users_30d", "warning", "Active users exceed purchased seats; review before using savings calculations."));
    }
    if (raw.last_activity_at && !row.lastActivityAt) {
      issues.push(issue("invalid_last_activity_at", "last_activity_at", "warning", "Last activity date could not be parsed."));
    }
    if (!row.sourceLabel) {
      issues.push(issue("missing_source", "row", "error", "A source label is required before import."));
    }
    if ((counts.get(row.sourceRowHash) ?? 0) > 1 || options.existingRowHashes?.has(row.sourceRowHash)) {
      issues.push(issue("duplicate_import_row", "row", "warning", "This row appears to duplicate another usage import row."));
    }
    if (row.isSample) {
      issues.push(issue("sample_usage", "row", "warning", "Sample usage is excluded from real savings totals."));
    }

    const hasErrors = issues.some((item) => item.severity === "error");
    const status = hasErrors ? "rejected" : issues.length > 0 ? "needs_review" : "ready";
    return {
      rowNumber: index + 2,
      status,
      issues,
      normalized: {
        ...row,
        trustState: row.isSample ? "sample" : status === "ready" ? "trusted" : status === "rejected" ? "rejected" : "needs_review"
      }
    };
  });

  const readyRows = assessedRows.filter((row) => row.status === "ready" && !row.normalized.isSample);
  const currency = readyRows.find((row) => row.normalized.currency)?.normalized.currency ?? null;

  return {
    rows: assessedRows,
    summary: {
      totalRows: assessedRows.length,
      readyCount: readyRows.length,
      needsReviewCount: assessedRows.filter((row) => row.status === "needs_review").length,
      rejectedCount: assessedRows.filter((row) => row.status === "rejected").length,
      duplicateCount: countIssue(assessedRows, "duplicate_import_row"),
      sampleCount: assessedRows.filter((row) => row.normalized.isSample).length,
      estimatedAnnualCost: readyRows.reduce((total, row) => total + Math.max(0, row.normalized.annualCost ?? 0), 0),
      currency,
      partialSuccess: readyRows.length > 0 && readyRows.length < assessedRows.length
    }
  };
}

export function buildSubscriptionUsageErrorCsv(rows: SubscriptionUsageImportAssessmentRow[]) {
  const header = ["row_number", "status", "issue_codes", "message"].join(",");
  const lines = rows
    .filter((row) => row.issues.length > 0)
    .map((row) =>
      [
        row.rowNumber,
        row.status,
        sanitizeCsvCell(row.issues.map((issueItem) => issueItem.code).join("|")),
        sanitizeCsvCell(row.issues.map((issueItem) => issueItem.message).join(" "))
      ].join(",")
    );
  return [header, ...lines].join("\n");
}

export function buildSubscriptionUsageImportIdempotencyKey(input: {
  organizationId: string;
  fileName: string;
  rowHashes: string[];
}) {
  return hashStableJson({
    organizationId: input.organizationId,
    fileName: input.fileName.toLowerCase(),
    rowHashes: [...input.rowHashes].sort()
  });
}

function parseCsv(value: string): SubscriptionUsageImportRow[] {
  const [headerLine, ...lines] = value.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!headerLine) return [];
  const headers = splitCsv(headerLine).map((item) => item.trim());
  assertTemplateHeaders(headers);

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

function assertTemplateHeaders(headers: string[]) {
  const expected = [...SUBSCRIPTION_USAGE_IMPORT_TEMPLATE_HEADERS];
  const matches = headers.length === expected.length && headers.every((header, index) => header === expected[index]);

  if (!matches) {
    throw new SubscriptionUsageImportTemplateError(
      `Subscription usage import must use these columns: ${expected.join(", ")}.`
    );
  }
}

function mapRowFromHeaders(headers: string[], values: Array<string | number | boolean | Date | undefined>) {
  const row = emptyRow();
  headers.forEach((header, index) => {
    if (SUBSCRIPTION_USAGE_IMPORT_TEMPLATE_HEADERS.includes(header as SubscriptionUsageImportHeader)) {
      row[header as SubscriptionUsageImportHeader] = values[index] ?? "";
    }
  });
  return row;
}

function normalizeSubscriptionUsageRow(
  row: SubscriptionUsageImportRow,
  sourceLabel: string,
  collectedAt: string
): NormalizedSubscriptionUsageRow {
  const vendor = normalizeText(row.vendor) ?? "";
  const product = normalizeText(row.product) ?? "";
  const normalizedVendor = normalizeKey(vendor);
  const normalizedProduct = normalizeKey(product);
  const isSample = /sample|demo/i.test(String(row.contract_reference ?? "")) || /sample|demo/i.test(sourceLabel);
  const normalized = {
    vendor,
    normalizedVendor,
    product,
    normalizedProduct,
    category: normalizeText(row.category),
    annualCost: normalizeNonNegativeNumber(row.annual_cost),
    currency: normalizeCurrency(row.currency),
    purchasedSeats: normalizeNonNegativeNumber(row.purchased_seats),
    assignedSeats: normalizeNonNegativeNumber(row.assigned_seats),
    activeUsers30d: normalizeNonNegativeNumber(row.active_users_30d),
    activeUsers90d: normalizeNonNegativeNumber(row.active_users_90d),
    lastActivityAt: normalizeDate(row.last_activity_at),
    department: normalizeText(row.department),
    owner: normalizeText(row.owner),
    contractReference: normalizeText(row.contract_reference),
    sourceLabel: normalizeText(sourceLabel) ?? "",
    collectedAt,
    confidence: isSample ? 0 : 0.8,
    trustState: isSample ? "sample" as const : "needs_review" as const,
    isSample,
    warningCodes: normalizeWarningCodes(row.warning_codes),
    evidenceState: normalizeSubscriptionUsageEvidenceState(row.evidence_state),
    sourceRowHash: ""
  };

  return {
    ...normalized,
    sourceRowHash: hashStableJson({
      vendor: normalized.normalizedVendor,
      product: normalized.normalizedProduct,
      annualCost: normalized.annualCost,
      currency: normalized.currency,
      purchasedSeats: normalized.purchasedSeats,
      activeUsers30d: normalized.activeUsers30d,
      contractReference: normalized.contractReference
    })
  };
}

function normalizeWarningCodes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 25);
}

export function normalizeSubscriptionUsageEvidenceState(value: unknown): NormalizedSubscriptionUsageRow["evidenceState"] {
  return ["complete", "partial", "missing", "stale", "unmapped", "conflicting"].includes(String(value))
    ? String(value) as NormalizedSubscriptionUsageRow["evidenceState"]
    : "complete";
}

function emptyRow(): SubscriptionUsageImportRow {
  return SUBSCRIPTION_USAGE_IMPORT_TEMPLATE_HEADERS.reduce<SubscriptionUsageImportRow>((acc, header) => {
    acc[header] = "";
    return acc;
  }, {} as SubscriptionUsageImportRow);
}

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text.length > 0 ? text : null;
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(inc|inc\.|llc|ltd|limited|corp|corporation|gmbh|s\.?a\.?|plc)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeNonNegativeNumber(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text.replaceAll(",", ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeCurrency(value: unknown) {
  const text = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(text) ? text : null;
}

function normalizeDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00:00.000Z`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeTimestamp(value: unknown) {
  const date = normalizeDate(value);
  return date;
}

function hashStableJson(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function issue(
  code: SubscriptionUsageIssueCode,
  field: SubscriptionUsageImportIssue["field"],
  severity: SubscriptionUsageImportIssue["severity"],
  message: string
): SubscriptionUsageImportIssue {
  return { code, field, severity, message };
}

function countIssue(rows: SubscriptionUsageImportAssessmentRow[], code: SubscriptionUsageIssueCode) {
  return rows.filter((row) => row.issues.some((issueItem) => issueItem.code === code)).length;
}

function sanitizeCsvCell(value: string) {
  const safe = value.replaceAll("\"", "\"\"");
  const prefixed = /^[=+\-@]/.test(safe) ? `'${safe}` : safe;
  return `"${prefixed}"`;
}

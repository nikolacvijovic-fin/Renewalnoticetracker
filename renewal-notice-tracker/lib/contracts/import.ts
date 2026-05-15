import * as XLSX from "xlsx";

export const SHIPPED_IMPORT_TEMPLATE_HEADERS = [
  "contract_title",
  "counterparty_name",
  "notice_deadline_date",
  "renewal_date",
  "expiration_date",
  "termination_window",
  "owner_email",
  "department",
  "auto_renewal_flag",
  "contract_value",
  "source_file_name"
] as const;

export type ShippedImportTemplateHeader = (typeof SHIPPED_IMPORT_TEMPLATE_HEADERS)[number];
type ImportCellValue = string | number | boolean | Date | null | undefined;

export type ImportContractRow = {
  contract_title: ImportCellValue;
  counterparty_name?: ImportCellValue;
  notice_deadline_date?: ImportCellValue;
  renewal_date?: ImportCellValue;
  expiration_date?: ImportCellValue;
  termination_window?: ImportCellValue;
  owner_email?: ImportCellValue;
  department?: ImportCellValue;
  auto_renewal_flag?: ImportCellValue;
  contract_value?: ImportCellValue;
  source_file_name?: ImportCellValue;
};

export type NormalizedImportRow = {
  contract_title: string;
  counterparty_name: string | null;
  notice_deadline_date: string | null;
  renewal_date: string | null;
  expiration_date: string | null;
  termination_window: string | null;
  owner_email: string | null;
  department: string | null;
  auto_renewal: boolean | null;
  contract_value: number | null;
  source_file_name: string | null;
};

export type ImportRowValidationError = {
  row: number;
  field: string;
  error: string;
};

export type ImportRowResultStatus =
  | "imported"
  | "imported_with_warnings"
  | "failed"
  | "needs_cleanup"
  | "duplicate_suspected";

export type ImportRowResult = {
  row: number;
  status: ImportRowResultStatus;
  field?: string;
  contract_title: string;
  counterparty_name: string | null;
  owner_email: string | null;
  warnings: string[];
  errors: string[];
  normalized: NormalizedImportRow;
};

export type ImportAssessment = {
  results: ImportRowResult[];
  cleanupTriggers: string[];
  summary: {
    totalRows: number;
    importedCount: number;
    importedWithWarningsCount: number;
    failedCount: number;
    needsCleanupCount: number;
    duplicateSuspectedCount: number;
    missingOwnerCount: number;
    missingP0Count: number;
  };
};

export class FixedImportTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixedImportTemplateError";
  }
}

export function parseImportFile(fileName: string, buffer: Buffer): ImportContractRow[] {
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
  assertFixedImportTemplateHeaders(headers);

  return dataRows
    .filter((row) => row.some((value) => String(value ?? "").trim().length > 0))
    .map((row) => mapRowFromHeaders(headers, row));
}

export function normalizeImportRows(rows: ImportContractRow[]): NormalizedImportRow[] {
  return rows.map((row) => ({
    contract_title: String(row.contract_title ?? "").trim(),
    counterparty_name: normalizeOptionalString(row.counterparty_name),
    notice_deadline_date: normalizeDate(row.notice_deadline_date),
    renewal_date: normalizeDate(row.renewal_date),
    expiration_date: normalizeDate(row.expiration_date),
    termination_window: normalizeOptionalString(row.termination_window),
    owner_email: normalizeOptionalString(row.owner_email)?.toLowerCase() ?? null,
    department: normalizeOptionalString(row.department),
    auto_renewal: normalizeBoolean(row.auto_renewal_flag),
    contract_value: normalizeNumber(row.contract_value),
    source_file_name: normalizeOptionalString(row.source_file_name)
  }));
}

export function assessImportRows(
  rows: ImportContractRow[],
  options?: {
    knownOwnerEmails?: Set<string>;
    existingDuplicateKeys?: Set<string>;
  }
): ImportAssessment {
  const normalizedRows = normalizeImportRows(rows);
  const duplicateCounts = new Map<string, number>();

  for (const row of normalizedRows) {
    const duplicateKey = buildDuplicateKey(row);
    if (!duplicateKey) continue;
    duplicateCounts.set(duplicateKey, (duplicateCounts.get(duplicateKey) ?? 0) + 1);
  }

  const results = normalizedRows.map<ImportRowResult>((row, index) => {
    const raw = rows[index] ?? { contract_title: "" };
    const rowNumber = index + 2;
    const errors: string[] = [];
    const warnings: string[] = [];
    let field: string | undefined;

    if (!row.contract_title) {
      field = "contract_title";
      errors.push("Contract title is required.");
    }

    if (!row.counterparty_name) {
      field = field ?? "counterparty_name";
      errors.push("Counterparty name is required.");
    }

    const p0DateFields: Array<
      keyof Pick<ImportContractRow, "notice_deadline_date" | "renewal_date" | "expiration_date">
    > = ["notice_deadline_date", "renewal_date", "expiration_date"];

    for (const dateField of p0DateFields) {
      const rawValue = String(raw[dateField] ?? "").trim();
      if (!rawValue) continue;
      if (normalizeDate(rawValue) === null) {
        field = field ?? dateField;
        errors.push(
          "Use YYYY-MM-DD or a valid spreadsheet date. Ambiguous slash-form dates are rejected."
        );
      }
    }

    if (!row.notice_deadline_date && !row.renewal_date && !row.expiration_date) {
      field = field ?? "notice_deadline_date";
      errors.push(
        "At least one P0 date is required: notice_deadline_date, renewal_date, or expiration_date."
      );
    }

    const rawAutoRenewal = String(raw.auto_renewal_flag ?? "").trim();
    if (rawAutoRenewal && row.auto_renewal === null) {
      warnings.push("Auto-renewal could not be normalized. Review before relying on this field.");
    }

    const rawContractValue = String(raw.contract_value ?? "").trim();
    if (rawContractValue && row.contract_value === null) {
      warnings.push("Contract value could not be normalized and needs cleanup.");
    }

    if (!row.owner_email) {
      warnings.push("Owner email is missing, so the trusted workflow will stay blocked.");
    } else if (options?.knownOwnerEmails && !options.knownOwnerEmails.has(row.owner_email)) {
      warnings.push("Owner email does not match a workspace member and needs cleanup.");
    }

    if (!row.department) {
      warnings.push("Department is missing.");
    }

    if (row.auto_renewal === null) {
      warnings.push("Auto-renewal was not provided.");
    }

    if (row.contract_value === null) {
      warnings.push("Contract value was not provided.");
    }

    if (!row.source_file_name) {
      warnings.push("Source file name was not provided.");
    }

    const duplicateKey = buildDuplicateKey(row);
    const duplicateSuspected =
      Boolean(duplicateKey) &&
      ((duplicateCounts.get(duplicateKey!) ?? 0) > 1 ||
        Boolean(options?.existingDuplicateKeys?.has(duplicateKey!)));

    if (duplicateSuspected) {
      warnings.push("This row looks like a duplicate of an existing or same-file contract.");
    }

    const ownerNeedsCleanup =
      !row.owner_email ||
      Boolean(options?.knownOwnerEmails && row.owner_email && !options.knownOwnerEmails.has(row.owner_email));

    const status: ImportRowResultStatus =
      errors.length > 0
        ? "failed"
        : duplicateSuspected
          ? "duplicate_suspected"
          : ownerNeedsCleanup
            ? "needs_cleanup"
            : warnings.length > 0
              ? "imported_with_warnings"
              : "imported";

    return {
      row: rowNumber,
      status,
      field,
      contract_title: row.contract_title,
      counterparty_name: row.counterparty_name,
      owner_email: row.owner_email,
      warnings,
      errors,
      normalized: row
    };
  });

  const totalRows = results.length;
  const failedCount = results.filter((row) => row.status === "failed").length;
  const duplicateSuspectedCount = results.filter((row) => row.status === "duplicate_suspected").length;
  const needsCleanupCount = results.filter((row) => row.status === "needs_cleanup").length;
  const importedWithWarningsCount = results.filter((row) => row.status === "imported_with_warnings").length;
  const importedCount = results.filter((row) => row.status === "imported").length;
  const missingOwnerCount = results.filter((row) =>
    row.warnings.some((warning) => warning.includes("Owner email"))
  ).length;
  const missingP0Count = results.filter((row) =>
    row.errors.some((error) => error.includes("At least one P0 date is required"))
  ).length;

  const cleanupTriggers: string[] = [];
  if (totalRows > 0 && failedCount / totalRows > 0.2) {
    cleanupTriggers.push("More than 20% of rows failed import validation.");
  }
  if (totalRows > 0 && missingOwnerCount / totalRows > 0.3) {
    cleanupTriggers.push("More than 30% of rows are missing owners or need owner cleanup.");
  }
  if (totalRows > 0 && missingP0Count / totalRows > 0.3) {
    cleanupTriggers.push("More than 30% of rows are missing a required P0 date.");
  }
  if (totalRows > 0 && duplicateSuspectedCount / totalRows > 0.15) {
    cleanupTriggers.push("More than 15% of rows look like duplicates and need cleanup.");
  }

  return {
    results,
    cleanupTriggers,
    summary: {
      totalRows,
      importedCount,
      importedWithWarningsCount,
      failedCount,
      needsCleanupCount,
      duplicateSuspectedCount,
      missingOwnerCount,
      missingP0Count
    }
  };
}

export function validateImportRows(rows: ImportContractRow[]): ImportRowValidationError[] {
  return assessImportRows(rows).results.flatMap((result) =>
    result.errors.map((error) => ({
      row: result.row,
      field: result.field ?? inferFieldForError(error),
      error
    }))
  );
}

function parseCsv(value: string): ImportContractRow[] {
  const [headerLine, ...lines] = value.split(/\r?\n/).filter(Boolean);
  if (!headerLine) return [];
  const headers = splitCsv(headerLine).map((item) => item.trim());
  assertFixedImportTemplateHeaders(headers);

  return lines
    .map((line) => mapRowFromHeaders(headers, splitCsv(line)))
    .filter((row) => Object.values(row).some((value) => String(value ?? "").trim().length > 0));
}

function splitCsv(line: string) {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
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

function normalizeOptionalString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNumber(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBoolean(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (["true", "yes", "1"].includes(normalized)) return true;
  if (["false", "no", "0"].includes(normalized)) return false;
  return null;
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
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(normalized)) {
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function assertFixedImportTemplateHeaders(headers: string[]) {
  const expected = [...SHIPPED_IMPORT_TEMPLATE_HEADERS];
  const matches =
    headers.length === expected.length &&
    headers.every((header, index) => header === expected[index]);

  if (!matches) {
    throw new FixedImportTemplateError(
      `Import file must use the fixed NoticeControl template columns: ${expected.join(", ")}.`
    );
  }
}

function mapRowFromHeaders(
  headers: string[],
  values: Array<string | number | boolean | Date | undefined>
): ImportContractRow {
  return headers.reduce<ImportContractRow>((acc, header, index) => {
    if (header) {
      acc[header as keyof ImportContractRow] = values[index] ?? "";
    }
    return acc;
  }, { contract_title: "" as ImportCellValue });
}

function buildDuplicateKey(row: NormalizedImportRow) {
  if (!row.contract_title || !row.counterparty_name) return null;
  if (!row.notice_deadline_date && !row.renewal_date && !row.expiration_date) return null;
  return [
    row.contract_title.trim().toLowerCase(),
    row.counterparty_name.trim().toLowerCase(),
    row.notice_deadline_date ?? "",
    row.renewal_date ?? "",
    row.expiration_date ?? ""
  ].join("|");
}

function inferFieldForError(error: string) {
  if (error.includes("Contract title")) return "contract_title";
  if (error.includes("Counterparty name")) return "counterparty_name";
  if (error.includes("P0 date")) return "notice_deadline_date";
  return "row";
}

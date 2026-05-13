import * as XLSX from "xlsx";

export type ImportContractRow = {
  contract_title: string;
  counterparty_name?: string;
  renewal_date?: string;
  expiration_date?: string;
  notice_deadline_date?: string;
  termination_window?: string;
  auto_renewal_flag?: string;
  owner_email?: string;
  recipient_emails?: string;
};

export type NormalizedImportRow = {
  contract_title: string;
  counterparty_name: string | null;
  renewal_date: string | null;
  expiration_date: string | null;
  notice_deadline_date: string | null;
  termination_window: string | null;
  auto_renewal: boolean | null;
  owner_email: string | null;
  recipient_emails: string | null;
};

export type ImportRowValidationError = {
  row: number;
  field: string;
  error: string;
};

export function parseImportFile(fileName: string, buffer: Buffer): ImportContractRow[] {
  if (fileName.toLowerCase().endsWith(".csv")) {
    return parseCsv(buffer.toString("utf8"));
  }

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) return [];
  return XLSX.utils.sheet_to_json<ImportContractRow>(worksheet, { defval: "" });
}

export function normalizeImportRows(rows: ImportContractRow[]): NormalizedImportRow[] {
  return rows
    .map((row) => ({
      contract_title: String(row.contract_title ?? "").trim(),
      counterparty_name: normalizeOptionalString(row.counterparty_name),
      renewal_date: normalizeDate(row.renewal_date),
      expiration_date: normalizeDate(row.expiration_date),
      notice_deadline_date: normalizeDate(row.notice_deadline_date),
      termination_window: normalizeOptionalString(row.termination_window),
      auto_renewal: normalizeBoolean(row.auto_renewal_flag),
      owner_email: normalizeOptionalString(row.owner_email)?.toLowerCase() ?? null,
      recipient_emails: normalizeOptionalString(row.recipient_emails)
    }))
    .filter((row) => row.contract_title.length > 0);
}

export function validateImportRows(rows: ImportContractRow[]): ImportRowValidationError[] {
  const errors: ImportRowValidationError[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;

    if (!String(row.contract_title ?? "").trim()) {
      errors.push({ row: rowNumber, field: "contract_title", error: "Contract title is required." });
    }

    const dateFields: Array<keyof Pick<
      ImportContractRow,
      "notice_deadline_date" | "renewal_date" | "expiration_date"
    >> = ["notice_deadline_date", "renewal_date", "expiration_date"];

    for (const field of dateFields) {
      const raw = String(row[field] ?? "").trim();
      if (!raw) continue;
      if (normalizeDate(raw) === null) {
        errors.push({
          row: rowNumber,
          field,
          error: "Use YYYY-MM-DD or a valid spreadsheet date. Ambiguous slash-form dates are rejected."
        });
      }
    }

    const rawAutoRenewal = String(row.auto_renewal_flag ?? "").trim();
    if (rawAutoRenewal && normalizeBoolean(rawAutoRenewal) === null) {
      errors.push({
        row: rowNumber,
        field: "auto_renewal_flag",
        error: "Use true/false, yes/no, or 1/0 for auto-renewal."
      });
    }
  });

  return errors;
}

function parseCsv(value: string): ImportContractRow[] {
  const [headerLine, ...lines] = value.split(/\r?\n/).filter(Boolean);
  if (!headerLine) return [];
  const headers = headerLine.split(",").map((item) => item.trim());

  return lines.map((line) => {
    const parts = splitCsv(line);
    return headers.reduce<ImportContractRow>((acc, header, index) => {
      if (header) {
        acc[header as keyof ImportContractRow] = parts[index] ?? "";
      }
      return acc;
    }, { contract_title: "" });
  });
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

  // Slash-form dates are locale-ambiguous. Force review instead of guessing.
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(normalized)) {
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

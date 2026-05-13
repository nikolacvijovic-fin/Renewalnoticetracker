import * as XLSX from "xlsx";

export type ExportRow = {
  contract_title: string;
  counterparty_name: string;
  contract_type: string;
  owner_name: string;
  department: string;
  status_tag: string;
  expiration_date: string;
  notice_deadline_date: string;
  auto_renewal: string;
  payment_terms: string;
  needs_review: string;
};

export function toCsv(rows: ExportRow[]) {
  const headers = Object.keys(rows[0] ?? {
    contract_title: "",
    counterparty_name: "",
    contract_type: "",
    owner_name: "",
    department: "",
    status_tag: "",
    expiration_date: "",
    notice_deadline_date: "",
    auto_renewal: "",
    payment_terms: "",
    needs_review: ""
  });

  return [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => escapeCsv(String(sanitizeSpreadsheetValue(row[header as keyof ExportRow] ?? ""))))
        .join(",")
    )
  ].join("\n");
}

export function toXlsxBuffer(rows: ExportRow[]) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(
    rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, sanitizeSpreadsheetValue(value)])
      )
    )
  );
  XLSX.utils.book_append_sheet(workbook, worksheet, "Contracts");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function escapeCsv(value: string) {
  const escaped = value.replace(/"/g, '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

function sanitizeSpreadsheetValue(value: unknown) {
  const stringValue = String(value ?? "");
  return /^[=+\-@]/.test(stringValue) ? `'${stringValue}` : stringValue;
}

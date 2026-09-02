import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/auth";
import { getScopedImportJobErrorReport } from "@/lib/contracts/import-jobs";

function toCsvValue(value: string | number | null | undefined) {
  const text = String(value ?? "");
  if (!text.includes(",") && !text.includes('"') && !text.includes("\n")) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { organizationId } = await requireOrganization();
  const report = await getScopedImportJobErrorReport(id, organizationId);
  const rows = [
    ["row", "status", "contract_title", "counterparty_name", "owner_email", "field", "error", "warnings"].join(","),
    ...report.errors.map((error) =>
      [
        toCsvValue(error.row),
        toCsvValue(error.status),
        toCsvValue(error.contract_title ?? ""),
        toCsvValue(error.counterparty_name ?? ""),
        toCsvValue(error.owner_email ?? ""),
        toCsvValue(error.field ?? ""),
        toCsvValue(error.error ?? ""),
        toCsvValue((error.warnings ?? []).join(" | "))
      ].join(",")
    )
  ].join("\n");

  return new NextResponse(rows, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report.file_name.replace(/\.[^.]+$/, "")}-error-report.csv"`
    }
  });
}

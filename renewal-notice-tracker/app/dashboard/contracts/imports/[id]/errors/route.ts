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
  context: { params: { id: string } }
) {
  const { organizationId } = await requireOrganization();
  const report = await getScopedImportJobErrorReport(context.params.id, organizationId);
  const rows = [
    ["row", "field", "error"].join(","),
    ...report.errors.map((error) =>
      [toCsvValue(error.row), toCsvValue(error.field ?? ""), toCsvValue(error.error)].join(",")
    )
  ].join("\n");

  return new NextResponse(rows, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report.file_name.replace(/\.[^.]+$/, "")}-error-report.csv"`
    }
  });
}

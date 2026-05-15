import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ImportJobResultRow = {
  row: number;
  status: string;
  contract_title?: string;
  counterparty_name?: string | null;
  owner_email?: string | null;
  error?: string;
  field?: string | null;
  warnings?: string[];
};

export type ImportJobSummary = {
  id: string;
  file_name: string;
  status: string;
  row_count: number;
  imported_count: number;
  created_at: string;
  error_count: number;
};

function parseErrorReport(value: unknown): ImportJobResultRow[] {
  if (Array.isArray(value)) {
    const parsed: ImportJobResultRow[] = [];
    for (const row of value) {
      if (!row || typeof row !== "object") continue;
      const typedRow = row as Record<string, unknown>;
      const parsedRow = Number(typedRow.row);
      const parsedStatus = typeof typedRow.status === "string" ? typedRow.status : null;
      if (!parsedStatus || Number.isNaN(parsedRow)) continue;
      parsed.push({
        row: parsedRow,
        status: parsedStatus,
        contract_title:
          typeof typedRow.contract_title === "string" ? typedRow.contract_title : undefined,
        counterparty_name:
          typeof typedRow.counterparty_name === "string" ? typedRow.counterparty_name : null,
        owner_email: typeof typedRow.owner_email === "string" ? typedRow.owner_email : null,
        error: typeof typedRow.error === "string" ? typedRow.error : undefined,
        field: typeof typedRow.field === "string" ? typedRow.field : null,
        warnings: Array.isArray(typedRow.warnings)
          ? typedRow.warnings.map(String).filter(Boolean)
          : []
      });
    }
    return parsed;
  }

  return [];
}

export async function getLatestImportJobSummary(organizationId: string): Promise<ImportJobSummary | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("import_jobs")
    .select("id, file_name, status, row_count, imported_count, created_at, error_report_json")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    file_name: data.file_name,
    status: data.status,
    row_count: data.row_count,
    imported_count: data.imported_count,
    created_at: data.created_at,
    error_count: parseErrorReport(data.error_report_json).filter((row) => row.status === "failed").length
  };
}

export async function getScopedImportJobErrorReport(importJobId: string, organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("import_jobs")
    .select("id, file_name, status, row_count, imported_count, error_report_json")
    .eq("id", importJobId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new Error("Import job not found for active organization.");
  }

  return {
    id: data.id,
    file_name: data.file_name,
    status: data.status,
    row_count: data.row_count,
    imported_count: data.imported_count,
    errors: parseErrorReport(data.error_report_json)
  };
}

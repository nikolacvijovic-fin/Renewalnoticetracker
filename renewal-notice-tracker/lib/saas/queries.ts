import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import {
  daysUntilOptOut,
  getOptOutUrgency,
  type OptOutUrgency
} from "@/lib/saas/renewal-defense";

export type SaasSoftwareRow =
  Database["public"]["Tables"]["saas_software_inventory"]["Row"];
export type SaasContractTermRow =
  Database["public"]["Tables"]["saas_contract_terms"]["Row"];
export type SaasOptOutWindowRow =
  Database["public"]["Tables"]["saas_opt_out_windows"]["Row"];
export type SaasRiskFindingRow =
  Database["public"]["Tables"]["saas_contract_risk_findings"]["Row"];

export type SaasOptOutClockItem = {
  software: SaasSoftwareRow;
  latestTerm: SaasContractTermRow | null;
  optOutWindow: SaasOptOutWindowRow | null;
  openFindings: SaasRiskFindingRow[];
  daysUntilOptOut: number | null;
  urgency: OptOutUrgency | null;
};

export type SaasOptOutClock = {
  items: SaasOptOutClockItem[];
  metrics: {
    softwareCount: number;
    openWindowCount: number;
    expiredCount: number;
    criticalCount: number;
    highCount: number;
    missingNoticeDeadlineCount: number;
    autoRenewalFindingCount: number;
  };
};

function latestByCreatedAt<T extends { created_at: string }>(rows: T[]) {
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

export async function requireScopedSaasSoftware(softwareId: string, organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("saas_software_inventory")
    .select("id, organization_id")
    .eq("id", softwareId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new Error("SaaS software record not found for active organization.");
  }

  return data;
}

export async function getSaasOptOutClock(organizationId: string): Promise<SaasOptOutClock> {
  const supabase = createServerSupabaseClient();
  const [softwareResult, termsResult, windowsResult, findingsResult] = await Promise.all([
    supabase
      .from("saas_software_inventory")
      .select("*")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("saas_contract_terms")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("saas_opt_out_windows")
      .select("*")
      .eq("organization_id", organizationId)
      .in("status", ["open", "expired"])
      .order("opt_out_deadline", { ascending: true }),
    supabase
      .from("saas_contract_risk_findings")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
  ]);

  for (const result of [softwareResult, termsResult, windowsResult, findingsResult]) {
    if (result.error) throw result.error;
  }

  const termsBySoftware = new Map<string, SaasContractTermRow[]>();
  for (const term of (termsResult.data ?? []) as SaasContractTermRow[]) {
    termsBySoftware.set(term.software_id, [...(termsBySoftware.get(term.software_id) ?? []), term]);
  }

  const windowsBySoftware = new Map<string, SaasOptOutWindowRow[]>();
  for (const window of (windowsResult.data ?? []) as SaasOptOutWindowRow[]) {
    windowsBySoftware.set(window.software_id, [...(windowsBySoftware.get(window.software_id) ?? []), window]);
  }

  const findingsBySoftware = new Map<string, SaasRiskFindingRow[]>();
  for (const finding of (findingsResult.data ?? []) as SaasRiskFindingRow[]) {
    findingsBySoftware.set(finding.software_id, [
      ...(findingsBySoftware.get(finding.software_id) ?? []),
      finding
    ]);
  }

  const items = ((softwareResult.data ?? []) as SaasSoftwareRow[]).map((software) => {
    const optOutWindow =
      (windowsBySoftware.get(software.id) ?? []).sort((a, b) =>
        a.opt_out_deadline.localeCompare(b.opt_out_deadline)
      )[0] ?? null;
    const urgency = getOptOutUrgency(optOutWindow?.opt_out_deadline ?? null);

    return {
      software,
      latestTerm: latestByCreatedAt(termsBySoftware.get(software.id) ?? []),
      optOutWindow,
      openFindings: findingsBySoftware.get(software.id) ?? [],
      daysUntilOptOut: daysUntilOptOut(optOutWindow?.opt_out_deadline ?? null),
      urgency
    };
  });

  return {
    items,
    metrics: {
      softwareCount: items.length,
      openWindowCount: items.filter((item) => item.optOutWindow?.status === "open").length,
      expiredCount: items.filter((item) => item.urgency === "expired").length,
      criticalCount: items.filter((item) => item.urgency === "critical").length,
      highCount: items.filter((item) => item.urgency === "high").length,
      missingNoticeDeadlineCount: items.filter((item) =>
        item.openFindings.some((finding) => finding.finding_type === "missing_notice_deadline")
      ).length,
      autoRenewalFindingCount: items.filter((item) =>
        item.openFindings.some((finding) => finding.finding_type === "auto_renewal")
      ).length
    }
  };
}

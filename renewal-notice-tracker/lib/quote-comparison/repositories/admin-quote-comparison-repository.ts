import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  RenewalQuoteComparison,
  RenewalQuoteFinding,
  SavingsOpportunity
} from "@/lib/quote-comparison/quote-types";

type UntypedSupabaseClient = ReturnType<typeof createAdminSupabaseClient>;

function admin() {
  return createAdminSupabaseClient() as UntypedSupabaseClient;
}

export async function insertAdminRenewalQuoteComparison(input: {
  organizationId: string;
  contractId: string;
  quoteFileId?: string | null;
  requestedByUserId?: string | null;
  source?: string;
}) {
  return admin()
    .from("renewal_quote_comparisons")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId,
      quote_file_id: input.quoteFileId ?? null,
      requested_by_user_id: input.requestedByUserId ?? null,
      source: input.source ?? "manual",
      status: "draft"
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: RenewalQuoteComparison | null; error: Error | null }>;
}

export async function updateAdminRenewalQuoteComparison(input: {
  organizationId: string;
  comparisonId: string;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("renewal_quote_comparisons")
    .update({ ...input.values, updated_at: new Date().toISOString() } as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.comparisonId)
    .select("*")
    .single() as unknown as Promise<{ data: RenewalQuoteComparison | null; error: Error | null }>;
}

export async function getAdminRenewalQuoteComparison(input: {
  organizationId: string;
  comparisonId: string;
}) {
  return admin()
    .from("renewal_quote_comparisons")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("id", input.comparisonId)
    .single() as unknown as Promise<{ data: RenewalQuoteComparison | null; error: Error | null }>;
}

export async function listAdminRenewalQuoteComparisons(input: {
  organizationId: string;
  contractId: string;
  limit?: number;
}) {
  return admin()
    .from("renewal_quote_comparisons")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("contract_id", input.contractId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 10) as unknown as Promise<{ data: RenewalQuoteComparison[] | null; error: Error | null }>;
}

export async function insertAdminRenewalQuoteFindings(input: {
  organizationId: string;
  contractId: string;
  comparisonId: string;
  findings: Array<Record<string, unknown>>;
}) {
  if (input.findings.length === 0) {
    return { data: [] as RenewalQuoteFinding[], error: null };
  }

  return admin()
    .from("renewal_quote_comparison_findings")
    .insert(
      input.findings.map((finding) => ({
        organization_id: input.organizationId,
        contract_id: input.contractId,
        comparison_id: input.comparisonId,
        ...finding
      })) as never
    )
    .select("*") as unknown as Promise<{ data: RenewalQuoteFinding[] | null; error: Error | null }>;
}

export async function listAdminRenewalQuoteFindings(input: {
  organizationId: string;
  contractId?: string;
  comparisonId?: string;
  limit?: number;
}) {
  let query = admin()
    .from("renewal_quote_comparison_findings")
    .select("*")
    .eq("organization_id", input.organizationId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 50);

  if (input.contractId) {
    query = query.eq("contract_id", input.contractId);
  }
  if (input.comparisonId) {
    query = query.eq("comparison_id", input.comparisonId);
  }

  return query as unknown as Promise<{ data: RenewalQuoteFinding[] | null; error: Error | null }>;
}

export async function getAdminRenewalQuoteFinding(input: {
  organizationId: string;
  findingId: string;
}) {
  return admin()
    .from("renewal_quote_comparison_findings")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("id", input.findingId)
    .single() as unknown as Promise<{ data: RenewalQuoteFinding | null; error: Error | null }>;
}

export async function updateAdminRenewalQuoteFinding(input: {
  organizationId: string;
  findingId: string;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("renewal_quote_comparison_findings")
    .update(input.values as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.findingId)
    .select("*")
    .single() as unknown as Promise<{ data: RenewalQuoteFinding | null; error: Error | null }>;
}

export async function insertAdminSavingsOpportunity(input: {
  organizationId: string;
  contractId: string;
  comparisonId?: string | null;
  opportunity: Record<string, unknown>;
}) {
  return admin()
    .from("savings_opportunities")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId,
      comparison_id: input.comparisonId ?? null,
      ...input.opportunity
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: SavingsOpportunity | null; error: Error | null }>;
}

export async function listAdminSavingsOpportunities(input: {
  organizationId: string;
  contractId?: string;
  comparisonId?: string;
  limit?: number;
}) {
  let query = admin()
    .from("savings_opportunities")
    .select("*")
    .eq("organization_id", input.organizationId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 50);

  if (input.contractId) {
    query = query.eq("contract_id", input.contractId);
  }
  if (input.comparisonId) {
    query = query.eq("comparison_id", input.comparisonId);
  }

  return query as unknown as Promise<{ data: SavingsOpportunity[] | null; error: Error | null }>;
}

export async function updateAdminSavingsOpportunity(input: {
  organizationId: string;
  opportunityId: string;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("savings_opportunities")
    .update({ ...input.values, updated_at: new Date().toISOString() } as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.opportunityId)
    .select("*")
    .single() as unknown as Promise<{ data: SavingsOpportunity | null; error: Error | null }>;
}

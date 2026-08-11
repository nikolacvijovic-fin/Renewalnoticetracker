import { createServerSupabaseClient } from "@/lib/supabase/server";

export type RevenueSourceContract = {
  id: string;
  owner_user_id: string | null;
  cycle_status: string | null;
  renewal_decision_status: string | null;
  department: string | null;
  status_tag: string | null;
  metadata: {
    contract_title?: string | null;
    counterparty_name?: string | null;
    contract_type?: string | null;
    renewal_date?: string | null;
    notice_deadline_date?: string | null;
    expiration_date?: string | null;
    auto_renewal?: boolean | null;
    needs_review?: boolean | null;
    has_weak_evidence?: boolean | null;
    contract_value_amount?: number | null;
    contract_value_currency?: string | null;
    financial_data_trust_status?: string | null;
  } | null;
  reminders: Array<{ id: string; status: string | null; remind_at: string | null }>;
};

export type RevenueSourceQuoteComparison = {
  id: string;
  contract_id: string;
  status: string;
  price_delta_amount: number | null;
  price_delta_percent: number | null;
  currency: string | null;
  overall_risk_level: string | null;
};

export type RevenueSourceQuoteFinding = {
  id: string;
  contract_id: string;
  comparison_id: string | null;
  finding_type: string;
  severity: string;
  confidence: number;
  status: string;
};

export type RevenueSourceSavingsOpportunity = {
  id: string;
  contract_id: string;
  comparison_id: string | null;
  opportunity_type: string;
  title: string;
  estimated_savings_amount: number | null;
  currency: string | null;
  confidence: number;
  status: string;
  owner_user_id: string | null;
};

export type RevenueSourceCommercialDecision = {
  id: string;
  contract_id: string;
  decision_status: string;
  commercial_risk_level: string;
  estimated_savings_amount: number | null;
  currency: string | null;
  blocker_codes: string[];
  warning_codes: string[];
  evidence_confidence: number;
  owner_user_id: string | null;
  approver_user_id: string | null;
  updated_at: string;
};

export type RevenueSourceNegotiationBrief = {
  id: string;
  contract_id: string;
  commercial_decision_id: string;
  status: string;
  target_savings_amount?: number | null;
  currency?: string | null;
  evidence_confidence?: number | null;
};

export type RevenueSourceOutreachOpportunity = {
  id: string;
  contract_id: string | null;
  commercial_decision_id: string | null;
  negotiation_brief_id: string | null;
  opportunity_type: string;
  status: string;
  priority: string;
  expected_commercial_impact: Record<string, unknown>;
  evidence_confidence: number;
};

export type RevenueIntelligenceSourceData = {
  organizationId: string;
  contracts: RevenueSourceContract[];
  quoteComparisons: RevenueSourceQuoteComparison[];
  quoteFindings: RevenueSourceQuoteFinding[];
  savingsOpportunities: RevenueSourceSavingsOpportunity[];
  commercialDecisions: RevenueSourceCommercialDecision[];
  negotiationBriefs: RevenueSourceNegotiationBrief[];
  outreachOpportunities: RevenueSourceOutreachOpportunity[];
};

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function loadRevenueIntelligenceSourceData(input: {
  organizationId: string;
  limit?: number;
  client?: ReturnType<typeof createServerSupabaseClient>;
}): Promise<RevenueIntelligenceSourceData> {
  const supabase = input.client ?? createServerSupabaseClient();
  const limit = Math.min(Math.max(input.limit ?? 1000, 1), 5000);
  const [
    contracts,
    quoteComparisons,
    quoteFindings,
    savingsOpportunities,
    commercialDecisions,
    negotiationBriefs,
    outreachOpportunities
  ] = await Promise.all([
    supabase
      .from("contracts")
      .select(`
        id,
        owner_user_id,
        cycle_status,
        renewal_decision_status,
        department,
        status_tag,
        contract_metadata (
          contract_title,
          counterparty_name,
          contract_type,
          renewal_date,
          notice_deadline_date,
          expiration_date,
          auto_renewal,
          needs_review,
          has_weak_evidence,
          contract_value_amount,
          contract_value_currency,
          financial_data_trust_status
        ),
        reminders (
          id,
          status,
          remind_at
        )
      `)
      .eq("organization_id", input.organizationId)
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("renewal_quote_comparisons")
      .select("id, contract_id, status, price_delta_amount, price_delta_percent, currency, overall_risk_level")
      .eq("organization_id", input.organizationId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("renewal_quote_findings")
      .select("id, contract_id, comparison_id, finding_type, severity, confidence, status")
      .eq("organization_id", input.organizationId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("savings_opportunities")
      .select("id, contract_id, comparison_id, opportunity_type, title, estimated_savings_amount, currency, confidence, status, owner_user_id")
      .eq("organization_id", input.organizationId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("renewal_commercial_decisions")
      .select("id, contract_id, decision_status, commercial_risk_level, estimated_savings_amount, currency, blocker_codes, warning_codes, evidence_confidence, owner_user_id, approver_user_id, updated_at")
      .eq("organization_id", input.organizationId)
      .neq("decision_status", "archived")
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("renewal_negotiation_briefs")
      .select("id, contract_id, commercial_decision_id, status, target_savings_amount, currency, evidence_confidence")
      .eq("organization_id", input.organizationId)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("internal_outreach_opportunities")
      .select("id, contract_id, commercial_decision_id, negotiation_brief_id, opportunity_type, status, priority, expected_commercial_impact, evidence_confidence")
      .eq("organization_id", input.organizationId)
      .not("status", "in", "(dismissed,archived)")
      .order("created_at", { ascending: false })
      .limit(limit)
  ]);

  for (const result of [
    contracts,
    quoteComparisons,
    quoteFindings,
    savingsOpportunities,
    commercialDecisions,
    negotiationBriefs,
    outreachOpportunities
  ]) {
    if (result.error) throw result.error;
  }

  return {
    organizationId: input.organizationId,
    contracts: ((contracts.data ?? []) as unknown as Array<
      RevenueSourceContract & { contract_metadata?: unknown; reminders?: unknown }
    >).map((contract) => ({
      ...contract,
      metadata: first(contract.contract_metadata as RevenueSourceContract["metadata"] | RevenueSourceContract["metadata"][]),
      reminders: Array.isArray(contract.reminders) ? contract.reminders as RevenueSourceContract["reminders"] : []
    })),
    quoteComparisons: (quoteComparisons.data ?? []) as RevenueSourceQuoteComparison[],
    quoteFindings: (quoteFindings.data ?? []) as RevenueSourceQuoteFinding[],
    savingsOpportunities: (savingsOpportunities.data ?? []) as RevenueSourceSavingsOpportunity[],
    commercialDecisions: (commercialDecisions.data ?? []) as RevenueSourceCommercialDecision[],
    negotiationBriefs: (negotiationBriefs.data ?? []) as RevenueSourceNegotiationBrief[],
    outreachOpportunities: (outreachOpportunities.data ?? []) as RevenueSourceOutreachOpportunity[]
  };
}

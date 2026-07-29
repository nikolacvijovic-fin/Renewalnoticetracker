import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  InternalOutreachApprovalStep,
  InternalOutreachDraft,
  InternalOutreachEvidenceLink,
  InternalOutreachOpportunity,
  InternalOutreachPlaybookItem,
  InternalOutreachSuppression,
  OutreachAudience,
  OutreachOpportunityType
} from "@/lib/internal-outreach-intelligence/outreach-types";

type UntypedSupabaseClient = ReturnType<typeof createAdminSupabaseClient>;

function admin() {
  return createAdminSupabaseClient() as UntypedSupabaseClient;
}

export async function insertAdminInternalOutreachOpportunity(input: {
  organizationId: string;
  contractId?: string | null;
  commercialDecisionId?: string | null;
  negotiationBriefId?: string | null;
  createdByUserId?: string | null;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("internal_outreach_opportunities")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId ?? null,
      commercial_decision_id: input.commercialDecisionId ?? null,
      negotiation_brief_id: input.negotiationBriefId ?? null,
      created_by_user_id: input.createdByUserId ?? null,
      ...input.values
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: InternalOutreachOpportunity | null; error: Error | null }>;
}

export async function getAdminInternalOutreachOpportunityById(input: {
  organizationId: string;
  opportunityId: string;
}) {
  return admin()
    .from("internal_outreach_opportunities")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("id", input.opportunityId)
    .maybeSingle() as unknown as Promise<{ data: InternalOutreachOpportunity | null; error: Error | null }>;
}

export async function getAdminActiveInternalOutreachOpportunityBySource(input: {
  organizationId: string;
  opportunityType: OutreachOpportunityType;
  audience: OutreachAudience;
  contractId?: string | null;
  commercialDecisionId?: string | null;
  negotiationBriefId?: string | null;
}) {
  let query = admin()
    .from("internal_outreach_opportunities")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("opportunity_type", input.opportunityType)
    .eq("audience", input.audience)
    .not("status", "in", "(dismissed,archived)")
    .order("created_at", { ascending: false })
    .limit(1);
  query = input.contractId ? query.eq("contract_id", input.contractId) : query.is("contract_id", null);
  query = input.commercialDecisionId ? query.eq("commercial_decision_id", input.commercialDecisionId) : query.is("commercial_decision_id", null);
  query = input.negotiationBriefId ? query.eq("negotiation_brief_id", input.negotiationBriefId) : query.is("negotiation_brief_id", null);
  return query.maybeSingle() as unknown as Promise<{ data: InternalOutreachOpportunity | null; error: Error | null }>;
}

export async function listAdminInternalOutreachOpportunities(input: {
  organizationId: string;
  contractId?: string;
  status?: string;
  limit?: number;
}) {
  let query = admin()
    .from("internal_outreach_opportunities")
    .select("*")
    .eq("organization_id", input.organizationId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 25);
  if (input.contractId) query = query.eq("contract_id", input.contractId);
  if (input.status) query = query.eq("status", input.status);
  return query as unknown as Promise<{ data: InternalOutreachOpportunity[] | null; error: Error | null }>;
}

export async function updateAdminInternalOutreachOpportunity(input: {
  organizationId: string;
  opportunityId: string;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("internal_outreach_opportunities")
    .update({ ...input.values, updated_at: new Date().toISOString() } as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.opportunityId)
    .select("*")
    .single() as unknown as Promise<{ data: InternalOutreachOpportunity | null; error: Error | null }>;
}

export async function updateAdminInternalOutreachOpportunityStatus(input: {
  organizationId: string;
  opportunityId: string;
  expectedStatus?: string;
  values: Record<string, unknown>;
}) {
  let query = admin()
    .from("internal_outreach_opportunities")
    .update({ ...input.values, updated_at: new Date().toISOString() } as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.opportunityId);
  if (input.expectedStatus) query = query.eq("status", input.expectedStatus);
  return query
    .select("*")
    .maybeSingle() as unknown as Promise<{ data: InternalOutreachOpportunity | null; error: Error | null }>;
}

export async function upsertAdminInternalOutreachEvidenceLink(input: {
  organizationId: string;
  opportunityId: string;
  contractId?: string | null;
  commercialDecisionId?: string | null;
  negotiationBriefId?: string | null;
  createdByUserId?: string | null;
  values: {
    evidence_type: string;
    evidence_id?: string | null;
    evidence_label: string;
    confidence?: number | null;
    metadata?: Record<string, unknown>;
  };
}) {
  let existing = admin()
    .from("internal_outreach_evidence_links")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("opportunity_id", input.opportunityId)
    .eq("evidence_type", input.values.evidence_type)
    .eq("evidence_label", input.values.evidence_label);
  existing = input.values.evidence_id ? existing.eq("evidence_id", input.values.evidence_id) : existing.is("evidence_id", null);
  const current = (await existing.maybeSingle()) as unknown as { data: InternalOutreachEvidenceLink | null; error: Error | null };
  if (current.error) return current;
  if (current.data) {
    return admin()
      .from("internal_outreach_evidence_links")
      .update({
        confidence: input.values.confidence ?? null,
        metadata: input.values.metadata ?? {},
        updated_at: new Date().toISOString()
      } as never)
      .eq("organization_id", input.organizationId)
      .eq("id", current.data.id)
      .select("*")
      .single() as unknown as Promise<{ data: InternalOutreachEvidenceLink | null; error: Error | null }>;
  }
  return admin()
    .from("internal_outreach_evidence_links")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId ?? null,
      commercial_decision_id: input.commercialDecisionId ?? null,
      negotiation_brief_id: input.negotiationBriefId ?? null,
      opportunity_id: input.opportunityId,
      created_by_user_id: input.createdByUserId ?? null,
      ...input.values
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: InternalOutreachEvidenceLink | null; error: Error | null }>;
}

export async function listAdminInternalOutreachEvidenceLinks(input: {
  organizationId: string;
  opportunityId: string;
}) {
  return admin()
    .from("internal_outreach_evidence_links")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("opportunity_id", input.opportunityId)
    .order("created_at", { ascending: false }) as unknown as Promise<{ data: InternalOutreachEvidenceLink[] | null; error: Error | null }>;
}

export async function insertAdminInternalOutreachDraft(input: {
  organizationId: string;
  opportunityId: string;
  contractId?: string | null;
  createdByUserId?: string | null;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("internal_outreach_drafts")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId ?? null,
      opportunity_id: input.opportunityId,
      created_by_user_id: input.createdByUserId ?? null,
      ...input.values
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: InternalOutreachDraft | null; error: Error | null }>;
}

export async function getAdminInternalOutreachDraftById(input: {
  organizationId: string;
  draftId: string;
}) {
  return admin()
    .from("internal_outreach_drafts")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("id", input.draftId)
    .maybeSingle() as unknown as Promise<{ data: InternalOutreachDraft | null; error: Error | null }>;
}

export async function listAdminInternalOutreachDrafts(input: {
  organizationId: string;
  opportunityId: string;
  limit?: number;
}) {
  return admin()
    .from("internal_outreach_drafts")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("opportunity_id", input.opportunityId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 10) as unknown as Promise<{ data: InternalOutreachDraft[] | null; error: Error | null }>;
}

export async function updateAdminInternalOutreachDraft(input: {
  organizationId: string;
  draftId: string;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("internal_outreach_drafts")
    .update({ ...input.values, updated_at: new Date().toISOString() } as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.draftId)
    .select("*")
    .single() as unknown as Promise<{ data: InternalOutreachDraft | null; error: Error | null }>;
}

export async function updateAdminInternalOutreachDraftStatus(input: {
  organizationId: string;
  draftId: string;
  expectedStatus?: string;
  values: Record<string, unknown>;
}) {
  let query = admin()
    .from("internal_outreach_drafts")
    .update({ ...input.values, updated_at: new Date().toISOString() } as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.draftId);
  if (input.expectedStatus) query = query.eq("status", input.expectedStatus);
  return query
    .select("*")
    .maybeSingle() as unknown as Promise<{ data: InternalOutreachDraft | null; error: Error | null }>;
}

export async function insertAdminInternalOutreachApprovalStep(input: {
  organizationId: string;
  opportunityId: string;
  draftId: string;
  contractId?: string | null;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("internal_outreach_approval_steps")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId ?? null,
      opportunity_id: input.opportunityId,
      outreach_draft_id: input.draftId,
      ...input.values
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: InternalOutreachApprovalStep | null; error: Error | null }>;
}

export async function updateAdminInternalOutreachApprovalStep(input: {
  organizationId: string;
  approvalStepId: string;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("internal_outreach_approval_steps")
    .update({ ...input.values, updated_at: new Date().toISOString() } as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.approvalStepId)
    .select("*")
    .single() as unknown as Promise<{ data: InternalOutreachApprovalStep | null; error: Error | null }>;
}

export async function listAdminInternalOutreachApprovalSteps(input: {
  organizationId: string;
  draftId: string;
}) {
  return admin()
    .from("internal_outreach_approval_steps")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("outreach_draft_id", input.draftId)
    .order("step_order", { ascending: true }) as unknown as Promise<{ data: InternalOutreachApprovalStep[] | null; error: Error | null }>;
}

export async function insertAdminInternalOutreachPlaybookItem(input: {
  organizationId: string;
  opportunityId: string;
  contractId?: string | null;
  createdByUserId?: string | null;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("internal_outreach_playbook_items")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId ?? null,
      opportunity_id: input.opportunityId,
      created_by_user_id: input.createdByUserId ?? null,
      ...input.values
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: InternalOutreachPlaybookItem | null; error: Error | null }>;
}

export async function listAdminInternalOutreachPlaybookItems(input: {
  organizationId: string;
  opportunityId: string;
  limit?: number;
}) {
  return admin()
    .from("internal_outreach_playbook_items")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("opportunity_id", input.opportunityId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 10) as unknown as Promise<{ data: InternalOutreachPlaybookItem[] | null; error: Error | null }>;
}

export async function insertAdminInternalOutreachSuppression(input: {
  organizationId: string;
  contractId?: string | null;
  opportunityId?: string | null;
  suppressedByUserId?: string | null;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("internal_outreach_suppressions")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId ?? null,
      opportunity_id: input.opportunityId ?? null,
      suppressed_by_user_id: input.suppressedByUserId ?? null,
      ...input.values
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: InternalOutreachSuppression | null; error: Error | null }>;
}

export async function listAdminInternalOutreachSuppressions(input: {
  organizationId: string;
  audience?: OutreachAudience;
  opportunityId?: string;
  contractId?: string;
  includeExpired?: boolean;
  limit?: number;
}) {
  let query = admin()
    .from("internal_outreach_suppressions")
    .select("*")
    .eq("organization_id", input.organizationId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 25);
  if (input.audience) query = query.eq("audience", input.audience);
  if (input.opportunityId) query = query.eq("opportunity_id", input.opportunityId);
  if (input.contractId) query = query.eq("contract_id", input.contractId);
  if (!input.includeExpired) query = query.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  return query as unknown as Promise<{ data: InternalOutreachSuppression[] | null; error: Error | null }>;
}

export async function hasAdminActiveInternalOutreachSuppression(input: {
  organizationId: string;
  audience: OutreachAudience;
  opportunityId?: string | null;
  contractId?: string | null;
  contactIdentifierHash?: string | null;
  scopedInternalUserId?: string | null;
}) {
  let query = admin()
    .from("internal_outreach_suppressions")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("audience", input.audience)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .limit(1);
  if (input.opportunityId) query = query.eq("opportunity_id", input.opportunityId);
  if (input.contractId) query = query.eq("contract_id", input.contractId);
  if (input.contactIdentifierHash) query = query.eq("contact_identifier_hash", input.contactIdentifierHash);
  if (input.scopedInternalUserId) query = query.eq("scoped_internal_user_id", input.scopedInternalUserId);
  const result = (await query.maybeSingle()) as unknown as { data: { id: string } | null; error: Error | null };
  return { data: Boolean(result.data), error: result.error };
}

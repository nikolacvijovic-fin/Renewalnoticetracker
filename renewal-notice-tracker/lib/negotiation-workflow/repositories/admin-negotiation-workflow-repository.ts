import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  NegotiationBrief,
  NegotiationBriefEvidenceLink,
  NegotiationPlaybookItem,
  VendorCommunicationApprovalStep,
  VendorCommunicationDraft
} from "@/lib/negotiation-workflow/negotiation-types";

type UntypedSupabaseClient = ReturnType<typeof createAdminSupabaseClient>;

function admin() {
  return createAdminSupabaseClient() as UntypedSupabaseClient;
}

export async function insertAdminNegotiationBrief(input: {
  organizationId: string;
  contractId: string;
  commercialDecisionId: string;
  createdByUserId?: string | null;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("renewal_negotiation_briefs")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId,
      commercial_decision_id: input.commercialDecisionId,
      created_by_user_id: input.createdByUserId ?? null,
      ...input.values
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: NegotiationBrief | null; error: Error | null }>;
}

export async function getAdminNegotiationBriefById(input: {
  organizationId: string;
  briefId: string;
}) {
  return admin()
    .from("renewal_negotiation_briefs")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("id", input.briefId)
    .maybeSingle() as unknown as Promise<{ data: NegotiationBrief | null; error: Error | null }>;
}

export async function getAdminActiveNegotiationBriefByDecisionId(input: {
  organizationId: string;
  commercialDecisionId: string;
}) {
  return admin()
    .from("renewal_negotiation_briefs")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("commercial_decision_id", input.commercialDecisionId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as unknown as Promise<{ data: NegotiationBrief | null; error: Error | null }>;
}

export async function listAdminNegotiationBriefs(input: {
  organizationId: string;
  commercialDecisionId?: string;
  contractId?: string;
  limit?: number;
}) {
  let query = admin()
    .from("renewal_negotiation_briefs")
    .select("*")
    .eq("organization_id", input.organizationId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 25);
  if (input.commercialDecisionId) query = query.eq("commercial_decision_id", input.commercialDecisionId);
  if (input.contractId) query = query.eq("contract_id", input.contractId);
  return query as unknown as Promise<{ data: NegotiationBrief[] | null; error: Error | null }>;
}

export async function updateAdminNegotiationBrief(input: {
  organizationId: string;
  briefId: string;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("renewal_negotiation_briefs")
    .update({ ...input.values, updated_at: new Date().toISOString() } as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.briefId)
    .select("*")
    .single() as unknown as Promise<{ data: NegotiationBrief | null; error: Error | null }>;
}

export async function updateAdminNegotiationBriefStatus(input: {
  organizationId: string;
  briefId: string;
  expectedStatus?: string;
  values: Record<string, unknown>;
}) {
  let query = admin()
    .from("renewal_negotiation_briefs")
    .update({ ...input.values, updated_at: new Date().toISOString() } as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.briefId);
  if (input.expectedStatus) query = query.eq("status", input.expectedStatus);
  return query
    .select("*")
    .maybeSingle() as unknown as Promise<{ data: NegotiationBrief | null; error: Error | null }>;
}

export async function upsertAdminNegotiationBriefEvidenceLink(input: {
  organizationId: string;
  contractId: string;
  commercialDecisionId: string;
  negotiationBriefId: string;
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
    .from("renewal_negotiation_brief_evidence_links")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("negotiation_brief_id", input.negotiationBriefId)
    .eq("evidence_type", input.values.evidence_type)
    .eq("evidence_label", input.values.evidence_label);
  existing = input.values.evidence_id ? existing.eq("evidence_id", input.values.evidence_id) : existing.is("evidence_id", null);
  const current = (await existing.maybeSingle()) as unknown as {
    data: NegotiationBriefEvidenceLink | null;
    error: Error | null;
  };
  if (current.error) return current;
  if (current.data) {
    return admin()
      .from("renewal_negotiation_brief_evidence_links")
      .update({
        confidence: input.values.confidence ?? null,
        metadata: input.values.metadata ?? {},
        updated_at: new Date().toISOString()
      } as never)
      .eq("organization_id", input.organizationId)
      .eq("id", current.data.id)
      .select("*")
      .single() as unknown as Promise<{ data: NegotiationBriefEvidenceLink | null; error: Error | null }>;
  }
  return admin()
    .from("renewal_negotiation_brief_evidence_links")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId,
      commercial_decision_id: input.commercialDecisionId,
      negotiation_brief_id: input.negotiationBriefId,
      created_by_user_id: input.createdByUserId ?? null,
      ...input.values
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: NegotiationBriefEvidenceLink | null; error: Error | null }>;
}

export async function listAdminNegotiationBriefEvidenceLinks(input: {
  organizationId: string;
  negotiationBriefId: string;
}) {
  return admin()
    .from("renewal_negotiation_brief_evidence_links")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("negotiation_brief_id", input.negotiationBriefId)
    .order("created_at", { ascending: false }) as unknown as Promise<{
      data: NegotiationBriefEvidenceLink[] | null;
      error: Error | null;
    }>;
}

export async function insertAdminVendorCommunicationDraft(input: {
  organizationId: string;
  contractId: string;
  commercialDecisionId: string;
  negotiationBriefId: string;
  createdByUserId?: string | null;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("vendor_communication_drafts")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId,
      commercial_decision_id: input.commercialDecisionId,
      negotiation_brief_id: input.negotiationBriefId,
      created_by_user_id: input.createdByUserId ?? null,
      ...input.values
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: VendorCommunicationDraft | null; error: Error | null }>;
}

export async function getAdminVendorCommunicationDraftById(input: {
  organizationId: string;
  draftId: string;
}) {
  return admin()
    .from("vendor_communication_drafts")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("id", input.draftId)
    .maybeSingle() as unknown as Promise<{ data: VendorCommunicationDraft | null; error: Error | null }>;
}

export async function listAdminVendorCommunicationDrafts(input: {
  organizationId: string;
  negotiationBriefId?: string;
  commercialDecisionId?: string;
  limit?: number;
}) {
  let query = admin()
    .from("vendor_communication_drafts")
    .select("*")
    .eq("organization_id", input.organizationId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 25);
  if (input.negotiationBriefId) query = query.eq("negotiation_brief_id", input.negotiationBriefId);
  if (input.commercialDecisionId) query = query.eq("commercial_decision_id", input.commercialDecisionId);
  return query as unknown as Promise<{ data: VendorCommunicationDraft[] | null; error: Error | null }>;
}

export async function updateAdminVendorCommunicationDraft(input: {
  organizationId: string;
  draftId: string;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("vendor_communication_drafts")
    .update({ ...input.values, updated_at: new Date().toISOString() } as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.draftId)
    .select("*")
    .single() as unknown as Promise<{ data: VendorCommunicationDraft | null; error: Error | null }>;
}

export async function updateAdminVendorCommunicationDraftStatus(input: {
  organizationId: string;
  draftId: string;
  expectedStatus?: string;
  values: Record<string, unknown>;
}) {
  let query = admin()
    .from("vendor_communication_drafts")
    .update({ ...input.values, updated_at: new Date().toISOString() } as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.draftId);
  if (input.expectedStatus) query = query.eq("status", input.expectedStatus);
  return query
    .select("*")
    .maybeSingle() as unknown as Promise<{ data: VendorCommunicationDraft | null; error: Error | null }>;
}

export async function insertAdminVendorCommunicationApprovalStep(input: {
  organizationId: string;
  contractId: string;
  commercialDecisionId: string;
  negotiationBriefId: string;
  vendorCommunicationDraftId: string;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("vendor_communication_approval_steps")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId,
      commercial_decision_id: input.commercialDecisionId,
      negotiation_brief_id: input.negotiationBriefId,
      vendor_communication_draft_id: input.vendorCommunicationDraftId,
      ...input.values
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: VendorCommunicationApprovalStep | null; error: Error | null }>;
}

export async function updateAdminVendorCommunicationApprovalStep(input: {
  organizationId: string;
  approvalStepId: string;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("vendor_communication_approval_steps")
    .update({ ...input.values, updated_at: new Date().toISOString() } as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.approvalStepId)
    .select("*")
    .single() as unknown as Promise<{ data: VendorCommunicationApprovalStep | null; error: Error | null }>;
}

export async function listAdminVendorCommunicationApprovalSteps(input: {
  organizationId: string;
  vendorCommunicationDraftId: string;
}) {
  return admin()
    .from("vendor_communication_approval_steps")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("vendor_communication_draft_id", input.vendorCommunicationDraftId)
    .order("step_order", { ascending: true }) as unknown as Promise<{
      data: VendorCommunicationApprovalStep[] | null;
      error: Error | null;
    }>;
}

export async function insertAdminNegotiationPlaybookItem(input: {
  organizationId: string;
  contractId: string;
  commercialDecisionId: string;
  negotiationBriefId?: string | null;
  createdByUserId?: string | null;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("negotiation_playbook_items")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId,
      commercial_decision_id: input.commercialDecisionId,
      negotiation_brief_id: input.negotiationBriefId ?? null,
      created_by_user_id: input.createdByUserId ?? null,
      ...input.values
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: NegotiationPlaybookItem | null; error: Error | null }>;
}

export async function listAdminNegotiationPlaybookItems(input: {
  organizationId: string;
  commercialDecisionId: string;
  limit?: number;
}) {
  return admin()
    .from("negotiation_playbook_items")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("commercial_decision_id", input.commercialDecisionId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 25) as unknown as Promise<{ data: NegotiationPlaybookItem[] | null; error: Error | null }>;
}

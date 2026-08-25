import { recordEnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-recorder";
import { getContractById } from "@/lib/contracts/kernel-queries";
import { listContractExtractedFields } from "@/lib/contract-intelligence/extraction-runs";
import {
  getAdminCommercialDecisionById
} from "@/lib/commercial-decision-workbench/repositories/admin-commercial-decision-repository";
import { sanitizeQuoteEvidence } from "@/lib/quote-comparison/quote-normalization";
import {
  listQuoteComparisons,
  listQuoteFindings,
  listSavingsOpportunities
} from "@/lib/quote-comparison/quote-comparison";
import { buildNegotiationBrief } from "@/lib/negotiation-workflow/negotiation-brief-builder";
import { buildVendorCommunicationDraft } from "@/lib/negotiation-workflow/vendor-communication-draft";
import type {
  NegotiationBrief,
  NegotiationBriefBuildResult,
  VendorCommunicationChannel,
  VendorCommunicationDraft,
  VendorCommunicationDraftType,
  VendorCommunicationTone
} from "@/lib/negotiation-workflow/negotiation-types";
import {
  getAdminActiveNegotiationBriefByDecisionId,
  getAdminNegotiationBriefById,
  getAdminVendorCommunicationDraftById,
  insertAdminNegotiationBrief,
  insertAdminNegotiationPlaybookItem,
  insertAdminVendorCommunicationApprovalStep,
  insertAdminVendorCommunicationDraft,
  listAdminNegotiationBriefEvidenceLinks,
  listAdminNegotiationPlaybookItems,
  listAdminVendorCommunicationApprovalSteps,
  listAdminVendorCommunicationDrafts,
  updateAdminNegotiationBrief,
  updateAdminNegotiationBriefStatus,
  updateAdminVendorCommunicationApprovalStep,
  updateAdminVendorCommunicationDraft,
  updateAdminVendorCommunicationDraftStatus,
  upsertAdminNegotiationBriefEvidenceLink
} from "@/lib/negotiation-workflow/repositories/admin-negotiation-workflow-repository";

export class NegotiationWorkflowTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NegotiationWorkflowTransitionError";
  }
}

export class NegotiationWorkflowConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NegotiationWorkflowConflictError";
  }
}

const NEGOTIATION_ACTIONS = ["renegotiate", "escalate", "cancel", "needs_review"];

function safeMetadata(input: Record<string, unknown>) {
  return sanitizeQuoteEvidence(input) as Record<string, unknown>;
}

function valuesFromBriefBuild(build: NegotiationBriefBuildResult, existing?: Pick<NegotiationBrief, "approver_user_id"> | null) {
  return {
    status: build.status,
    strategy: build.strategy,
    executive_summary: build.executiveSummary,
    target_ask: build.targetAsk,
    fallback_position: build.fallbackPosition,
    evidence_summary: safeMetadata(build.evidenceSummary),
    commercial_risk_summary: build.commercialRiskSummary,
    savings_argument: build.savingsArgument,
    deadline_risk: build.deadlineRisk,
    blocker_codes: build.blockerCodes,
    warning_codes: build.warningCodes,
    review_flags: build.reviewFlags,
    confidence_score: build.confidenceScore,
    questions_requiring_confirmation: build.questionsRequiringConfirmation,
    evidence_limitations: build.evidenceLimitations,
    approver_user_id: existing?.approver_user_id ?? null
  };
}

async function auditNegotiation(input: {
  organizationId: string;
  contractId: string;
  actorUserId?: string | null;
  eventType: string;
  brief?: Pick<NegotiationBrief, "id" | "commercial_decision_id" | "status" | "strategy" | "confidence_score" | "blocker_codes" | "warning_codes"> | null;
  draft?: Pick<VendorCommunicationDraft, "id" | "status" | "commercial_decision_id" | "negotiation_brief_id" | "channel" | "tone"> | null;
  previousStatus?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await recordEnterpriseAuditEvent({
    organizationId: input.organizationId,
    contractId: input.contractId,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    eventCategory: "evidence",
    eventSource: "negotiation_workflow",
    severity: input.eventType.endsWith("rejected") ? "warning" : "info",
    metadata: safeMetadata({
      briefId: input.brief?.id ?? input.draft?.negotiation_brief_id ?? null,
      draftId: input.draft?.id ?? null,
      commercialDecisionId: input.brief?.commercial_decision_id ?? input.draft?.commercial_decision_id ?? null,
      contractId: input.contractId,
      strategy: input.brief?.strategy ?? null,
      previousStatus: input.previousStatus ?? null,
      newStatus: input.brief?.status ?? input.draft?.status ?? null,
      confidenceScore: input.brief?.confidence_score ?? null,
      blockerCodes: input.brief?.blocker_codes ?? [],
      warningCodes: input.brief?.warning_codes ?? [],
      channel: input.draft?.channel ?? null,
      tone: input.draft?.tone ?? null,
      ...(input.metadata ?? {})
    }),
    mode: "best_effort"
  });
}

async function getRequiredDecision(organizationId: string, decisionId: string) {
  const result = await getAdminCommercialDecisionById({ organizationId, decisionId });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Commercial decision was not found for the active organization.");
  if (!NEGOTIATION_ACTIONS.includes(result.data.recommended_action)) {
    throw new NegotiationWorkflowTransitionError("Negotiation workflow is available only for renegotiate, escalate, cancel, or needs-review decisions.");
  }
  return result.data;
}

async function buildContext(input: { organizationId: string; decisionId: string }) {
  const decision = await getRequiredDecision(input.organizationId, input.decisionId);
  const [contract, fields, comparisons, findings, savings] = await Promise.all([
    getContractById(decision.contract_id, input.organizationId),
    listContractExtractedFields({
      organizationId: input.organizationId,
      contractId: decision.contract_id,
      evidenceStatus: "accepted"
    }),
    listQuoteComparisons({ organizationId: input.organizationId, contractId: decision.contract_id, limit: 1 }),
    listQuoteFindings({ organizationId: input.organizationId, contractId: decision.contract_id, limit: 25 }),
    listSavingsOpportunities({ organizationId: input.organizationId, contractId: decision.contract_id, limit: 25 })
  ]);
  return {
    decision,
    contract,
    fields,
    quoteComparison: comparisons[0] ?? null,
    quoteFindings: findings,
    savingsOpportunities: savings,
    build: buildNegotiationBrief({
      decision,
      quoteComparison: comparisons[0] ?? null,
      quoteFindings: findings,
      savingsOpportunities: savings,
      acceptedExtractedFields: fields
    })
  };
}

async function refreshBriefEvidence(input: {
  organizationId: string;
  brief: NegotiationBrief;
  context: Awaited<ReturnType<typeof buildContext>>;
  actorUserId?: string | null;
}) {
  const links = [
    input.context.quoteComparison
      ? {
          evidence_type: "renewal_quote_comparison",
          evidence_id: input.context.quoteComparison.id,
          evidence_label: "Quote comparison used for negotiation brief",
          confidence: null,
          metadata: { riskLevel: input.context.quoteComparison.overall_risk_level }
        }
      : null,
    ...input.context.quoteFindings
      .filter((finding) => ["high", "critical"].includes(finding.severity))
      .map((finding) => ({
        evidence_type: "renewal_quote_finding",
        evidence_id: finding.id,
        evidence_label: `${finding.severity} quote finding: ${finding.finding_type}`,
        confidence: finding.confidence,
        metadata: { findingType: finding.finding_type, severity: finding.severity }
      })),
    ...input.context.savingsOpportunities
      .filter((opportunity) => ["open", "in_review", "accepted"].includes(opportunity.status))
      .map((opportunity) => ({
        evidence_type: "savings_opportunity",
        evidence_id: opportunity.id,
        evidence_label: `Savings opportunity: ${opportunity.opportunity_type}`,
        confidence: opportunity.confidence,
        metadata: {
          estimatedSavingsAmount: opportunity.estimated_savings_amount,
          currency: opportunity.currency,
          status: opportunity.status
        }
      })),
    ...input.context.fields.map((field) => ({
      evidence_type: "contract_extraction_field",
      evidence_id: field.id,
      evidence_label: `Accepted extraction field: ${field.field_key}`,
      confidence: field.confidence,
      metadata: { fieldKey: field.field_key, evidenceStatus: field.evidence_status }
    }))
  ].filter((link): link is NonNullable<typeof link> => Boolean(link));

  await Promise.all(
    links.map((link) =>
      upsertAdminNegotiationBriefEvidenceLink({
        organizationId: input.organizationId,
        contractId: input.brief.contract_id,
        commercialDecisionId: input.brief.commercial_decision_id,
        negotiationBriefId: input.brief.id,
        createdByUserId: input.actorUserId ?? null,
        values: {
          evidence_type: link.evidence_type,
          evidence_id: link.evidence_id,
          evidence_label: link.evidence_label.slice(0, 180),
          confidence: link.confidence ?? null,
          metadata: safeMetadata(link.metadata)
        }
      })
    )
  );

  await auditNegotiation({
    organizationId: input.organizationId,
    contractId: input.brief.contract_id,
    actorUserId: input.actorUserId ?? null,
    eventType: "negotiation_brief.evidence_attached",
    brief: input.brief,
    metadata: { evidenceCount: links.length }
  });
}

export async function createNegotiationBriefForDecision(input: {
  organizationId: string;
  commercialDecisionId: string;
  actorUserId?: string | null;
}) {
  const existing = await getAdminActiveNegotiationBriefByDecisionId({
    organizationId: input.organizationId,
    commercialDecisionId: input.commercialDecisionId
  });
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const context = await buildContext({ organizationId: input.organizationId, decisionId: input.commercialDecisionId });
  const result = await insertAdminNegotiationBrief({
    organizationId: input.organizationId,
    contractId: context.decision.contract_id,
    commercialDecisionId: context.decision.id,
    createdByUserId: input.actorUserId ?? null,
    values: {
      ...valuesFromBriefBuild(context.build),
      owner_user_id: context.decision.owner_user_id
    }
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Negotiation brief was not created.");
  await refreshBriefEvidence({ organizationId: input.organizationId, brief: result.data, context, actorUserId: input.actorUserId ?? null });
  await auditNegotiation({
    organizationId: input.organizationId,
    contractId: result.data.contract_id,
    actorUserId: input.actorUserId ?? null,
    eventType: "negotiation_brief.created",
    brief: result.data
  });
  return result.data;
}

export async function recomputeNegotiationBrief(input: {
  organizationId: string;
  negotiationBriefId: string;
  actorUserId?: string | null;
}) {
  const brief = await getRequiredBrief(input.organizationId, input.negotiationBriefId);
  assertBriefEditable(brief);
  const context = await buildContext({ organizationId: input.organizationId, decisionId: brief.commercial_decision_id });
  const updated = await updateAdminNegotiationBrief({
    organizationId: input.organizationId,
    briefId: brief.id,
    values: {
      ...valuesFromBriefBuild(context.build, brief),
      owner_user_id: context.decision.owner_user_id
    }
  });
  if (updated.error) throw updated.error;
  if (!updated.data) throw new Error("Negotiation brief was not recomputed.");
  await refreshBriefEvidence({ organizationId: input.organizationId, brief: updated.data, context, actorUserId: input.actorUserId ?? null });
  await auditNegotiation({
    organizationId: input.organizationId,
    contractId: updated.data.contract_id,
    actorUserId: input.actorUserId ?? null,
    eventType: "negotiation_brief.recomputed",
    previousStatus: brief.status,
    brief: updated.data
  });
  return updated.data;
}

export async function submitNegotiationBriefForReview(input: {
  organizationId: string;
  negotiationBriefId: string;
  actorUserId?: string | null;
  approverUserId?: string | null;
}) {
  const brief = await getRequiredBrief(input.organizationId, input.negotiationBriefId);
  if (!["ready_for_review", "evidence_pending", "draft"].includes(brief.status)) {
    throw new NegotiationWorkflowTransitionError("Negotiation brief cannot be submitted from its current state.");
  }
  const approverUserId = input.approverUserId ?? brief.approver_user_id;
  if (!approverUserId) throw new NegotiationWorkflowTransitionError("Negotiation brief requires an approver before review.");
  return transitionBrief({
    organizationId: input.organizationId,
    brief,
    actorUserId: input.actorUserId ?? null,
    eventType: "negotiation_brief.submitted_for_review",
    values: { status: "in_approval", approver_user_id: approverUserId, submitted_at: new Date().toISOString() },
    metadata: { approvalActor: approverUserId }
  });
}

export async function approveNegotiationBrief(input: {
  organizationId: string;
  negotiationBriefId: string;
  actorUserId: string;
}) {
  const brief = await getRequiredBrief(input.organizationId, input.negotiationBriefId);
  if (brief.status !== "in_approval") throw new NegotiationWorkflowTransitionError("Negotiation brief must be in approval.");
  if (brief.approver_user_id !== input.actorUserId) throw new NegotiationWorkflowTransitionError("Only the assigned approver can approve this negotiation brief.");
  return transitionBrief({
    organizationId: input.organizationId,
    brief,
    actorUserId: input.actorUserId,
    eventType: "negotiation_brief.approved",
    values: { status: "approved", approved_at: new Date().toISOString() },
    metadata: { approvalActor: input.actorUserId }
  });
}

export async function rejectNegotiationBrief(input: {
  organizationId: string;
  negotiationBriefId: string;
  actorUserId: string;
}) {
  const brief = await getRequiredBrief(input.organizationId, input.negotiationBriefId);
  if (brief.status !== "in_approval") throw new NegotiationWorkflowTransitionError("Negotiation brief must be in approval.");
  if (brief.approver_user_id !== input.actorUserId) throw new NegotiationWorkflowTransitionError("Only the assigned approver can reject this negotiation brief.");
  return transitionBrief({
    organizationId: input.organizationId,
    brief,
    actorUserId: input.actorUserId,
    eventType: "negotiation_brief.rejected",
    values: { status: "rejected", rejected_at: new Date().toISOString() },
    metadata: { approvalActor: input.actorUserId }
  });
}

export async function archiveNegotiationBrief(input: {
  organizationId: string;
  negotiationBriefId: string;
  actorUserId: string;
}) {
  const brief = await getRequiredBrief(input.organizationId, input.negotiationBriefId);
  return transitionBrief({
    organizationId: input.organizationId,
    brief,
    actorUserId: input.actorUserId,
    eventType: "negotiation_brief.archived",
    values: { status: "archived", archived_at: new Date().toISOString() }
  });
}

export async function createVendorCommunicationDraft(input: {
  organizationId: string;
  negotiationBriefId: string;
  actorUserId?: string | null;
  draftType?: VendorCommunicationDraftType;
  channel?: VendorCommunicationChannel;
  tone?: VendorCommunicationTone;
}) {
  const brief = await getRequiredBrief(input.organizationId, input.negotiationBriefId);
  if (["rejected", "archived"].includes(brief.status)) {
    throw new NegotiationWorkflowTransitionError("Rejected or archived negotiation briefs cannot generate vendor drafts.");
  }
  if (!["ready_for_review", "in_approval", "approved"].includes(brief.status)) {
    throw new NegotiationWorkflowTransitionError("Vendor draft generation requires a review-ready negotiation brief.");
  }
  const generated = buildVendorCommunicationDraft({
    brief,
    draftType: input.draftType,
    channel: input.channel,
    tone: input.tone
  });
  const result = await insertAdminVendorCommunicationDraft({
    organizationId: input.organizationId,
    contractId: brief.contract_id,
    commercialDecisionId: brief.commercial_decision_id,
    negotiationBriefId: brief.id,
    createdByUserId: input.actorUserId ?? null,
    values: {
      status: "draft",
      draft_type: generated.draftType,
      version_number: 1,
      human_review_required: true,
      unsent: true,
      channel: generated.channel,
      tone: generated.tone,
      subject: generated.subject,
      draft_body: generated.draftBody,
      internal_reviewer_note: generated.internalReviewerNote,
      evidence_trace: safeMetadata(generated.evidenceTrace),
      approver_user_id: brief.approver_user_id
    }
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Vendor communication draft was not created.");
  await auditNegotiation({
    organizationId: input.organizationId,
    contractId: brief.contract_id,
    actorUserId: input.actorUserId ?? null,
    eventType: "vendor_communication_draft.created",
    brief,
    draft: result.data
  });
  return result.data;
}

export async function regenerateVendorCommunicationDraft(input: {
  organizationId: string;
  draftId: string;
  actorUserId?: string | null;
  draftType?: VendorCommunicationDraftType;
  channel?: VendorCommunicationChannel;
  tone?: VendorCommunicationTone;
}) {
  const draft = await getRequiredDraft(input.organizationId, input.draftId);
  assertDraftEditable(draft);
  const brief = await getRequiredBrief(input.organizationId, draft.negotiation_brief_id);
  const generated = buildVendorCommunicationDraft({
    brief,
    draftType: input.draftType ?? draft.draft_type ?? "request_renewal_quote",
    channel: input.channel ?? draft.channel,
    tone: input.tone ?? draft.tone
  });
  const updated = await updateAdminVendorCommunicationDraft({
    organizationId: input.organizationId,
    draftId: draft.id,
    values: {
      draft_type: generated.draftType,
      version_number: (draft.version_number ?? 1) + 1,
      human_review_required: true,
      unsent: true,
      channel: generated.channel,
      tone: generated.tone,
      subject: generated.subject,
      draft_body: generated.draftBody,
      internal_reviewer_note: generated.internalReviewerNote,
      evidence_trace: safeMetadata(generated.evidenceTrace)
    }
  });
  if (updated.error) throw updated.error;
  if (!updated.data) throw new Error("Vendor communication draft was not regenerated.");
  await auditNegotiation({
    organizationId: input.organizationId,
    contractId: draft.contract_id,
    actorUserId: input.actorUserId ?? null,
    eventType: "vendor_communication_draft.regenerated",
    brief,
    draft: updated.data
  });
  return updated.data;
}

export async function submitVendorCommunicationDraftForApproval(input: {
  organizationId: string;
  draftId: string;
  actorUserId?: string | null;
  approverUserId?: string | null;
}) {
  const draft = await getRequiredDraft(input.organizationId, input.draftId);
  if (!["draft", "ready_for_review"].includes(draft.status)) throw new NegotiationWorkflowTransitionError("Vendor draft cannot be submitted from its current state.");
  const approverUserId = input.approverUserId ?? draft.approver_user_id;
  if (!approverUserId) throw new NegotiationWorkflowTransitionError("Vendor draft requires an approver before approval.");
  const updated = await transitionDraft({
    organizationId: input.organizationId,
    draft,
    actorUserId: input.actorUserId ?? null,
    eventType: "vendor_communication_draft.submitted_for_approval",
    values: { status: "in_approval", approver_user_id: approverUserId, submitted_at: new Date().toISOString() },
    metadata: { approvalActor: approverUserId }
  });
  await insertAdminVendorCommunicationApprovalStep({
    organizationId: input.organizationId,
    contractId: draft.contract_id,
    commercialDecisionId: draft.commercial_decision_id,
    negotiationBriefId: draft.negotiation_brief_id,
    vendorCommunicationDraftId: draft.id,
    values: { step_order: 1, status: "pending", approver_user_id: approverUserId }
  });
  return updated;
}

export async function approveVendorCommunicationDraftForCopy(input: {
  organizationId: string;
  draftId: string;
  actorUserId: string;
}) {
  const draft = await getRequiredDraft(input.organizationId, input.draftId);
  const brief = await getRequiredBrief(input.organizationId, draft.negotiation_brief_id);
  if (brief.status !== "approved") throw new NegotiationWorkflowTransitionError("Vendor draft cannot be approved before the negotiation brief is approved.");
  if (draft.status !== "in_approval") throw new NegotiationWorkflowTransitionError("Vendor draft must be in approval.");
  if (draft.approver_user_id !== input.actorUserId) throw new NegotiationWorkflowTransitionError("Only the assigned approver can approve this vendor draft for copy.");
  const updated = await transitionDraft({
    organizationId: input.organizationId,
    draft,
    actorUserId: input.actorUserId,
    eventType: "vendor_communication_draft.approved_for_copy",
    values: { status: "approved_for_copy", approved_for_copy_at: new Date().toISOString() },
    metadata: { approvalActor: input.actorUserId }
  });
  await markPendingDraftApprovalStep(input.organizationId, draft.id, input.actorUserId, "approved");
  return updated;
}

export async function rejectVendorCommunicationDraft(input: {
  organizationId: string;
  draftId: string;
  actorUserId: string;
}) {
  const draft = await getRequiredDraft(input.organizationId, input.draftId);
  if (draft.status !== "in_approval") throw new NegotiationWorkflowTransitionError("Vendor draft must be in approval.");
  if (draft.approver_user_id !== input.actorUserId) throw new NegotiationWorkflowTransitionError("Only the assigned approver can reject this vendor draft.");
  const updated = await transitionDraft({
    organizationId: input.organizationId,
    draft,
    actorUserId: input.actorUserId,
    eventType: "vendor_communication_draft.rejected",
    values: { status: "rejected", rejected_at: new Date().toISOString() },
    metadata: { approvalActor: input.actorUserId }
  });
  await markPendingDraftApprovalStep(input.organizationId, draft.id, input.actorUserId, "rejected");
  return updated;
}

export async function archiveVendorCommunicationDraft(input: {
  organizationId: string;
  draftId: string;
  actorUserId: string;
}) {
  const draft = await getRequiredDraft(input.organizationId, input.draftId);
  return transitionDraft({
    organizationId: input.organizationId,
    draft,
    actorUserId: input.actorUserId,
    eventType: "vendor_communication_draft.archived",
    values: { status: "archived", archived_at: new Date().toISOString() }
  });
}

export async function createNegotiationPlaybookItem(input: {
  organizationId: string;
  commercialDecisionId: string;
  actorUserId?: string | null;
  negotiationBriefId?: string | null;
  title: string;
  body: string;
}) {
  const decision = await getRequiredDecision(input.organizationId, input.commercialDecisionId);
  const result = await insertAdminNegotiationPlaybookItem({
    organizationId: input.organizationId,
    contractId: decision.contract_id,
    commercialDecisionId: decision.id,
    negotiationBriefId: input.negotiationBriefId ?? null,
    createdByUserId: input.actorUserId ?? null,
    values: {
      title: String(sanitizeQuoteEvidence(input.title) ?? "Negotiation playbook item").slice(0, 160),
      body: String(sanitizeQuoteEvidence(input.body) ?? "Review negotiation evidence.").slice(0, 1000),
      status: "open"
    }
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Negotiation playbook item was not created.");
  await auditNegotiation({
    organizationId: input.organizationId,
    contractId: decision.contract_id,
    actorUserId: input.actorUserId ?? null,
    eventType: "negotiation_playbook_item.created",
    metadata: {
      commercialDecisionId: decision.id,
      playbookItemId: result.data.id
    }
  });
  return result.data;
}

export async function listNegotiationWorkflowForDecision(input: {
  organizationId: string;
  commercialDecisionId: string;
}) {
  const brief = await getAdminActiveNegotiationBriefByDecisionId(input);
  if (brief.error) throw brief.error;
  const [evidence, drafts, playbookItems] = await Promise.all([
    brief.data
      ? listAdminNegotiationBriefEvidenceLinks({ organizationId: input.organizationId, negotiationBriefId: brief.data.id })
      : Promise.resolve({ data: [], error: null }),
    listAdminVendorCommunicationDrafts({
      organizationId: input.organizationId,
      commercialDecisionId: input.commercialDecisionId,
      limit: 10
    }),
    listAdminNegotiationPlaybookItems({
      organizationId: input.organizationId,
      commercialDecisionId: input.commercialDecisionId,
      limit: 10
    })
  ]);
  if (evidence.error) throw evidence.error;
  if (drafts.error) throw drafts.error;
  if (playbookItems.error) throw playbookItems.error;
  const approvalSteps = await Promise.all(
    (drafts.data ?? []).map((draft) =>
      listAdminVendorCommunicationApprovalSteps({
        organizationId: input.organizationId,
        vendorCommunicationDraftId: draft.id
      })
    )
  );
  return {
    brief: brief.data,
    evidenceLinks: evidence.data ?? [],
    drafts: drafts.data ?? [],
    approvalSteps: approvalSteps.flatMap((result) => result.data ?? []),
    playbookItems: playbookItems.data ?? []
  };
}

async function transitionBrief(input: {
  organizationId: string;
  brief: NegotiationBrief;
  actorUserId?: string | null;
  eventType: string;
  values: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  const result = await updateAdminNegotiationBriefStatus({
    organizationId: input.organizationId,
    briefId: input.brief.id,
    expectedStatus: input.brief.status,
    values: input.values
  });
  if (result.error) throw result.error;
  if (!result.data) throw new NegotiationWorkflowConflictError("Negotiation brief changed while the transition was being applied.");
  await auditNegotiation({
    organizationId: input.organizationId,
    contractId: input.brief.contract_id,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    previousStatus: input.brief.status,
    brief: result.data,
    metadata: input.metadata
  });
  return result.data;
}

async function transitionDraft(input: {
  organizationId: string;
  draft: VendorCommunicationDraft;
  actorUserId?: string | null;
  eventType: string;
  values: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  const result = await updateAdminVendorCommunicationDraftStatus({
    organizationId: input.organizationId,
    draftId: input.draft.id,
    expectedStatus: input.draft.status,
    values: input.values
  });
  if (result.error) throw result.error;
  if (!result.data) throw new NegotiationWorkflowConflictError("Vendor draft changed while the transition was being applied.");
  await auditNegotiation({
    organizationId: input.organizationId,
    contractId: input.draft.contract_id,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    previousStatus: input.draft.status,
    draft: result.data,
    metadata: input.metadata
  });
  return result.data;
}

async function markPendingDraftApprovalStep(
  organizationId: string,
  draftId: string,
  actorUserId: string,
  status: "approved" | "rejected"
) {
  const steps = await listAdminVendorCommunicationApprovalSteps({
    organizationId,
    vendorCommunicationDraftId: draftId
  });
  if (steps.error) throw steps.error;
  const pending = (steps.data ?? []).find((step) => step.status === "pending");
  if (!pending) return null;
  const result = await updateAdminVendorCommunicationApprovalStep({
    organizationId,
    approvalStepId: pending.id,
    values: {
      status,
      acted_by_user_id: actorUserId,
      acted_at: new Date().toISOString()
    }
  });
  if (result.error) throw result.error;
  return result.data;
}

async function getRequiredBrief(organizationId: string, briefId: string) {
  const result = await getAdminNegotiationBriefById({ organizationId, briefId });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Negotiation brief was not found for the active organization.");
  return result.data;
}

async function getRequiredDraft(organizationId: string, draftId: string) {
  const result = await getAdminVendorCommunicationDraftById({ organizationId, draftId });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Vendor communication draft was not found for the active organization.");
  return result.data;
}

function assertBriefEditable(brief: NegotiationBrief) {
  if (["approved", "rejected", "archived"].includes(brief.status)) {
    throw new NegotiationWorkflowTransitionError("Approved, rejected, or archived negotiation briefs cannot be edited.");
  }
}

function assertDraftEditable(draft: VendorCommunicationDraft) {
  if (["approved_for_copy", "rejected", "archived"].includes(draft.status)) {
    throw new NegotiationWorkflowTransitionError("Approved, rejected, or archived vendor drafts cannot be edited.");
  }
}

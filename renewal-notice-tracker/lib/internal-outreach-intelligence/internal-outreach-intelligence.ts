import { recordEnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-recorder";
import { getContractById } from "@/lib/contracts/kernel-queries";
import {
  getAdminActiveCommercialDecisionByContractId,
  getAdminCommercialDecisionById
} from "@/lib/commercial-decision-workbench/repositories/admin-commercial-decision-repository";
import { listQuoteComparisons, listQuoteFindings, listSavingsOpportunities } from "@/lib/quote-comparison/quote-comparison";
import { getAdminActiveNegotiationBriefByDecisionId } from "@/lib/negotiation-workflow/repositories/admin-negotiation-workflow-repository";
import { detectInternalOutreachOpportunities } from "@/lib/internal-outreach-intelligence/outreach-opportunity-detector";
import { buildInternalOutreachDraft } from "@/lib/internal-outreach-intelligence/outreach-draft-generator";
import { resolveOutreachAudience as resolveOutreachAudienceView } from "@/lib/internal-outreach-intelligence/outreach-audience-resolver";
import { planOutreachSequence as planOutreachSequenceView } from "@/lib/internal-outreach-intelligence/outreach-sequence-planner";
import { scoreOutreachOpportunity as scoreOutreachOpportunityView } from "@/lib/internal-outreach-intelligence/outreach-prioritization";
import { buildCrmNoteForOpportunity as buildCrmNoteForOpportunityView } from "@/lib/internal-outreach-intelligence/crm-note-builder";
import {
  buildSuppressionAuditMetadata,
  buildSafeOutreachAuditMetadata,
  evaluateOutreachSafety,
  hashContactIdentifier,
  normalizeOutreachSuppressionReasonCode,
  sanitizeOutreachMetadata,
  sanitizeOutreachText
} from "@/lib/internal-outreach-intelligence/outreach-safety";
import type {
  InternalOutreachDraft,
  InternalOutreachOpportunity,
  OutreachAudience,
  OutreachAudienceResolution,
  OutreachChannel,
  OutreachCrmNote,
  OutreachDraftGenerationResult,
  OutreachOpportunityDetection,
  OutreachPriorityScore,
  OutreachSequencePlan,
  OutreachTone
} from "@/lib/internal-outreach-intelligence/outreach-types";
import {
  getAdminActiveInternalOutreachOpportunityBySource,
  getAdminInternalOutreachDraftById,
  getAdminInternalOutreachOpportunityById,
  hasAdminActiveInternalOutreachSuppression,
  insertAdminInternalOutreachApprovalStep,
  insertAdminInternalOutreachDraft,
  insertAdminInternalOutreachOpportunity,
  insertAdminInternalOutreachPlaybookItem,
  insertAdminInternalOutreachSuppression,
  listAdminInternalOutreachApprovalSteps,
  listAdminInternalOutreachDrafts,
  listAdminInternalOutreachEvidenceLinks,
  listAdminInternalOutreachOpportunities,
  listAdminInternalOutreachPlaybookItems,
  listAdminInternalOutreachSuppressions,
  updateAdminInternalOutreachApprovalStep,
  updateAdminInternalOutreachDraft,
  updateAdminInternalOutreachDraftStatus,
  updateAdminInternalOutreachOpportunity,
  updateAdminInternalOutreachOpportunityStatus,
  upsertAdminInternalOutreachEvidenceLink
} from "@/lib/internal-outreach-intelligence/repositories/admin-internal-outreach-repository";

type OrganizationMemberContext = Array<{
  user_id?: string | null;
  role?: string | null;
  user?: {
    email?: string | null;
    full_name?: string | null;
    notification_email?: string | null;
  } | null;
}>;

export type InternalOutreachPreparedDetail = Awaited<ReturnType<typeof loadOpportunityDetail>>;

export class InternalOutreachTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InternalOutreachTransitionError";
  }
}

export class InternalOutreachConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InternalOutreachConflictError";
  }
}

function detectionValues(detection: OutreachOpportunityDetection, existing?: Pick<InternalOutreachOpportunity, "approver_user_id"> | null) {
  return {
    opportunity_type: detection.opportunityType,
    status: detection.blockerCodes.length ? "evidence_pending" : "ready_for_review",
    priority: detection.priority,
    audience: detection.audience,
    recommended_channel: detection.recommendedChannel,
    reason_summary: sanitizeOutreachText(detection.reasonSummary, 1000),
    expected_commercial_impact: sanitizeOutreachMetadata(detection.expectedCommercialImpact),
    evidence_confidence: detection.evidenceConfidence,
    due_date: detection.dueDate,
    renewal_deadline: detection.renewalDeadline,
    blocker_codes: detection.blockerCodes,
    warning_codes: detection.warningCodes,
    safety_status: detection.safetyStatus,
    safety_reasons: detection.safetyReasons,
    approver_user_id: existing?.approver_user_id ?? null
  };
}

function draftValues(generated: OutreachDraftGenerationResult, approverUserId?: string | null) {
  return {
    status: "draft",
    audience: generated.audience,
    channel: generated.channel,
    tone: generated.tone,
    title: sanitizeOutreachText(generated.title, 160),
    subject_or_heading: generated.subjectOrHeading ? sanitizeOutreachText(generated.subjectOrHeading, 240) : null,
    body_preview: sanitizeOutreachText(generated.bodyPreview, 4000),
    key_points: generated.keyPoints.map((point) => sanitizeOutreachText(point, 240)),
    evidence_references: generated.evidenceReferences.map((reference) => sanitizeOutreachText(reference, 180)),
    ask: sanitizeOutreachText(generated.ask, 1000),
    next_step: sanitizeOutreachText(generated.nextStep, 1000),
    internal_reviewer_note: sanitizeOutreachText(generated.internalReviewerNote, 1000),
    safety_status: generated.safetyStatus,
    safety_reasons: generated.safetyReasons,
    copy_allowed: false,
    approver_user_id: approverUserId ?? null
  };
}

async function auditOutreach(input: {
  organizationId: string;
  actorUserId?: string | null;
  eventType: string;
  opportunity?: InternalOutreachOpportunity | null;
  draft?: Pick<InternalOutreachDraft, "id" | "status" | "safety_status" | "safety_reasons"> | null;
  previousStatus?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await recordEnterpriseAuditEvent({
    organizationId: input.organizationId,
    contractId: input.opportunity?.contract_id ?? null,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    eventCategory: "evidence",
    eventSource: "internal_outreach_intelligence",
    severity:
      input.eventType === "internal_outreach.safety_blocked" || input.opportunity?.priority === "critical"
        ? "warning"
        : "info",
    metadata: buildSafeOutreachAuditMetadata({
      opportunity: input.opportunity ?? null,
      draftId: input.draft?.id ?? null,
      previousStatus: input.previousStatus ?? null,
      metadata: {
        draftStatus: input.draft?.status ?? null,
        draftSafetyStatus: input.draft?.safety_status ?? null,
        draftSafetyReasons: input.draft?.safety_reasons ?? [],
        ...(input.metadata ?? {})
      }
    }),
    mode: "best_effort"
  });
}

async function loadDetectionContext(input: { organizationId: string; contractId: string }) {
  const decisionResult = await getAdminActiveCommercialDecisionByContractId(input);
  if (decisionResult.error) throw decisionResult.error;
  const decision = decisionResult.data ?? null;
  const [contract, quoteComparisons, quoteFindings, savingsOpportunities, negotiationBrief] = await Promise.all([
    getContractById(input.contractId, input.organizationId),
    listQuoteComparisons({ organizationId: input.organizationId, contractId: input.contractId, limit: 1 }),
    listQuoteFindings({ organizationId: input.organizationId, contractId: input.contractId, limit: 25 }),
    listSavingsOpportunities({ organizationId: input.organizationId, contractId: input.contractId, limit: 25 }),
    decision
      ? getAdminActiveNegotiationBriefByDecisionId({
          organizationId: input.organizationId,
          commercialDecisionId: decision.id
        })
      : Promise.resolve({ data: null, error: null })
  ]);
  if (negotiationBrief.error) throw negotiationBrief.error;
  const metadata = Array.isArray(contract.contract_metadata)
    ? contract.contract_metadata[0] ?? null
    : contract.contract_metadata ?? null;
  return {
    decision,
    quoteComparison: quoteComparisons[0] ?? null,
    quoteFindings,
    savingsOpportunities,
    negotiationBrief: negotiationBrief.data,
    contract: {
      id: contract.id,
      owner_user_id: contract.owner_user_id,
      contract_metadata: metadata
    }
  };
}

export async function detectOutreachOpportunitiesForContract(input: {
  organizationId: string;
  contractId: string;
  actorUserId?: string | null;
}) {
  const context = await loadDetectionContext(input);
  const detections = detectInternalOutreachOpportunities(context);
  const created: InternalOutreachOpportunity[] = [];
  for (const detection of detections) {
    const existing = await getAdminActiveInternalOutreachOpportunityBySource({
      organizationId: input.organizationId,
      contractId: input.contractId,
      commercialDecisionId: context.decision?.id ?? null,
      negotiationBriefId: context.negotiationBrief?.id ?? null,
      opportunityType: detection.opportunityType,
      audience: detection.audience
    });
    if (existing.error) throw existing.error;
    const opportunity = existing.data
      ? await updateOpportunityFromDetection({
          organizationId: input.organizationId,
          opportunity: existing.data,
          detection,
          actorUserId: input.actorUserId ?? null
        })
      : await insertOpportunityFromDetection({
          organizationId: input.organizationId,
          contractId: input.contractId,
          commercialDecisionId: context.decision?.id ?? null,
          negotiationBriefId: context.negotiationBrief?.id ?? null,
          ownerUserId: context.decision?.owner_user_id ?? context.contract.owner_user_id ?? null,
          actorUserId: input.actorUserId ?? null,
          detection
        });
    created.push(opportunity);
  }
  return created;
}

async function insertOpportunityFromDetection(input: {
  organizationId: string;
  contractId: string;
  commercialDecisionId?: string | null;
  negotiationBriefId?: string | null;
  ownerUserId?: string | null;
  actorUserId?: string | null;
  detection: OutreachOpportunityDetection;
}) {
  const result = await insertAdminInternalOutreachOpportunity({
    organizationId: input.organizationId,
    contractId: input.contractId,
    commercialDecisionId: input.commercialDecisionId ?? null,
    negotiationBriefId: input.negotiationBriefId ?? null,
    createdByUserId: input.actorUserId ?? null,
    values: {
      ...detectionValues(input.detection),
      owner_user_id: input.ownerUserId ?? null
    }
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Internal outreach opportunity was not created.");
  await attachDetectionEvidence({
    organizationId: input.organizationId,
    opportunity: result.data,
    detection: input.detection,
    actorUserId: input.actorUserId ?? null
  });
  await auditOutreach({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "internal_outreach_opportunity.detected",
    opportunity: result.data
  });
  await auditOutreach({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "internal_outreach_opportunity.created",
    opportunity: result.data
  });
  return result.data;
}

async function updateOpportunityFromDetection(input: {
  organizationId: string;
  opportunity: InternalOutreachOpportunity;
  detection: OutreachOpportunityDetection;
  actorUserId?: string | null;
}) {
  assertOpportunityEditable(input.opportunity);
  const result = await updateAdminInternalOutreachOpportunity({
    organizationId: input.organizationId,
    opportunityId: input.opportunity.id,
    values: detectionValues(input.detection, input.opportunity)
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Internal outreach opportunity was not recomputed.");
  await attachDetectionEvidence({
    organizationId: input.organizationId,
    opportunity: result.data,
    detection: input.detection,
    actorUserId: input.actorUserId ?? null
  });
  await auditOutreach({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "internal_outreach_opportunity.recomputed",
    previousStatus: input.opportunity.status,
    opportunity: result.data
  });
  return result.data;
}

async function attachDetectionEvidence(input: {
  organizationId: string;
  opportunity: InternalOutreachOpportunity;
  detection: OutreachOpportunityDetection;
  actorUserId?: string | null;
}) {
  await Promise.all(
    input.detection.evidenceLinks.map((link) =>
      upsertAdminInternalOutreachEvidenceLink({
        organizationId: input.organizationId,
        opportunityId: input.opportunity.id,
        contractId: input.opportunity.contract_id,
        commercialDecisionId: input.opportunity.commercial_decision_id,
        negotiationBriefId: input.opportunity.negotiation_brief_id,
        createdByUserId: input.actorUserId ?? null,
        values: {
          evidence_type: link.evidenceType,
          evidence_id: link.evidenceId ?? null,
          evidence_label: sanitizeOutreachText(link.evidenceLabel, 180),
          confidence: link.confidence ?? null,
          metadata: sanitizeOutreachMetadata(link.metadata ?? {})
        }
      })
    )
  );
  await auditOutreach({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "internal_outreach.evidence_attached",
    opportunity: input.opportunity,
    metadata: { evidenceCount: input.detection.evidenceLinks.length }
  });
}

export async function createOutreachOpportunityFromDecision(input: {
  organizationId: string;
  commercialDecisionId: string;
  actorUserId?: string | null;
}) {
  const result = await getAdminCommercialDecisionById({
    organizationId: input.organizationId,
    decisionId: input.commercialDecisionId
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Commercial decision was not found for the active organization.");
  const opportunities = await detectOutreachOpportunitiesForContract({
    organizationId: input.organizationId,
    contractId: result.data.contract_id,
    actorUserId: input.actorUserId ?? null
  });
  return opportunities.filter((opportunity) => opportunity.commercial_decision_id === input.commercialDecisionId);
}

export async function recomputeOutreachOpportunity(input: {
  organizationId: string;
  opportunityId: string;
  actorUserId?: string | null;
}) {
  const opportunity = await getRequiredOpportunity(input.organizationId, input.opportunityId);
  assertOpportunityEditable(opportunity);
  if (!opportunity.contract_id) throw new InternalOutreachTransitionError("Only contract-scoped opportunities can be recomputed.");
  const recomputed = await detectOutreachOpportunitiesForContract({
    organizationId: input.organizationId,
    contractId: opportunity.contract_id,
    actorUserId: input.actorUserId ?? null
  });
  return recomputed.find((item) => item.id === opportunity.id) ?? opportunity;
}

export async function dismissOutreachOpportunity(input: {
  organizationId: string;
  opportunityId: string;
  actorUserId?: string | null;
}) {
  const opportunity = await getRequiredOpportunity(input.organizationId, input.opportunityId);
  return transitionOpportunity({
    organizationId: input.organizationId,
    opportunity,
    actorUserId: input.actorUserId ?? null,
    eventType: "internal_outreach_opportunity.dismissed",
    values: { status: "dismissed", dismissed_at: new Date().toISOString() }
  });
}

export async function archiveOutreachOpportunity(input: {
  organizationId: string;
  opportunityId: string;
  actorUserId?: string | null;
}) {
  const opportunity = await getRequiredOpportunity(input.organizationId, input.opportunityId);
  return transitionOpportunity({
    organizationId: input.organizationId,
    opportunity,
    actorUserId: input.actorUserId ?? null,
    eventType: "internal_outreach_opportunity.archived",
    values: { status: "archived", archived_at: new Date().toISOString() }
  });
}

export async function attachOutreachEvidence(input: {
  organizationId: string;
  opportunityId: string;
  actorUserId?: string | null;
  evidenceType: string;
  evidenceId?: string | null;
  evidenceLabel: string;
  confidence?: number | null;
  metadata?: Record<string, unknown>;
}) {
  const opportunity = await getRequiredOpportunity(input.organizationId, input.opportunityId);
  assertOpportunityEditable(opportunity);
  const result = await upsertAdminInternalOutreachEvidenceLink({
    organizationId: input.organizationId,
    opportunityId: opportunity.id,
    contractId: opportunity.contract_id,
    commercialDecisionId: opportunity.commercial_decision_id,
    negotiationBriefId: opportunity.negotiation_brief_id,
    createdByUserId: input.actorUserId ?? null,
    values: {
      evidence_type: input.evidenceType,
      evidence_id: input.evidenceId ?? null,
      evidence_label: sanitizeOutreachText(input.evidenceLabel, 180),
      confidence: input.confidence ?? null,
      metadata: sanitizeOutreachMetadata(input.metadata ?? {})
    }
  });
  if (result.error) throw result.error;
  await auditOutreach({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "internal_outreach.evidence_attached",
    opportunity,
    metadata: { evidenceType: input.evidenceType }
  });
  return result.data;
}

export async function createOutreachDraft(input: {
  organizationId: string;
  opportunityId: string;
  actorUserId?: string | null;
  channel?: OutreachChannel;
  tone?: OutreachTone;
}) {
  const opportunity = await getRequiredOpportunity(input.organizationId, input.opportunityId);
  assertOpportunityEditable(opportunity);
  await assertNoActiveSuppression(input.organizationId, opportunity);
  const generated = buildInternalOutreachDraft({
    opportunity,
    channel: input.channel,
    tone: input.tone
  });
  const result = await insertAdminInternalOutreachDraft({
    organizationId: input.organizationId,
    opportunityId: opportunity.id,
    contractId: opportunity.contract_id,
    createdByUserId: input.actorUserId ?? null,
    values: draftValues(generated, opportunity.approver_user_id)
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Internal outreach draft was not created.");
  await auditOutreach({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "internal_outreach_draft.created",
    opportunity,
    draft: result.data
  });
  return result.data;
}

export async function regenerateOutreachDraft(input: {
  organizationId: string;
  draftId: string;
  actorUserId?: string | null;
  channel?: OutreachChannel;
  tone?: OutreachTone;
}) {
  const draft = await getRequiredDraft(input.organizationId, input.draftId);
  assertDraftEditable(draft);
  const opportunity = await getRequiredOpportunity(input.organizationId, draft.opportunity_id);
  await assertNoActiveSuppression(input.organizationId, opportunity);
  const generated = buildInternalOutreachDraft({
    opportunity,
    channel: input.channel ?? draft.channel,
    tone: input.tone ?? draft.tone
  });
  const result = await updateAdminInternalOutreachDraft({
    organizationId: input.organizationId,
    draftId: draft.id,
    values: draftValues(generated, draft.approver_user_id)
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Internal outreach draft was not regenerated.");
  await auditOutreach({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "internal_outreach_draft.regenerated",
    opportunity,
    draft: result.data
  });
  return result.data;
}

export async function submitOutreachDraftForApproval(input: {
  organizationId: string;
  draftId: string;
  actorUserId?: string | null;
  approverUserId?: string | null;
}) {
  const draft = await getRequiredDraft(input.organizationId, input.draftId);
  if (!["draft", "ready_for_review"].includes(draft.status)) throw new InternalOutreachTransitionError("Internal outreach draft cannot be submitted from its current state.");
  if (draft.safety_status === "blocked") throw new InternalOutreachTransitionError("Blocked internal outreach drafts cannot be submitted.");
  const opportunity = await getRequiredOpportunity(input.organizationId, draft.opportunity_id);
  await assertNoActiveSuppression(input.organizationId, opportunity);
  const approverUserId = input.approverUserId ?? draft.approver_user_id ?? opportunity.approver_user_id;
  if (!approverUserId) throw new InternalOutreachTransitionError("Internal outreach draft requires an approver before approval.");
  const updated = await transitionDraft({
    organizationId: input.organizationId,
    opportunity,
    draft,
    actorUserId: input.actorUserId ?? null,
    eventType: "internal_outreach_draft.submitted_for_approval",
    values: { status: "in_approval", approver_user_id: approverUserId, submitted_at: new Date().toISOString() },
    metadata: { approvalActor: approverUserId }
  });
  await insertAdminInternalOutreachApprovalStep({
    organizationId: input.organizationId,
    opportunityId: opportunity.id,
    draftId: draft.id,
    contractId: opportunity.contract_id,
    values: { step_order: 1, status: "pending", approver_user_id: approverUserId }
  });
  return updated;
}

export async function approveOutreachDraftForCopy(input: {
  organizationId: string;
  draftId: string;
  actorUserId: string;
}) {
  const draft = await getRequiredDraft(input.organizationId, input.draftId);
  const opportunity = await getRequiredOpportunity(input.organizationId, draft.opportunity_id);
  await assertNoActiveSuppression(input.organizationId, opportunity);
  if (draft.status !== "in_approval") throw new InternalOutreachTransitionError("Internal outreach draft must be in approval.");
  if (draft.safety_status === "blocked" || opportunity.safety_status === "blocked") {
    await auditOutreach({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      eventType: "internal_outreach.safety_blocked",
      opportunity,
      draft
    });
    throw new InternalOutreachTransitionError("Blocked internal outreach drafts cannot be approved for copy.");
  }
  if (draft.approver_user_id && draft.approver_user_id !== input.actorUserId) {
    throw new InternalOutreachTransitionError("Only the assigned approver can approve this internal outreach draft.");
  }
  const updated = await transitionDraft({
    organizationId: input.organizationId,
    opportunity,
    draft,
    actorUserId: input.actorUserId,
    eventType: "internal_outreach_draft.approved_for_copy",
    values: { status: "approved_for_copy", copy_allowed: true, approved_for_copy_at: new Date().toISOString() },
    metadata: { approvalActor: input.actorUserId }
  });
  await markPendingDraftApprovalStep(input.organizationId, draft.id, input.actorUserId, "approved");
  return updated;
}

export async function rejectOutreachDraft(input: {
  organizationId: string;
  draftId: string;
  actorUserId: string;
}) {
  const draft = await getRequiredDraft(input.organizationId, input.draftId);
  const opportunity = await getRequiredOpportunity(input.organizationId, draft.opportunity_id);
  if (draft.status !== "in_approval") throw new InternalOutreachTransitionError("Internal outreach draft must be in approval.");
  const updated = await transitionDraft({
    organizationId: input.organizationId,
    opportunity,
    draft,
    actorUserId: input.actorUserId,
    eventType: "internal_outreach_draft.rejected",
    values: { status: "rejected", rejected_at: new Date().toISOString(), copy_allowed: false },
    metadata: { approvalActor: input.actorUserId }
  });
  await markPendingDraftApprovalStep(input.organizationId, draft.id, input.actorUserId, "rejected");
  return updated;
}

export async function archiveOutreachDraft(input: {
  organizationId: string;
  draftId: string;
  actorUserId?: string | null;
}) {
  const draft = await getRequiredDraft(input.organizationId, input.draftId);
  const opportunity = await getRequiredOpportunity(input.organizationId, draft.opportunity_id);
  return transitionDraft({
    organizationId: input.organizationId,
    opportunity,
    draft,
    actorUserId: input.actorUserId ?? null,
    eventType: "internal_outreach_draft.archived",
    values: { status: "archived", archived_at: new Date().toISOString(), copy_allowed: false }
  });
}

export async function createOutreachPlaybookItem(input: {
  organizationId: string;
  opportunityId: string;
  actorUserId?: string | null;
  title: string;
  body: string;
}) {
  const opportunity = await getRequiredOpportunity(input.organizationId, input.opportunityId);
  const result = await insertAdminInternalOutreachPlaybookItem({
    organizationId: input.organizationId,
    opportunityId: opportunity.id,
    contractId: opportunity.contract_id,
    createdByUserId: input.actorUserId ?? null,
    values: {
      title: sanitizeOutreachText(input.title || "Internal outreach playbook item", 160),
      body: sanitizeOutreachText(input.body || "Review internal outreach evidence.", 1000),
      status: "open"
    }
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Internal outreach playbook item was not created.");
  await auditOutreach({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "internal_outreach_playbook_item.created",
    opportunity,
    metadata: { playbookItemId: result.data.id }
  });
  return result.data;
}

export async function createOutreachSuppression(input: {
  organizationId: string;
  actorUserId?: string | null;
  opportunityId?: string | null;
  contractId?: string | null;
  audience: OutreachAudience;
  contactIdentifier?: string | null;
  scopedInternalUserId?: string | null;
  reasonCode: string;
  notesPreview?: string | null;
  expiresAt?: string | null;
}) {
  const opportunity = input.opportunityId ? await getRequiredOpportunity(input.organizationId, input.opportunityId) : null;
  if (!input.actorUserId) throw new InternalOutreachTransitionError("Internal outreach suppression requires an authenticated actor.");
  const reasonCode = normalizeOutreachSuppressionReasonCode(input.reasonCode);
  const result = await insertAdminInternalOutreachSuppression({
    organizationId: input.organizationId,
    contractId: input.contractId ?? opportunity?.contract_id ?? null,
    opportunityId: input.opportunityId ?? null,
    suppressedByUserId: input.actorUserId ?? null,
    values: {
      audience: input.audience,
      contact_identifier_hash: input.contactIdentifier ? hashContactIdentifier(input.contactIdentifier) : null,
      scoped_internal_user_id: input.scopedInternalUserId ?? null,
      reason_code: reasonCode,
      notes_preview: input.notesPreview ? sanitizeOutreachText(input.notesPreview, 300) : null,
      expires_at: input.expiresAt ?? null
    }
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Internal outreach suppression was not created.");
  await auditOutreach({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "internal_outreach_suppression.created",
    opportunity,
    metadata: {
      ...buildSuppressionAuditMetadata({
        suppressionId: result.data.id,
        audience: input.audience,
        reasonCode,
        expiresAt: input.expiresAt ?? null,
        notesPreview: input.notesPreview ?? null
      }),
      suppressionId: result.data.id,
      audience: input.audience,
      reasonCode: result.data.reason_code,
      notesRecorded: Boolean(result.data.notes_preview)
    }
  });
  return result.data;
}

export async function listInternalOutreachForContract(input: {
  organizationId: string;
  contractId: string;
  organizationMembers?: OrganizationMemberContext;
}) {
  const opportunities = await listAdminInternalOutreachOpportunities({
    organizationId: input.organizationId,
    contractId: input.contractId,
    limit: 25
  });
  if (opportunities.error) throw opportunities.error;
  const details = await Promise.all((opportunities.data ?? []).map((opportunity) => loadOpportunityDetail(input.organizationId, opportunity, input.organizationMembers)));
  return { opportunities: details };
}

export async function listInternalOutreachQueue(input: {
  organizationId: string;
  limit?: number;
  organizationMembers?: OrganizationMemberContext;
}) {
  const opportunities = await listAdminInternalOutreachOpportunities({
    organizationId: input.organizationId,
    limit: input.limit ?? 50
  });
  if (opportunities.error) throw opportunities.error;
  return { opportunities: await Promise.all((opportunities.data ?? []).map((opportunity) => loadOpportunityDetail(input.organizationId, opportunity, input.organizationMembers))) };
}

async function loadOpportunityDetail(
  organizationId: string,
  opportunity: InternalOutreachOpportunity,
  organizationMembers?: OrganizationMemberContext
) {
  const [evidence, drafts, playbookItems, suppressions] = await Promise.all([
    listAdminInternalOutreachEvidenceLinks({ organizationId, opportunityId: opportunity.id }),
    listAdminInternalOutreachDrafts({ organizationId, opportunityId: opportunity.id, limit: 5 }),
    listAdminInternalOutreachPlaybookItems({ organizationId, opportunityId: opportunity.id, limit: 5 }),
    listAdminInternalOutreachSuppressions({ organizationId, opportunityId: opportunity.id, limit: 5 })
  ]);
  if (evidence.error) throw evidence.error;
  if (drafts.error) throw drafts.error;
  if (playbookItems.error) throw playbookItems.error;
  if (suppressions.error) throw suppressions.error;
  const approvalSteps = await Promise.all(
    (drafts.data ?? []).map((draft) =>
      listAdminInternalOutreachApprovalSteps({ organizationId, draftId: draft.id })
    )
  );
  const prepared = prepareOutreachDerivedState({
    opportunity,
    evidenceLinks: evidence.data ?? [],
    drafts: drafts.data ?? [],
    suppressions: suppressions.data ?? [],
    organizationMembers
  });
  return {
    opportunity,
    evidenceLinks: evidence.data ?? [],
    drafts: drafts.data ?? [],
    approvalSteps: approvalSteps.flatMap((result) => result.data ?? []),
    playbookItems: playbookItems.data ?? [],
    suppressions: suppressions.data ?? [],
    ...prepared
  };
}

function prepareOutreachDerivedState(input: {
  opportunity: InternalOutreachOpportunity;
  evidenceLinks: Awaited<ReturnType<typeof listAdminInternalOutreachEvidenceLinks>>["data"];
  drafts: Awaited<ReturnType<typeof listAdminInternalOutreachDrafts>>["data"];
  suppressions: Awaited<ReturnType<typeof listAdminInternalOutreachSuppressions>>["data"];
  organizationMembers?: OrganizationMemberContext;
}) {
  const evidenceLinks = input.evidenceLinks ?? [];
  const drafts = input.drafts ?? [];
  const suppressions = input.suppressions ?? [];
  const latestDraft = drafts[0] ?? null;
  const priorityScore = scoreOutreachOpportunityView({
    opportunity: input.opportunity,
    drafts,
    evidenceLinks,
    suppressions
  });
  const audienceResolution = resolveOutreachAudienceView({
    opportunity: input.opportunity,
    organizationMembers: input.organizationMembers
  });
  const sequencePlan = planOutreachSequenceView({
    opportunity: input.opportunity,
    draft: latestDraft,
    priority: priorityScore,
    suppressions
  });
  const crmNote = buildCrmNoteForOpportunityView({
    opportunity: input.opportunity,
    priority: priorityScore,
    evidenceLinks
  });
  const safetyReview = evaluateOutreachSafety({
    audience: input.opportunity.audience,
    draftText: latestDraft?.body_preview ?? input.opportunity.reason_summary,
    hasEvidenceForSavingsClaim: evidenceLinks.length > 0,
    suppressions
  });
  return { priorityScore, audienceResolution, sequencePlan, crmNote, safetyReview };
}

export async function scoreOutreachOpportunity(input: {
  organizationId: string;
  opportunityId: string;
  actorUserId?: string | null;
}): Promise<OutreachPriorityScore> {
  const opportunity = await getRequiredOpportunity(input.organizationId, input.opportunityId);
  const detail = await loadOpportunityDetail(input.organizationId, opportunity);
  await auditOutreach({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "internal_outreach.priority_scored",
    opportunity,
    metadata: {
      priorityScore: detail.priorityScore.priorityScore,
      priorityBand: detail.priorityScore.priorityBand,
      confidenceScore: detail.priorityScore.confidenceScore
    }
  });
  return detail.priorityScore;
}

export async function resolveOutreachAudience(input: {
  organizationId: string;
  opportunityId: string;
  actorUserId?: string | null;
  organizationMembers?: OrganizationMemberContext;
  contactIdentifier?: string | null;
}): Promise<OutreachAudienceResolution> {
  const opportunity = await getRequiredOpportunity(input.organizationId, input.opportunityId);
  const result = resolveOutreachAudienceView({
    opportunity,
    organizationMembers: input.organizationMembers,
    contactIdentifier: input.contactIdentifier ?? null
  });
  await auditOutreach({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "internal_outreach.audience_resolved",
    opportunity,
    metadata: {
      audienceRole: result.audienceRole,
      userId: result.userId,
      resolutionConfidence: result.resolutionConfidence,
      blockerCodes: result.blockerCodes,
      warningCodes: result.warningCodes
    }
  });
  return result;
}

export async function planOutreachSequence(input: {
  organizationId: string;
  opportunityId: string;
  actorUserId?: string | null;
}): Promise<OutreachSequencePlan> {
  const opportunity = await getRequiredOpportunity(input.organizationId, input.opportunityId);
  const detail = await loadOpportunityDetail(input.organizationId, opportunity);
  await auditOutreach({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "internal_outreach.sequence_planned",
    opportunity,
    metadata: {
      sequenceStepCount: detail.sequencePlan.steps.length,
      blockerCodes: detail.sequencePlan.blockerCodes
    }
  });
  return detail.sequencePlan;
}

export async function buildCrmNoteForOpportunity(input: {
  organizationId: string;
  opportunityId: string;
  actorUserId?: string | null;
}): Promise<OutreachCrmNote> {
  const opportunity = await getRequiredOpportunity(input.organizationId, input.opportunityId);
  const detail = await loadOpportunityDetail(input.organizationId, opportunity);
  await auditOutreach({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "internal_outreach.crm_note_generated",
    opportunity,
    metadata: {
      syncStatus: detail.crmNote.syncStatus,
      priorityBand: detail.crmNote.priorityBand,
      evidenceCount: detail.crmNote.evidenceReferences.length
    }
  });
  return detail.crmNote;
}

export async function refreshOutreachOpportunityIntelligence(input: {
  organizationId: string;
  opportunityId: string;
  actorUserId?: string | null;
}) {
  const opportunity = await getRequiredOpportunity(input.organizationId, input.opportunityId);
  const detail = await loadOpportunityDetail(input.organizationId, opportunity);
  await auditOutreach({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "internal_outreach.safety_reviewed",
    opportunity,
    metadata: {
      priorityScore: detail.priorityScore.priorityScore,
      priorityBand: detail.priorityScore.priorityBand,
      safetyStatus: detail.safetyReview.safetyStatus,
      blockedPhraseCount: detail.safetyReview.blockedPhrases.length,
      unsupportedClaimCount: detail.safetyReview.unsupportedClaims.length,
      sequenceStepCount: detail.sequencePlan.steps.length
    }
  });
  return detail;
}

export async function dismissDuplicateOutreachOpportunity(input: {
  organizationId: string;
  opportunityId: string;
  duplicateOfOpportunityId?: string | null;
  actorUserId?: string | null;
}) {
  const opportunity = await getRequiredOpportunity(input.organizationId, input.opportunityId);
  return transitionOpportunity({
    organizationId: input.organizationId,
    opportunity,
    actorUserId: input.actorUserId ?? null,
    eventType: "internal_outreach.duplicate_dismissed",
    values: { status: "dismissed", dismissed_at: new Date().toISOString() },
    metadata: {
      reasonCode: "duplicate_opportunity",
      duplicateOfOpportunityId: input.duplicateOfOpportunityId ?? null
    }
  });
}

async function transitionOpportunity(input: {
  organizationId: string;
  opportunity: InternalOutreachOpportunity;
  actorUserId?: string | null;
  eventType: string;
  values: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  const result = await updateAdminInternalOutreachOpportunityStatus({
    organizationId: input.organizationId,
    opportunityId: input.opportunity.id,
    expectedStatus: input.opportunity.status,
    values: input.values
  });
  if (result.error) throw result.error;
  if (!result.data) throw new InternalOutreachConflictError("Internal outreach opportunity changed while the transition was being applied.");
  await auditOutreach({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    previousStatus: input.opportunity.status,
    opportunity: result.data,
    metadata: input.metadata
  });
  return result.data;
}

async function transitionDraft(input: {
  organizationId: string;
  opportunity: InternalOutreachOpportunity;
  draft: InternalOutreachDraft;
  actorUserId?: string | null;
  eventType: string;
  values: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  const result = await updateAdminInternalOutreachDraftStatus({
    organizationId: input.organizationId,
    draftId: input.draft.id,
    expectedStatus: input.draft.status,
    values: input.values
  });
  if (result.error) throw result.error;
  if (!result.data) throw new InternalOutreachConflictError("Internal outreach draft changed while the transition was being applied.");
  await auditOutreach({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    previousStatus: input.draft.status,
    opportunity: input.opportunity,
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
  const steps = await listAdminInternalOutreachApprovalSteps({ organizationId, draftId });
  if (steps.error) throw steps.error;
  const pending = (steps.data ?? []).find((step) => step.status === "pending");
  if (!pending) return null;
  const result = await updateAdminInternalOutreachApprovalStep({
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

async function assertNoActiveSuppression(organizationId: string, opportunity: InternalOutreachOpportunity) {
  const suppression = await hasAdminActiveInternalOutreachSuppression({
    organizationId,
    audience: opportunity.audience,
    opportunityId: opportunity.id,
    contractId: opportunity.contract_id
  });
  if (suppression.error) throw suppression.error;
  if (suppression.data) {
    await auditOutreach({
      organizationId,
      eventType: "internal_outreach.safety_blocked",
      opportunity,
      metadata: { reasonCode: "active_suppression" }
    });
    throw new InternalOutreachTransitionError("Active internal outreach suppression blocks draft approval or generation.");
  }
}

async function getRequiredOpportunity(organizationId: string, opportunityId: string) {
  const result = await getAdminInternalOutreachOpportunityById({ organizationId, opportunityId });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Internal outreach opportunity was not found for the active organization.");
  return result.data;
}

async function getRequiredDraft(organizationId: string, draftId: string) {
  const result = await getAdminInternalOutreachDraftById({ organizationId, draftId });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Internal outreach draft was not found for the active organization.");
  return result.data;
}

function assertOpportunityEditable(opportunity: InternalOutreachOpportunity) {
  if (["approved_for_copy", "dismissed", "archived"].includes(opportunity.status)) {
    throw new InternalOutreachTransitionError("Approved, dismissed, or archived internal outreach opportunities cannot be edited.");
  }
}

function assertDraftEditable(draft: InternalOutreachDraft) {
  if (["approved_for_copy", "archived"].includes(draft.status)) {
    throw new InternalOutreachTransitionError("Approved or archived internal outreach drafts cannot be edited.");
  }
}

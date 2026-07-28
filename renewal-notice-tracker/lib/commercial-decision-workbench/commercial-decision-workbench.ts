import { recordEnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-recorder";
import { getContractById } from "@/lib/contracts/kernel-queries";
import { listContractExtractedFields } from "@/lib/contract-intelligence/extraction-runs";
import {
  listQuoteComparisons,
  listQuoteFindings,
  listSavingsOpportunities
} from "@/lib/quote-comparison/quote-comparison";
import { sanitizeQuoteEvidence } from "@/lib/quote-comparison/quote-normalization";
import { scoreCommercialDecision } from "@/lib/commercial-decision-workbench/decision-scoring";
import type {
  CommercialDecision,
  CommercialDecisionEvidenceType,
  CommercialDecisionScore,
  CommercialDecisionStatus,
  CommercialRecommendedAction,
  NegotiationPosture
} from "@/lib/commercial-decision-workbench/decision-types";
import {
  getAdminActiveCommercialDecisionByContractId,
  getAdminCommercialDecisionById,
  insertAdminCommercialDecision,
  insertAdminCommercialDecisionApprovalStep,
  insertAdminCommercialDecisionEvidenceLink,
  insertAdminCommercialDecisionSnapshot,
  listAdminCommercialDecisionApprovalSteps,
  listAdminCommercialDecisionEvidenceLinks,
  listAdminCommercialDecisions,
  listAdminCommercialDecisionSnapshots,
  updateAdminCommercialDecision,
  updateAdminCommercialDecisionApprovalStep,
  updateAdminCommercialDecisionNegotiationPosture,
  updateAdminCommercialDecisionRecommendedAction,
  updateAdminCommercialDecisionStatus
} from "@/lib/commercial-decision-workbench/repositories/admin-commercial-decision-repository";

export class CommercialDecisionTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommercialDecisionTransitionError";
  }
}

function firstMetadata<T>(metadata: T | T[] | null | undefined): T | null {
  return Array.isArray(metadata) ? metadata[0] ?? null : metadata ?? null;
}

function safeMetadata(input: Record<string, unknown>) {
  return sanitizeQuoteEvidence(input) as Record<string, unknown>;
}

function sanitizeReviewerNote(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (/raw\s+(?:contract|quote|ocr|document)|ocr output|provider payload|storage path|secret|token|bearer|uploaded document|full note/i.test(normalized)) {
    return "Reviewer note redacted because it contained sensitive raw content markers.";
  }
  return normalized.length > 600 ? `${normalized.slice(0, 597)}...` : normalized;
}

function valuesFromScore(score: CommercialDecisionScore) {
  return {
    recommended_action: score.recommendedAction,
    decision_status: score.decisionStatus,
    negotiation_posture: score.negotiationPosture,
    commercial_risk_level: score.commercialRiskLevel,
    evidence_confidence: score.evidenceConfidence,
    estimated_savings_amount: score.estimatedSavingsAmount,
    currency: score.currency,
    commercial_impact: score.commercialImpact,
    renewal_deadline: score.renewalDeadline,
    notice_deadline: score.noticeDeadline,
    decision_summary: score.decisionSummary,
    blocker_codes: score.blockerCodes,
    warning_codes: score.warningCodes
  };
}

async function auditDecision(input: {
  organizationId: string;
  contractId: string;
  actorUserId?: string | null;
  eventType: string;
  decision: Pick<
    CommercialDecision,
    | "id"
    | "decision_status"
    | "recommended_action"
    | "negotiation_posture"
    | "commercial_risk_level"
    | "evidence_confidence"
    | "estimated_savings_amount"
    | "currency"
    | "blocker_codes"
    | "warning_codes"
  >;
  previousStatus?: CommercialDecisionStatus | null;
  metadata?: Record<string, unknown>;
}) {
  await recordEnterpriseAuditEvent({
    organizationId: input.organizationId,
    contractId: input.contractId,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    eventCategory: "evidence",
    eventSource: "commercial_decision_workbench",
    severity:
      input.decision.commercial_risk_level === "critical"
        ? "critical"
        : input.eventType.endsWith("rejected")
          ? "warning"
          : "info",
    metadata: safeMetadata({
      decisionId: input.decision.id,
      contractId: input.contractId,
      previousStatus: input.previousStatus ?? null,
      newStatus: input.decision.decision_status,
      recommendedAction: input.decision.recommended_action,
      negotiationPosture: input.decision.negotiation_posture,
      commercialRiskLevel: input.decision.commercial_risk_level,
      evidenceConfidence: input.decision.evidence_confidence,
      blockerCodes: input.decision.blocker_codes,
      warningCodes: input.decision.warning_codes,
      estimatedSavingsAmount: input.decision.estimated_savings_amount,
      currency: input.decision.currency,
      ...(input.metadata ?? {})
    }),
    mode: "best_effort"
  });
}

export async function buildCommercialDecisionScore(input: {
  organizationId: string;
  contractId: string;
}) {
  const [contract, extractedFields, quoteComparisons, quoteFindings, savingsOpportunities] =
    await Promise.all([
      getContractById(input.contractId, input.organizationId),
      listContractExtractedFields({
        organizationId: input.organizationId,
        contractId: input.contractId,
        evidenceStatus: "accepted"
      }),
      listQuoteComparisons({
        organizationId: input.organizationId,
        contractId: input.contractId,
        limit: 1
      }),
      listQuoteFindings({
        organizationId: input.organizationId,
        contractId: input.contractId,
        limit: 25
      }),
      listSavingsOpportunities({
        organizationId: input.organizationId,
        contractId: input.contractId,
        limit: 25
      })
    ]);

  const metadata = firstMetadata(contract.contract_metadata);
  const activeReminders = (contract.reminders ?? []).filter((reminder: { status?: string }) =>
    !["cancelled", "superseded"].includes(reminder.status ?? "")
  );

  return scoreCommercialDecision({
    contract: {
      id: contract.id,
      owner_user_id: contract.owner_user_id,
      cycle_status: contract.cycle_status,
      renewal_decision_status: contract.renewal_decision_status,
      contract_metadata: metadata
    },
    acceptedExtractedFields: extractedFields.map((field) => ({
      field_key: field.field_key,
      confidence: field.confidence
    })),
    quoteComparison: quoteComparisons[0] ?? null,
    quoteFindings,
    savingsOpportunities,
    trustedReminderGate: {
      blocked: activeReminders.length === 0,
      blockerCodes: activeReminders.length === 0 ? ["trusted_reminder_blocked"] : []
    }
  });
}

export async function createDecisionSnapshot(input: {
  organizationId: string;
  decisionId: string;
  actorUserId?: string | null;
  snapshotType?: string;
  reviewerNote?: string | null;
}) {
  const decision = await getRequiredDecision(input.organizationId, input.decisionId);
  const reviewerNotePreview = sanitizeReviewerNote(input.reviewerNote);
  const result = await insertAdminCommercialDecisionSnapshot({
    organizationId: input.organizationId,
    contractId: decision.contract_id,
    decisionId: decision.id,
    createdByUserId: input.actorUserId ?? null,
    values: {
      snapshot_type: input.snapshotType ?? "scoring",
      recommended_action: decision.recommended_action,
      decision_status: decision.decision_status,
      negotiation_posture: decision.negotiation_posture,
      commercial_risk_level: decision.commercial_risk_level,
      evidence_confidence: decision.evidence_confidence,
      estimated_savings_amount: decision.estimated_savings_amount,
      currency: decision.currency,
      blocker_codes: decision.blocker_codes,
      warning_codes: decision.warning_codes,
      evidence_summary: safeMetadata({
        blockerCodes: decision.blocker_codes,
        warningCodes: decision.warning_codes,
        reviewerNotePreview
      }),
      audit_snapshot: safeMetadata({
        decisionId: decision.id,
        status: decision.decision_status,
        recommendedAction: decision.recommended_action,
        negotiationPosture: decision.negotiation_posture,
        reviewerNoteRecorded: Boolean(reviewerNotePreview)
      })
    }
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Commercial decision snapshot was not created.");

  await auditDecision({
    organizationId: input.organizationId,
    contractId: decision.contract_id,
    actorUserId: input.actorUserId ?? null,
    eventType: "commercial_decision.snapshot_created",
    decision,
    metadata: { snapshotId: result.data.id, snapshotType: result.data.snapshot_type }
  });
  return result.data;
}

export async function createCommercialDecisionForContract(input: {
  organizationId: string;
  contractId: string;
  actorUserId?: string | null;
}) {
  const existing = await getAdminActiveCommercialDecisionByContractId({
    organizationId: input.organizationId,
    contractId: input.contractId
  });
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const score = await buildCommercialDecisionScore(input);
  const result = await insertAdminCommercialDecision({
    organizationId: input.organizationId,
    contractId: input.contractId,
    createdByUserId: input.actorUserId ?? null,
    values: valuesFromScore(score)
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Commercial decision was not created.");

  await auditDecision({
    organizationId: input.organizationId,
    contractId: input.contractId,
    actorUserId: input.actorUserId ?? null,
    eventType: "commercial_decision.created",
    decision: result.data
  });
  await createDecisionSnapshot({
    organizationId: input.organizationId,
    decisionId: result.data.id,
    actorUserId: input.actorUserId ?? null,
    snapshotType: "created"
  });
  return result.data;
}

export async function recomputeCommercialDecision(input: {
  organizationId: string;
  decisionId: string;
  actorUserId?: string | null;
}) {
  const current = await getRequiredDecision(input.organizationId, input.decisionId);
  assertEditable(current);
  const score = await buildCommercialDecisionScore({
    organizationId: input.organizationId,
    contractId: current.contract_id
  });
  const updated = await updateAdminCommercialDecision({
    organizationId: input.organizationId,
    decisionId: input.decisionId,
    values: valuesFromScore(score)
  });
  if (updated.error) throw updated.error;
  if (!updated.data) throw new Error("Commercial decision was not recomputed.");

  await auditDecision({
    organizationId: input.organizationId,
    contractId: current.contract_id,
    actorUserId: input.actorUserId ?? null,
    eventType: "commercial_decision.recomputed",
    previousStatus: current.decision_status,
    decision: updated.data
  });
  await createDecisionSnapshot({
    organizationId: input.organizationId,
    decisionId: updated.data.id,
    actorUserId: input.actorUserId ?? null,
    snapshotType: "recomputed"
  });
  return updated.data;
}

export async function submitCommercialDecisionForReview(input: {
  organizationId: string;
  decisionId: string;
  actorUserId?: string | null;
  approverUserId?: string | null;
}) {
  const decision = await getRequiredDecision(input.organizationId, input.decisionId);
  if (!["ready_for_review", "evidence_pending"].includes(decision.decision_status)) {
    throw new CommercialDecisionTransitionError("Only ready or evidence-pending decisions can be submitted.");
  }
  if (decision.blocker_codes.length > 0 && !decision.blocker_codes.every((code) => code === "missing_quote_comparison")) {
    throw new CommercialDecisionTransitionError("Blocked commercial decisions cannot be submitted for review.");
  }
  const updated = await transitionDecision({
    organizationId: input.organizationId,
    decision,
    actorUserId: input.actorUserId ?? null,
    eventType: "commercial_decision.submitted_for_review",
    values: {
      decision_status: "in_approval",
      approver_user_id: input.approverUserId ?? decision.approver_user_id
    }
  });
  await insertAdminCommercialDecisionApprovalStep({
    organizationId: input.organizationId,
    contractId: decision.contract_id,
    decisionId: decision.id,
    values: {
      step_order: 1,
      status: "pending",
      approver_user_id: input.approverUserId ?? decision.approver_user_id ?? null
    }
  });
  return updated;
}

export async function approveCommercialDecision(input: {
  organizationId: string;
  decisionId: string;
  actorUserId: string;
  reviewerNote?: string | null;
}) {
  const decision = await getRequiredDecision(input.organizationId, input.decisionId);
  if (decision.decision_status !== "in_approval") {
    throw new CommercialDecisionTransitionError("Commercial decision must be in approval before approval.");
  }
  const updated = await transitionDecision({
    organizationId: input.organizationId,
    decision,
    actorUserId: input.actorUserId,
    eventType: "commercial_decision.approved",
    values: {
      decision_status: "approved",
      approved_at: new Date().toISOString(),
      approver_user_id: input.actorUserId
    },
    metadata: { reviewerNoteRecorded: Boolean(input.reviewerNote?.trim()) }
  });
  await markPendingApprovalStep({
    organizationId: input.organizationId,
    decision,
    actorUserId: input.actorUserId,
    status: "approved",
    reviewerNote: input.reviewerNote
  });
  return updated;
}

export async function rejectCommercialDecision(input: {
  organizationId: string;
  decisionId: string;
  actorUserId: string;
  reviewerNote?: string | null;
}) {
  const decision = await getRequiredDecision(input.organizationId, input.decisionId);
  if (decision.decision_status !== "in_approval") {
    throw new CommercialDecisionTransitionError("Commercial decision must be in approval before rejection.");
  }
  const updated = await transitionDecision({
    organizationId: input.organizationId,
    decision,
    actorUserId: input.actorUserId,
    eventType: "commercial_decision.rejected",
    values: {
      decision_status: "rejected",
      rejected_at: new Date().toISOString()
    },
    metadata: { reviewerNoteRecorded: Boolean(input.reviewerNote?.trim()) }
  });
  await markPendingApprovalStep({
    organizationId: input.organizationId,
    decision,
    actorUserId: input.actorUserId,
    status: "rejected",
    reviewerNote: input.reviewerNote
  });
  return updated;
}

export async function finalizeCommercialDecision(input: {
  organizationId: string;
  decisionId: string;
  actorUserId: string;
}) {
  const decision = await getRequiredDecision(input.organizationId, input.decisionId);
  if (decision.decision_status !== "approved") {
    throw new CommercialDecisionTransitionError("Only approved commercial decisions can be finalized.");
  }
  return transitionDecision({
    organizationId: input.organizationId,
    decision,
    actorUserId: input.actorUserId,
    eventType: "commercial_decision.finalized",
    values: {
      decision_status: "finalized",
      finalized_at: new Date().toISOString()
    }
  });
}

export async function archiveCommercialDecision(input: {
  organizationId: string;
  decisionId: string;
  actorUserId: string;
}) {
  const decision = await getRequiredDecision(input.organizationId, input.decisionId);
  return transitionDecision({
    organizationId: input.organizationId,
    decision,
    actorUserId: input.actorUserId,
    eventType: "commercial_decision.archived",
    values: {
      decision_status: "archived",
      archived_at: new Date().toISOString()
    }
  });
}

export async function updateCommercialDecisionRecommendedAction(input: {
  organizationId: string;
  decisionId: string;
  actorUserId: string;
  recommendedAction: CommercialRecommendedAction;
}) {
  const decision = await getRequiredDecision(input.organizationId, input.decisionId);
  assertEditable(decision);
  const result = await updateAdminCommercialDecisionRecommendedAction({
    organizationId: input.organizationId,
    decisionId: input.decisionId,
    values: { recommended_action: input.recommendedAction }
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Commercial decision action was not updated.");
  await auditDecision({
    organizationId: input.organizationId,
    contractId: decision.contract_id,
    actorUserId: input.actorUserId,
    eventType: "commercial_decision.recommended_action_changed",
    decision: result.data,
    metadata: { previousRecommendedAction: decision.recommended_action }
  });
  return result.data;
}

export async function updateCommercialDecisionNegotiationPosture(input: {
  organizationId: string;
  decisionId: string;
  actorUserId: string;
  negotiationPosture: NegotiationPosture;
}) {
  const decision = await getRequiredDecision(input.organizationId, input.decisionId);
  assertEditable(decision);
  const result = await updateAdminCommercialDecisionNegotiationPosture({
    organizationId: input.organizationId,
    decisionId: input.decisionId,
    values: { negotiation_posture: input.negotiationPosture }
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Commercial decision posture was not updated.");
  await auditDecision({
    organizationId: input.organizationId,
    contractId: decision.contract_id,
    actorUserId: input.actorUserId,
    eventType: "commercial_decision.negotiation_posture_changed",
    decision: result.data,
    metadata: { previousNegotiationPosture: decision.negotiation_posture }
  });
  return result.data;
}

export async function attachDecisionEvidence(input: {
  organizationId: string;
  decisionId: string;
  actorUserId?: string | null;
  evidenceType: CommercialDecisionEvidenceType;
  evidenceId?: string | null;
  evidenceLabel: string;
  confidence?: number | null;
  riskLevel?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const decision = await getRequiredDecision(input.organizationId, input.decisionId);
  assertEditable(decision);
  const result = await insertAdminCommercialDecisionEvidenceLink({
    organizationId: input.organizationId,
    contractId: decision.contract_id,
    decisionId: decision.id,
    createdByUserId: input.actorUserId ?? null,
    values: {
      evidence_type: input.evidenceType,
      evidence_id: input.evidenceId ?? null,
      evidence_label: input.evidenceLabel.slice(0, 180),
      confidence: input.confidence ?? null,
      risk_level: input.riskLevel ?? null,
      metadata: safeMetadata(input.metadata ?? {})
    }
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Commercial decision evidence was not attached.");
  await auditDecision({
    organizationId: input.organizationId,
    contractId: decision.contract_id,
    actorUserId: input.actorUserId ?? null,
    eventType: "commercial_decision.evidence_attached",
    decision,
    metadata: { evidenceLinkId: result.data.id, evidenceType: input.evidenceType }
  });
  return result.data;
}

export async function listCommercialDecisions(input: {
  organizationId: string;
  status?: string;
  limit?: number;
}) {
  const result = await listAdminCommercialDecisions(input);
  if (result.error) throw result.error;
  return result.data ?? [];
}

export async function getCommercialDecisionWorkbench(input: {
  organizationId: string;
  contractId: string;
}) {
  const decision = await getAdminActiveCommercialDecisionByContractId(input);
  if (decision.error) throw decision.error;
  const activeDecision =
    decision.data ??
    (await createCommercialDecisionForContract({
      organizationId: input.organizationId,
      contractId: input.contractId
    }));
  const [evidence, approvals, snapshots] = await Promise.all([
    listAdminCommercialDecisionEvidenceLinks({
      organizationId: input.organizationId,
      decisionId: activeDecision.id
    }),
    listAdminCommercialDecisionApprovalSteps({
      organizationId: input.organizationId,
      decisionId: activeDecision.id
    }),
    listAdminCommercialDecisionSnapshots({
      organizationId: input.organizationId,
      decisionId: activeDecision.id,
      limit: 5
    })
  ]);
  if (evidence.error) throw evidence.error;
  if (approvals.error) throw approvals.error;
  if (snapshots.error) throw snapshots.error;
  return {
    decision: activeDecision,
    evidenceLinks: evidence.data ?? [],
    approvalSteps: approvals.data ?? [],
    snapshots: snapshots.data ?? []
  };
}

async function transitionDecision(input: {
  organizationId: string;
  decision: CommercialDecision;
  actorUserId?: string | null;
  eventType: string;
  values: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  const result = await updateAdminCommercialDecisionStatus({
    organizationId: input.organizationId,
    decisionId: input.decision.id,
    values: input.values
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Commercial decision transition failed.");
  await auditDecision({
    organizationId: input.organizationId,
    contractId: input.decision.contract_id,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    previousStatus: input.decision.decision_status,
    decision: result.data,
    metadata: input.metadata
  });
  return result.data;
}

async function markPendingApprovalStep(input: {
  organizationId: string;
  decision: CommercialDecision;
  actorUserId: string;
  status: "approved" | "rejected";
  reviewerNote?: string | null;
}) {
  const steps = await listAdminCommercialDecisionApprovalSteps({
    organizationId: input.organizationId,
    decisionId: input.decision.id
  });
  if (steps.error) throw steps.error;
  const pendingStep = (steps.data ?? []).find((step) => step.status === "pending");
  if (!pendingStep) return null;
  const updated = await updateAdminCommercialDecisionApprovalStep({
    organizationId: input.organizationId,
    approvalStepId: pendingStep.id,
    values: {
      status: input.status,
      acted_by_user_id: input.actorUserId,
      acted_at: new Date().toISOString(),
      reviewer_note: sanitizeReviewerNote(input.reviewerNote)
    }
  });
  if (updated.error) throw updated.error;
  return updated.data;
}

async function getRequiredDecision(organizationId: string, decisionId: string) {
  const result = await getAdminCommercialDecisionById({ organizationId, decisionId });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Commercial decision was not found for the active organization.");
  return result.data;
}

function assertEditable(decision: CommercialDecision) {
  if (["finalized", "archived"].includes(decision.decision_status)) {
    throw new CommercialDecisionTransitionError("Finalized or archived commercial decisions cannot be edited.");
  }
}

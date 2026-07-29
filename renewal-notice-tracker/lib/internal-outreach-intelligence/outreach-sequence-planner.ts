import { isSuppressionActive } from "@/lib/internal-outreach-intelligence/outreach-safety";
import type {
  InternalOutreachDraft,
  InternalOutreachOpportunity,
  InternalOutreachSuppression,
  OutreachPriorityScore,
  OutreachSequencePlan,
  OutreachSequenceStep,
  OutreachSequenceStepType
} from "@/lib/internal-outreach-intelligence/outreach-types";

function addStep(
  steps: OutreachSequenceStep[],
  opportunity: InternalOutreachOpportunity,
  type: OutreachSequenceStepType,
  purpose: string,
  options: {
    approvalRequired?: boolean;
    copyAllowed?: boolean;
    prerequisites?: string[];
    blockerCodes?: string[];
  } = {}
) {
  steps.push({
    stepOrder: steps.length + 1,
    stepType: type,
    audience: opportunity.audience,
    channel: type === "crm_note_prepare" ? "crm_note" : opportunity.recommended_channel,
    purpose,
    dueDate: opportunity.due_date ?? opportunity.renewal_deadline,
    prerequisites: options.prerequisites ?? [],
    approvalRequired: options.approvalRequired ?? false,
    copyAllowed: options.copyAllowed ?? false,
    blockerCodes: options.blockerCodes ?? []
  });
}

export function planOutreachSequence(input: {
  opportunity: InternalOutreachOpportunity;
  draft?: InternalOutreachDraft | null;
  priority?: OutreachPriorityScore | null;
  suppressions?: InternalOutreachSuppression[];
}): OutreachSequencePlan {
  const { opportunity } = input;
  const activeSuppression = (input.suppressions ?? []).find(isSuppressionActive);
  const blockerCodes = new Set<string>([
    ...opportunity.blocker_codes,
    ...(input.priority?.priorityBand === "blocked" ? ["priority_blocked"] : [])
  ]);
  if (activeSuppression) blockerCodes.add(activeSuppression.reason_code || "active_suppression");
  if (opportunity.safety_status === "blocked") blockerCodes.add("safety_blocked");

  const steps: OutreachSequenceStep[] = [];
  addStep(steps, opportunity, "internal_owner_note", "Confirm the internal owner and commercial objective.", {
    blockerCodes: opportunity.owner_user_id ? [] : ["internal_owner_unassigned"]
  });
  if (["price_increase", "savings_opportunity", "finance_review"].includes(opportunity.opportunity_type)) {
    addStep(steps, opportunity, "finance_review_note", "Review financial impact and approve the commercial position.");
  }
  if (["price_increase", "vendor_consolidation", "procurement_review", "negotiation_follow_up"].includes(opportunity.opportunity_type)) {
    addStep(steps, opportunity, "procurement_review_note", "Review procurement leverage and vendor-management posture.");
  }
  if (opportunity.opportunity_type === "legal_review" || opportunity.audience === "legal") {
    addStep(steps, opportunity, "legal_review_note", "Confirm the legal-safe path before any vendor-facing copy is prepared.", {
      approvalRequired: true
    });
  }
  if (opportunity.priority === "critical" || input.priority?.priorityBand === "critical") {
    addStep(steps, opportunity, "executive_escalation_note", "Escalate the renewal risk and requested decision to the executive sponsor.");
  }

  const hasBlockingCondition = blockerCodes.size > 0;
  const copyAllowed = Boolean(input.draft?.status === "approved_for_copy" && input.draft.copy_allowed && !hasBlockingCondition);
  addStep(steps, opportunity, "vendor_draft_prepare", "Prepare approved internal copy for manual use only after suppression, evidence, and approval checks pass.", {
    approvalRequired: true,
    copyAllowed,
    prerequisites: ["evidence_reviewed", "suppression_checked", "approval_completed"],
    blockerCodes: hasBlockingCondition ? Array.from(blockerCodes) : []
  });
  addStep(steps, opportunity, "crm_note_prepare", "Prepare a support-safe CRM note for manual copy into a configured system.", {
    copyAllowed: !hasBlockingCondition
  });
  addStep(steps, opportunity, "follow_up_reminder", "Create an internal follow-up reminder if the commercial decision is not completed.", {
    prerequisites: ["internal_owner_confirmed"]
  });

  return { steps, blockerCodes: Array.from(blockerCodes) };
}

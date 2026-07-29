import { sanitizeOutreachText } from "@/lib/internal-outreach-intelligence/outreach-safety";
import type {
  InternalOutreachEvidenceLink,
  InternalOutreachOpportunity,
  OutreachCrmNote,
  OutreachPriorityScore
} from "@/lib/internal-outreach-intelligence/outreach-types";

function triggerForOpportunity(opportunity: InternalOutreachOpportunity) {
  if (opportunity.opportunity_type === "price_increase") return "Renewal quote price increase";
  if (opportunity.opportunity_type === "savings_opportunity") return "Evidence-backed savings opportunity";
  if (opportunity.opportunity_type === "vendor_consolidation") return "Vendor consolidation review";
  if (opportunity.opportunity_type === "negotiation_follow_up") return "Negotiation follow-up";
  if (opportunity.opportunity_type === "legal_review") return "Legal-safe renewal review";
  return opportunity.opportunity_type.replaceAll("_", " ");
}

export function buildCrmNoteForOpportunity(input: {
  opportunity: InternalOutreachOpportunity;
  priority?: OutreachPriorityScore | null;
  evidenceLinks?: InternalOutreachEvidenceLink[];
}): OutreachCrmNote {
  const { opportunity } = input;
  const evidenceReferences = (input.evidenceLinks ?? [])
    .slice(0, 6)
    .map((link) => sanitizeOutreachText(`${link.evidence_type}:${link.evidence_label}`, 180));
  const priorityBand = input.priority?.priorityBand ?? opportunity.priority;
  const blocked = priorityBand === "blocked" || opportunity.safety_status === "blocked";
  const archived = opportunity.status === "archived" || opportunity.status === "dismissed";
  const bodyPreview = [
    `Internal CRM note only: ${triggerForOpportunity(opportunity)}.`,
    `Reason: ${sanitizeOutreachText(opportunity.reason_summary, 360)}`,
    `Priority: ${priorityBand}. Evidence confidence: ${Math.round(opportunity.evidence_confidence * 100)}%.`,
    `Recommended next step: ${sanitizeOutreachText(input.priority?.nextBestAction ?? "Review internal outreach evidence before manual copy.", 240)}`,
    evidenceReferences.length ? `Evidence references: ${evidenceReferences.join("; ")}` : "Evidence references: confirm evidence before use."
  ].join("\n");

  return {
    crmNoteTitle: sanitizeOutreachText(`Internal renewal outreach: ${triggerForOpportunity(opportunity)}`, 160),
    crmNoteBodyPreview: sanitizeOutreachText(bodyPreview, 1200),
    relatedContractId: opportunity.contract_id,
    relatedDecisionId: opportunity.commercial_decision_id,
    relatedOpportunityId: opportunity.id,
    commercialTrigger: triggerForOpportunity(opportunity),
    recommendedNextStep: sanitizeOutreachText(input.priority?.nextBestAction ?? "Review internal outreach evidence.", 240),
    evidenceReferences,
    ownerUserId: opportunity.owner_user_id,
    dueDate: opportunity.due_date ?? opportunity.renewal_deadline,
    priorityBand,
    syncStatus: archived ? "archived" : blocked ? "blocked" : "ready_for_manual_copy"
  };
}

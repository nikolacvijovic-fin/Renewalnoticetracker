import type {
  InternalOutreachOpportunity,
  OutreachChannel,
  OutreachDraftGenerationResult,
  OutreachTone
} from "@/lib/internal-outreach-intelligence/outreach-types";
import {
  evaluateOutreachSafety,
  sanitizeOutreachText
} from "@/lib/internal-outreach-intelligence/outreach-safety";

function channelLabel(channel: OutreachChannel) {
  if (channel === "slack_draft") return "Slack draft";
  if (channel === "call_script") return "Call script";
  if (channel === "meeting_agenda") return "Meeting agenda";
  if (channel === "crm_note") return "CRM note";
  if (channel === "internal_email") return "Internal email";
  return "Internal note";
}

function toneOpening(tone: OutreachTone) {
  if (tone === "executive") return "Executive summary: a renewal risk needs a decision owner and commercial response.";
  if (tone === "firm") return "This renewal requires action before we accept the current commercial position.";
  if (tone === "procurement") return "Procurement review is recommended based on the attached commercial evidence.";
  if (tone === "legal") return "Legal review is required before any vendor-facing copy is prepared.";
  if (tone === "customer_success") return "Customer-success follow-up is recommended to reduce renewal risk and align stakeholders.";
  if (tone === "collaborative") return "We should align internally on the next renewal action and evidence-backed ask.";
  return "Internal action is recommended based on renewal intelligence evidence.";
}

function askForOpportunity(opportunity: InternalOutreachOpportunity) {
  if (opportunity.opportunity_type === "price_increase") return "Review the price increase and confirm whether to challenge, accept, or request concessions.";
  if (opportunity.opportunity_type === "savings_opportunity") return "Review the savings evidence and confirm the owner for follow-up.";
  if (opportunity.opportunity_type === "legal_review") return "Confirm the legal-safe path before any vendor-facing communication.";
  if (opportunity.opportunity_type === "stakeholder_review") return "Assign or confirm the internal owner for this contract.";
  if (opportunity.opportunity_type === "negotiation_follow_up") return "Review the approved negotiation brief and decide the next internal step.";
  if (opportunity.opportunity_type === "vendor_consolidation") return "Review whether this vendor/category should be consolidated.";
  return "Review the renewal trigger and decide the next internal action.";
}

function purposeForOpportunity(opportunity: InternalOutreachOpportunity) {
  if (opportunity.opportunity_type === "price_increase") return "Challenge or negotiate a renewal price increase using approved evidence.";
  if (opportunity.opportunity_type === "savings_opportunity") return "Capture a savings opportunity before the renewal loop closes.";
  if (opportunity.opportunity_type === "vendor_consolidation") return "Confirm whether consolidation should be pursued before renewal.";
  if (opportunity.opportunity_type === "negotiation_follow_up") return "Move an approved negotiation position into the next internal step.";
  if (opportunity.opportunity_type === "legal_review") return "Route legal-sensitive renewal language for internal review.";
  if (opportunity.opportunity_type === "stakeholder_review") return "Resolve missing stakeholder ownership before the renewal decision.";
  return "Protect the renewal decision loop with evidence-backed internal follow-up.";
}

function deadlineLine(opportunity: InternalOutreachOpportunity) {
  if (opportunity.due_date) return `Target action date: ${opportunity.due_date}.`;
  if (opportunity.renewal_deadline) return `Renewal deadline: ${opportunity.renewal_deadline}.`;
  return "Target action date: confirm from contract metadata before use.";
}

function impactLine(opportunity: InternalOutreachOpportunity) {
  const impact = opportunity.expected_commercial_impact;
  if (impact && typeof impact === "object" && !Array.isArray(impact)) {
    const record = impact as Record<string, unknown>;
    const amount =
      typeof record.estimatedSavingsAmount === "number"
        ? record.estimatedSavingsAmount
        : typeof record.priceDeltaAmount === "number"
          ? record.priceDeltaAmount
          : typeof record.contractValueAmount === "number"
            ? record.contractValueAmount
            : null;
    const currency = typeof record.currency === "string" ? record.currency : null;
    if (amount !== null) return `Commercial impact: ${amount}${currency ? ` ${currency}` : ""} based on linked evidence.`;
  }
  return "Commercial impact: confirm amount from linked evidence before use.";
}

export function buildInternalOutreachDraft(input: {
  opportunity: InternalOutreachOpportunity;
  tone?: OutreachTone;
  channel?: OutreachChannel;
}): OutreachDraftGenerationResult {
  const tone = input.tone ?? "concise";
  const channel = input.channel ?? input.opportunity.recommended_channel;
  const title = `Internal draft: ${input.opportunity.opportunity_type.replaceAll("_", " ")}`;
  const purpose = purposeForOpportunity(input.opportunity);
  const keyPoints = [
    `Trigger: ${sanitizeOutreachText(input.opportunity.reason_summary, 300)}`,
    `Purpose: ${purpose}`,
    `Audience: ${input.opportunity.audience.replaceAll("_", " ")}`,
    `Priority: ${input.opportunity.priority}`,
    `Evidence confidence: ${Math.round(input.opportunity.evidence_confidence * 100)}%`,
    deadlineLine(input.opportunity),
    impactLine(input.opportunity)
  ];
  const evidenceReferences = [
    input.opportunity.commercial_decision_id ? `commercial_decision:${input.opportunity.commercial_decision_id}` : null,
    input.opportunity.negotiation_brief_id ? `negotiation_brief:${input.opportunity.negotiation_brief_id}` : null,
    input.opportunity.contract_id ? `contract:${input.opportunity.contract_id}` : null
  ].filter((value): value is string => Boolean(value));
  const ask = askForOpportunity(input.opportunity);
  const nextStep =
    input.opportunity.safety_status === "blocked"
      ? "Resolve safety blockers before requesting approval."
      : "Route this internal draft for approval before manual copy.";
  const bodyPreview = [
    "[INTERNAL DRAFT ONLY - NO AUTOMATIC SENDING]",
    `${channelLabel(channel)} tone: ${tone}.`,
    toneOpening(tone),
    `Purpose: ${purpose}`,
    `Why now: ${sanitizeOutreachText(input.opportunity.reason_summary)}`,
    deadlineLine(input.opportunity),
    impactLine(input.opportunity),
    `Recommended ask: ${ask}`,
    `Evidence: ${evidenceReferences.length ? evidenceReferences.join(", ") : "Evidence placeholder - confirm before use."}`,
    `Next step: ${nextStep}`,
    "This draft is for internal use and manual copy only after approval. Do not use it for cold external outreach."
  ].join("\n\n");
  const safety = evaluateOutreachSafety({
    audience: input.opportunity.audience,
    draftText: bodyPreview,
    hasEvidenceForSavingsClaim: input.opportunity.opportunity_type === "savings_opportunity" || input.opportunity.evidence_confidence > 0
  });

  return {
    title,
    audience: input.opportunity.audience,
    channel,
    tone,
    subjectOrHeading: channel === "internal_email" ? `Internal action needed: ${input.opportunity.opportunity_type.replaceAll("_", " ")}` : title,
    bodyPreview: sanitizeOutreachText(bodyPreview, 4000),
    keyPoints: keyPoints.map((point) => sanitizeOutreachText(point, 240)),
    evidenceReferences,
    ask: sanitizeOutreachText(ask, 1000),
    nextStep: sanitizeOutreachText(nextStep, 1000),
    internalReviewerNote: "Draft-only internal outreach. Verify evidence, audience, suppression, and approval status before manual copy.",
    safetyStatus: safety.safetyStatus === "safe" ? input.opportunity.safety_status : safety.safetyStatus,
    safetyReasons: Array.from(new Set([...input.opportunity.safety_reasons, ...safety.safetyReasons])),
    copyAllowed: false
  };
}

import type {
  InternalOutreachOpportunity,
  OutreachChannel,
  OutreachDraftGenerationResult,
  OutreachDraftQualityScore,
  OutreachDraftVariant,
  OutreachDraftVariantType,
  OutreachDraftWorkbenchInput,
  OutreachLowConfidenceSignal,
  OutreachTone,
  OutreachVerifiedEvidence
} from "@/lib/internal-outreach-intelligence/outreach-types";
import {
  evaluateOutreachCopyApproval,
  evaluateOutreachSafety,
  sanitizeOutreachText
} from "@/lib/internal-outreach-intelligence/outreach-safety";

const DEFAULT_PRODUCT_OFFER = {
  name: "NoticeControl Renewal Defense",
  valueProposition:
    "helps finance, procurement, and contract owners see renewal risk, notice deadlines, and evidence-backed next actions before auto-renewal pressure takes over.",
  proofPoints: [
    "CFO Opt-Out Clock for deadline urgency",
    "trusted reminder gate before workflow action",
    "evidence-backed renewal decision loop"
  ]
};

function channelLabel(channel: OutreachChannel | "linkedin_note") {
  if (channel === "linkedin_note") return "LinkedIn-style note";
  if (channel === "slack_draft") return "Slack draft";
  if (channel === "call_script") return "Call script";
  if (channel === "meeting_agenda") return "Meeting agenda";
  if (channel === "crm_note") return "CRM note";
  if (channel === "internal_email") return "Internal email";
  return "Internal note";
}

function audienceBuyerRole(audience: InternalOutreachOpportunity["audience"]) {
  if (audience === "finance") return "finance leader";
  if (audience === "procurement") return "procurement owner";
  if (audience === "legal") return "legal reviewer";
  if (audience === "executive_sponsor") return "executive sponsor";
  if (audience === "customer_success") return "customer success owner";
  if (audience === "account_manager") return "account manager";
  if (audience === "vendor_contact_placeholder") return "external vendor contact placeholder";
  if (audience === "stakeholder_group") return "stakeholder group";
  return "contract owner";
}

function painPointsForOpportunity(opportunity: InternalOutreachOpportunity) {
  const base = ["renewal deadlines can be missed", "commercial evidence can be scattered"];
  if (opportunity.opportunity_type === "price_increase") return ["price increases need evidence-backed review", ...base];
  if (opportunity.opportunity_type === "savings_opportunity") return ["savings opportunities need timely owner action", ...base];
  if (opportunity.opportunity_type === "vendor_consolidation") return ["duplicate vendor spend can hide inside renewal cycles", ...base];
  if (opportunity.opportunity_type === "legal_review") return ["legal-sensitive renewal language needs controlled review", ...base];
  if (opportunity.opportunity_type === "stakeholder_review") return ["missing ownership blocks renewal accountability", ...base];
  return base;
}

function safeImpactReason(opportunity: InternalOutreachOpportunity) {
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
    if (amount !== null) {
      return `The linked evidence references ${amount}${currency ? ` ${currency}` : ""} of possible commercial exposure; a reviewer must verify the figure before external use.`;
    }
  }
  return "The commercial impact should be confirmed from linked evidence before external use.";
}

function askForOpportunity(opportunity: InternalOutreachOpportunity) {
  if (opportunity.opportunity_type === "price_increase") return "Would it be useful to pressure-test the renewal before the opt-out window closes?";
  if (opportunity.opportunity_type === "savings_opportunity") return "Would a quick renewal-defense review help confirm whether there is recoverable spend?";
  if (opportunity.opportunity_type === "vendor_consolidation") return "Would it help to review renewal overlap before the next vendor decision?";
  if (opportunity.opportunity_type === "legal_review") return "Would it help to review the renewal terms before anyone relies on them operationally?";
  if (opportunity.opportunity_type === "stakeholder_review") return "Would a short renewal-control review help clarify ownership and next steps?";
  return "Would it be useful to review the renewal risk before the next commitment date?";
}

function verifiedEvidenceFromOpportunity(opportunity: InternalOutreachOpportunity): OutreachVerifiedEvidence[] {
  const evidence: Array<OutreachVerifiedEvidence | null> = [
    opportunity.commercial_decision_id
      ? {
          id: `commercial_decision:${opportunity.commercial_decision_id}`,
          label: "Commercial decision evidence",
          summary: sanitizeOutreachText(opportunity.reason_summary, 220),
          sourceType: "imported_source" as const,
          importedSourceLabel: `NoticeControl commercial decision ${opportunity.commercial_decision_id}`,
          confidence: opportunity.evidence_confidence,
          supportsPersonalization: true
        }
      : null,
    opportunity.negotiation_brief_id
      ? {
          id: `negotiation_brief:${opportunity.negotiation_brief_id}`,
          label: "Approved negotiation brief",
          summary: "Approved negotiation brief is linked to this renewal opportunity.",
          sourceType: "imported_source" as const,
          importedSourceLabel: `NoticeControl negotiation brief ${opportunity.negotiation_brief_id}`,
          confidence: opportunity.evidence_confidence,
          supportsPersonalization: true
        }
      : null,
    opportunity.contract_id
      ? {
          id: `contract:${opportunity.contract_id}`,
          label: "Scoped contract record",
          summary: "A scoped contract record is linked to this renewal opportunity.",
          sourceType: "system_record" as const,
          confidence: Math.max(0.5, opportunity.evidence_confidence - 0.1)
        }
      : null
  ];
  return evidence.filter((value): value is OutreachVerifiedEvidence => Boolean(value));
}

function lowConfidenceSignalsFromOpportunity(opportunity: InternalOutreachOpportunity): OutreachLowConfidenceSignal[] {
  const signals: OutreachLowConfidenceSignal[] = [];
  if (opportunity.warning_codes.length) {
    signals.push({
      label: "Warning codes present",
      rationale: opportunity.warning_codes.join(", "),
      confidence: 0.45
    });
  }
  if (opportunity.evidence_confidence < 0.7) {
    signals.push({
      label: "Evidence confidence below review threshold",
      rationale: "Use as reviewer context only until stronger evidence is attached.",
      confidence: opportunity.evidence_confidence
    });
  }
  return signals;
}

export function buildOutreachDraftWorkbenchInput(input: {
  opportunity: InternalOutreachOpportunity;
  channel?: OutreachChannel;
  suppressionsActive?: boolean;
  reviewerApproved?: boolean;
  evidence?: OutreachVerifiedEvidence[];
  lowConfidenceSignals?: OutreachLowConfidenceSignal[];
  unavailableFacts?: string[];
}): OutreachDraftWorkbenchInput {
  const evidence = input.evidence ?? verifiedEvidenceFromOpportunity(input.opportunity);
  return {
    productOffer: DEFAULT_PRODUCT_OFFER,
    targetIcp: {
      segment: "organizations managing recurring vendor renewals",
      buyerRole: audienceBuyerRole(input.opportunity.audience),
      painPoints: painPointsForOpportunity(input.opportunity)
    },
    leadCompanyAttributes: {
      renewalContext: sanitizeOutreachText(input.opportunity.reason_summary, 240)
    },
    verifiedEvidence: evidence.map((item) => ({
      ...item,
      summary: sanitizeOutreachText(item.summary, 260),
      label: sanitizeOutreachText(item.label, 120)
    })),
    lowConfidenceSignals: (input.lowConfidenceSignals ?? lowConfidenceSignalsFromOpportunity(input.opportunity)).map((item) => ({
      label: sanitizeOutreachText(item.label, 120),
      rationale: sanitizeOutreachText(item.rationale, 220),
      confidence: item.confidence
    })),
    unavailableFacts: input.unavailableFacts ?? [
      "prior relationship or conversation history",
      "guaranteed savings or ROI",
      "recipient intent",
      "private personal contact details"
    ],
    compliance: {
      suppressionActive: input.suppressionsActive ?? false,
      suppressionReasons: input.opportunity.safety_reasons,
      reviewerApproved: input.reviewerApproved ?? false
    },
    intendedAudience: input.opportunity.audience,
    intendedChannel: input.channel ?? input.opportunity.recommended_channel
  };
}

function approvedPersonalizationEvidence(model: OutreachDraftWorkbenchInput) {
  return model.verifiedEvidence.filter(
    (item) => item.supportsPersonalization && (item.sourceUrl || item.importedSourceLabel)
  );
}

function openingLine(model: OutreachDraftWorkbenchInput) {
  const evidence = approvedPersonalizationEvidence(model)[0];
  if (!evidence) {
    return "I am reaching out with a cautious renewal-control hypothesis, not a claim about your current process.";
  }
  return `I noticed a renewal-control signal from ${evidence.importedSourceLabel ?? evidence.sourceUrl}: ${evidence.summary}`;
}

function problemHypothesis(model: OutreachDraftWorkbenchInput) {
  const pain = model.targetIcp.painPoints[0] ?? "renewal risk can become visible too late";
  return `A reasonable hypothesis is that ${pain}; please treat this as a review prompt, not a confirmed fact about your team.`;
}

function reasonToCare(model: OutreachDraftWorkbenchInput, opportunity: InternalOutreachOpportunity) {
  if (opportunity.due_date) return `The relevant action date is ${opportunity.due_date}, so timing may matter.`;
  if (opportunity.renewal_deadline) return `The renewal deadline is ${opportunity.renewal_deadline}, so timing may matter.`;
  return model.verifiedEvidence.length
    ? "There is enough linked evidence to justify a quick review before the renewal loop closes."
    : "There is not enough verified evidence for strong personalization yet; keep the note generic.";
}

function claimsRequiringApproval(opportunity: InternalOutreachOpportunity, model: OutreachDraftWorkbenchInput) {
  return [
    "Any savings, ROI, or discount statement",
    "Any statement that the recipient has a specific vendor problem",
    "Any mention of prior conversations or intent",
    opportunity.opportunity_type === "savings_opportunity" ? "Savings opportunity amount" : null,
    model.lowConfidenceSignals.length ? "Low-confidence signals listed in reviewer context" : null
  ].filter((value): value is string => Boolean(value));
}

function scoreVariant(input: {
  model: OutreachDraftWorkbenchInput;
  evidenceReferences: string[];
  body: string;
  claims: string[];
  safetyReasons: string[];
}): OutreachDraftQualityScore {
  const personalizationStrength = input.model.verifiedEvidence.length
    ? approvedPersonalizationEvidence(input.model).length
      ? 82
      : 45
    : 20;
  const evidenceSupport = Math.min(95, Math.round(input.model.verifiedEvidence.length * 24 + 35));
  const claimRisk = Math.min(100, input.claims.length * 12 + input.safetyReasons.length * 20);
  const clarity = input.body.length <= 1200 ? 88 : 72;
  const ctaQuality = /\?/.test(input.body) ? 88 : 55;
  const complianceRisk = input.model.compliance.suppressionActive ? 100 : input.safetyReasons.length * 24;
  const overallApprovalReadiness = Math.max(
    0,
    Math.min(100, Math.round((personalizationStrength + evidenceSupport + clarity + ctaQuality + (100 - claimRisk) + (100 - complianceRisk)) / 6))
  );
  return {
    personalizationStrength,
    evidenceSupport,
    claimRisk,
    clarity,
    ctaQuality,
    complianceRisk,
    overallApprovalReadiness
  };
}

function variantBody(parts: {
  heading: string;
  opening: string;
  problem: string;
  value: string;
  reason: string;
  cta: string;
}) {
  return sanitizeOutreachText(
    [
      parts.opening,
      parts.problem,
      parts.value,
      parts.reason,
      parts.cta
    ].join("\n\n"),
    900
  );
}

function buildVariant(input: {
  type: OutreachDraftVariantType;
  subjectOrHeading: string;
  cta: string;
  model: OutreachDraftWorkbenchInput;
  opportunity: InternalOutreachOpportunity;
  safetyReasons: string[];
}): OutreachDraftVariant {
  const opening = openingLine(input.model);
  const problem = problemHypothesis(input.model);
  const value = `${input.model.productOffer.name} ${input.model.productOffer.valueProposition}`;
  const reason = reasonToCare(input.model, input.opportunity);
  const bodyPreview = variantBody({
    heading: input.subjectOrHeading,
    opening,
    problem,
    value,
    reason,
    cta: input.cta
  });
  const claims = claimsRequiringApproval(input.opportunity, input.model);
  const evidenceReferences = input.model.verifiedEvidence.map((item) => item.id);
  return {
    variantType: input.type,
    subjectOrHeading: sanitizeOutreachText(input.subjectOrHeading, 160),
    openingLine: sanitizeOutreachText(opening, 260),
    problemHypothesis: sanitizeOutreachText(problem, 260),
    valueProposition: sanitizeOutreachText(value, 320),
    reasonToCare: sanitizeOutreachText(reason, 260),
    lowFrictionCta: sanitizeOutreachText(input.cta, 220),
    bodyPreview,
    evidenceReferencesUsed: evidenceReferences,
    claimsRequiringReviewerApproval: claims,
    qualityScore: scoreVariant({
      model: input.model,
      evidenceReferences,
      body: bodyPreview,
      claims,
      safetyReasons: input.safetyReasons
    })
  };
}

function buildVariants(input: {
  model: OutreachDraftWorkbenchInput;
  opportunity: InternalOutreachOpportunity;
  safetyReasons: string[];
}): OutreachDraftVariant[] {
  const ask = askForOpportunity(input.opportunity);
  return [
    buildVariant({
      type: "concise_email",
      subjectOrHeading: "Quick renewal-risk check",
      cta: `${ask} If not, I can leave this with your renewal owner.`,
      ...input
    }),
    buildVariant({
      type: "consultative_email",
      subjectOrHeading: "Possible renewal-control gap to review",
      cta: `${ask} A short review may be enough to decide whether this is relevant.`,
      ...input
    }),
    buildVariant({
      type: "founder_led_email",
      subjectOrHeading: "Founder note on renewal control",
      cta: `${ask} I am happy to keep this lightweight and evidence-led.`,
      ...input
    }),
    buildVariant({
      type: "linkedin_note",
      subjectOrHeading: "Renewal-control note",
      cta: "Open to a quick exchange if renewal deadlines are on your radar?",
      ...input
    }),
    buildVariant({
      type: "internal_reviewer_summary",
      subjectOrHeading: "Reviewer summary before manual copy",
      cta: "Reviewer should verify evidence, suppression, claims, and audience before approving copy.",
      ...input
    })
  ];
}

function serializeVariant(variant: OutreachDraftVariant) {
  return [
    `### ${variant.variantType.replaceAll("_", " ")}: ${variant.subjectOrHeading}`,
    variant.bodyPreview,
    `Evidence used: ${variant.evidenceReferencesUsed.length ? variant.evidenceReferencesUsed.join(", ") : "none"}`,
    `Reviewer approval required for: ${variant.claimsRequiringReviewerApproval.join("; ")}`,
    `Quality: personalization ${variant.qualityScore.personalizationStrength}/100, evidence ${variant.qualityScore.evidenceSupport}/100, claim risk ${variant.qualityScore.claimRisk}/100, readiness ${variant.qualityScore.overallApprovalReadiness}/100`
  ].join("\n");
}

function averageQualityScore(variants: OutreachDraftVariant[]): OutreachDraftQualityScore {
  const keys: Array<keyof OutreachDraftQualityScore> = [
    "personalizationStrength",
    "evidenceSupport",
    "claimRisk",
    "clarity",
    "ctaQuality",
    "complianceRisk",
    "overallApprovalReadiness"
  ];
  return keys.reduce((acc, key) => {
    acc[key] = Math.round(variants.reduce((sum, variant) => sum + variant.qualityScore[key], 0) / variants.length);
    return acc;
  }, {} as OutreachDraftQualityScore);
}

export function buildInternalOutreachDraft(input: {
  opportunity: InternalOutreachOpportunity;
  tone?: OutreachTone;
  channel?: OutreachChannel;
  workbenchInput?: OutreachDraftWorkbenchInput;
  suppressionsActive?: boolean;
  reviewerApproved?: boolean;
}): OutreachDraftGenerationResult {
  const tone = input.tone ?? "concise";
  const channel = input.channel ?? input.opportunity.recommended_channel;
  const workbenchInput = input.workbenchInput ?? buildOutreachDraftWorkbenchInput({
    opportunity: input.opportunity,
    channel,
    suppressionsActive: input.suppressionsActive,
    reviewerApproved: input.reviewerApproved
  });
  const evidenceReferences = workbenchInput.verifiedEvidence.map((item) => item.id);
  const hasApprovedPersonalizationSource = approvedPersonalizationEvidence(workbenchInput).length > 0;
  const usesPersonalization = workbenchInput.verifiedEvidence.some((item) => item.supportsPersonalization);
  const safety = evaluateOutreachSafety({
    audience: input.opportunity.audience,
    draftText: [
      input.opportunity.reason_summary,
      ...workbenchInput.verifiedEvidence.map((item) => item.summary),
      ...workbenchInput.lowConfidenceSignals.map((item) => item.rationale)
    ].join("\n"),
    hasEvidenceForSavingsClaim: evidenceReferences.length > 0,
    usesPersonalization,
    hasApprovedPersonalizationSource,
    suppressionCheckCompleted: !workbenchInput.compliance.suppressionActive,
    reviewerApproved: workbenchInput.compliance.reviewerApproved,
    copyRequested: false
  });
  const safetyReasons = Array.from(new Set([...input.opportunity.safety_reasons, ...safety.safetyReasons]));
  const variants = buildVariants({ model: workbenchInput, opportunity: input.opportunity, safetyReasons });
  const qualityScore = averageQualityScore(variants);
  const copyApproval = evaluateOutreachCopyApproval({
    safetyStatus: safety.safetyStatus === "safe" ? input.opportunity.safety_status : safety.safetyStatus,
    suppressionActive: workbenchInput.compliance.suppressionActive,
    reviewerApproved: workbenchInput.compliance.reviewerApproved
  });
  const bodyPreview = sanitizeOutreachText(
    [
      "[INTERNAL DRAFT WORKBENCH - NO AUTOMATIC DELIVERY]",
      `${channelLabel(channel)} tone: ${tone}. Manual copy is blocked until reviewer approval.`,
      `Product offer: ${workbenchInput.productOffer.name}`,
      `Purpose: ${askForOpportunity(input.opportunity)}`,
      `Target action date: ${input.opportunity.due_date ?? input.opportunity.renewal_deadline ?? "confirm from contract metadata before use"}.`,
      `Commercial impact: ${safeImpactReason(input.opportunity)}`,
      `Target ICP: ${workbenchInput.targetIcp.segment}; buyer role: ${workbenchInput.targetIcp.buyerRole}.`,
      `Unknown/unavailable facts not used: ${workbenchInput.unavailableFacts.join("; ")}.`,
      `Low-confidence signals for reviewer context only: ${workbenchInput.lowConfidenceSignals.length ? workbenchInput.lowConfidenceSignals.map((item) => `${item.label} (${Math.round(item.confidence * 100)}%)`).join("; ") : "none"}.`,
      ...variants.map(serializeVariant),
      `Copy approval blockers: ${copyApproval.blockers.length ? copyApproval.blockers.join(", ") : "none after reviewer approval"}.`,
      "This workbench prepares reviewable copy only. It does not send, sync, sequence, or deliver messages."
    ].join("\n\n"),
    4000
  );

  return {
    title: `Outreach workbench: ${input.opportunity.opportunity_type.replaceAll("_", " ")}`,
    audience: input.opportunity.audience,
    channel,
    tone,
    subjectOrHeading: variants[0]?.subjectOrHeading ?? `Internal action needed: ${input.opportunity.opportunity_type.replaceAll("_", " ")}`,
    bodyPreview,
    keyPoints: [
      `Offer: ${workbenchInput.productOffer.name}`,
      `Audience: ${input.opportunity.audience.replaceAll("_", " ")}`,
      `Evidence references: ${evidenceReferences.length ? evidenceReferences.join(", ") : "none"}`,
      `Approval readiness: ${qualityScore.overallApprovalReadiness}/100`,
      `Claim risk: ${qualityScore.claimRisk}/100`,
      `Compliance risk: ${qualityScore.complianceRisk}/100`
    ],
    evidenceReferences,
    ask: sanitizeOutreachText(askForOpportunity(input.opportunity), 1000),
    nextStep: copyApproval.copyAllowed
      ? "Manual copy may proceed only through the approved-for-copy workflow."
      : "Resolve blockers, verify evidence, and obtain reviewer approval before manual copy.",
    internalReviewerNote: sanitizeOutreachText(
      [
        "Review all variants before copy approval.",
        "Opening lines must be backed by source URL or imported-source evidence.",
        "Do not add relationship, ROI, savings, or intent claims unless separately verified.",
        `Claims needing approval: ${claimsRequiringApproval(input.opportunity, workbenchInput).join("; ")}`
      ].join(" "),
      1000
    ),
    safetyStatus: safety.safetyStatus === "safe" ? input.opportunity.safety_status : safety.safetyStatus,
    safetyReasons,
    copyAllowed: false,
    workbenchInput,
    variants,
    qualityScore
  };
}

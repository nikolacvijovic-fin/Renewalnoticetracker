import {
  evaluateOutreachSafety,
  hashContactIdentifier,
  sanitizeOutreachMetadata,
  sanitizeOutreachText
} from "@/lib/internal-outreach-intelligence/outreach-safety";
import type { OutreachDraftQualityScore } from "@/lib/internal-outreach-intelligence/outreach-types";
import type {
  ColdOutreachApprovalEvaluation,
  ColdOutreachDraftVariant,
  ColdOutreachDraftWorkbenchResult,
  ColdOutreachEvidenceReference,
  ColdOutreachLeadCompanyInput,
  ColdOutreachLeadCompanyModel,
  ColdOutreachOfferIcpInput,
  ColdOutreachOfferIcpModel,
  ColdOutreachSuppressionStatus,
  ColdOutreachVariantType
} from "@/lib/internal-outreach-intelligence/cold-outreach-types";

export const NOTICECONTROL_COLD_OUTREACH_OFFER: ColdOutreachOfferIcpModel = {
  offerName: "NoticeControl CFO Opt-Out Clock",
  targetCustomer: "finance and procurement leaders responsible for recurring vendor renewals",
  primaryPain: "renewal deadlines and opt-out windows can become visible too late",
  valueProp:
    "NoticeControl helps teams track renewal deadlines, opt-out windows, evidence, and next actions before vendor auto-renewal pressure takes over.",
  proofPoints: [
    "CFO Opt-Out Clock",
    "Renewal Defense workflow",
    "evidence-backed renewal decisions"
  ],
  disallowedClaims: [
    "guaranteed savings",
    "guaranteed ROI",
    "specific percentage savings",
    "prior conversation",
    "recipient intent"
  ],
  blockerCodes: []
};

const UNAVAILABLE_FACTS = [
  "prior relationship or conversation",
  "recipient intent",
  "guaranteed savings or ROI",
  "private personal contact details",
  "unverified vendor stack"
] as const;

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizeOptional(value: string | null | undefined, maxLength: number) {
  const sanitized = sanitizeOutreachText(value, maxLength);
  return sanitized || null;
}

function hasSource(input: { sourceUrl?: string | null; sourceLabel?: string | null }) {
  return Boolean(normalizeOptional(input.sourceUrl, 500) || normalizeOptional(input.sourceLabel, 160));
}

export function normalizeColdOutreachLeadCompany(input: ColdOutreachLeadCompanyInput): ColdOutreachLeadCompanyModel {
  const evidenceConfidence = clampConfidence(input.evidenceConfidence);
  const blockerCodes = [
    !input.organizationId ? "organization_scope_required" : null,
    !normalizeOptional(input.companyName, 160) ? "company_name_required" : null,
    !hasSource(input) ? "source_evidence_required" : null,
    input.suppressionStatus === "suppressed" ? "lead_suppressed" : null,
    input.suppressionStatus === "opted_out" ? "contact_opted_out" : null,
    input.suppressionStatus === "complained" ? "complaint_suppression_required" : null
  ].filter((value): value is string => Boolean(value));
  const warningCodes = [
    !input.website ? "website_missing" : null,
    !input.industry ? "industry_unknown" : null,
    !input.roleTitle ? "role_title_missing" : null,
    !input.painSignal ? "pain_signal_missing" : null,
    evidenceConfidence < 0.7 ? "evidence_confidence_below_review_threshold" : null
  ].filter((value): value is string => Boolean(value));

  return {
    organizationId: input.organizationId,
    companyName: sanitizeOutreachText(input.companyName, 160),
    website: normalizeOptional(input.website, 500),
    websiteHash: input.website ? hashContactIdentifier(input.website) : null,
    industry: normalizeOptional(input.industry, 120),
    companySizeBand: input.companySizeBand ?? "unknown",
    roleTitle: normalizeOptional(input.roleTitle, 120),
    sourceLabel: normalizeOptional(input.sourceLabel, 160),
    sourceUrl: normalizeOptional(input.sourceUrl, 500),
    painSignal: normalizeOptional(input.painSignal, 240),
    evidenceConfidence,
    suppressionStatus: input.suppressionStatus ?? "unknown",
    blockerCodes,
    warningCodes
  };
}

export function normalizeColdOutreachOfferIcp(input: ColdOutreachOfferIcpInput): ColdOutreachOfferIcpModel {
  const blockerCodes = [
    !normalizeOptional(input.offerName, 160) ? "offer_name_required" : null,
    !normalizeOptional(input.targetCustomer, 240) ? "target_customer_required" : null,
    !normalizeOptional(input.primaryPain, 240) ? "primary_pain_required" : null,
    !normalizeOptional(input.valueProp, 500) ? "value_prop_required" : null
  ].filter((value): value is string => Boolean(value));

  return {
    offerName: sanitizeOutreachText(input.offerName, 160),
    targetCustomer: sanitizeOutreachText(input.targetCustomer, 240),
    primaryPain: sanitizeOutreachText(input.primaryPain, 240),
    valueProp: sanitizeOutreachText(input.valueProp, 500),
    proofPoints: input.proofPoints.map((point) => sanitizeOutreachText(point, 160)).filter(Boolean).slice(0, 6),
    disallowedClaims: input.disallowedClaims.map((claim) => sanitizeOutreachText(claim, 160)).filter(Boolean),
    blockerCodes
  };
}

export function buildColdOutreachEvidenceReferences(lead: ColdOutreachLeadCompanyModel): ColdOutreachEvidenceReference[] {
  const sourceUrl = lead.sourceUrl;
  const sourceLabel = lead.sourceLabel;
  return [
    {
      field: "company_name",
      label: lead.companyName,
      sourceUrl,
      sourceLabel,
      confidence: lead.evidenceConfidence
    },
    lead.website
      ? {
          field: "website" as const,
          label: lead.website,
          sourceUrl,
          sourceLabel,
          confidence: lead.evidenceConfidence
        }
      : null,
    lead.industry
      ? {
          field: "industry" as const,
          label: lead.industry,
          sourceUrl,
          sourceLabel,
          confidence: lead.evidenceConfidence
        }
      : null,
    lead.companySizeBand !== "unknown"
      ? {
          field: "company_size_band" as const,
          label: lead.companySizeBand,
          sourceUrl,
          sourceLabel,
          confidence: lead.evidenceConfidence
        }
      : null,
    lead.roleTitle
      ? {
          field: "role_title" as const,
          label: lead.roleTitle,
          sourceUrl,
          sourceLabel,
          confidence: lead.evidenceConfidence
        }
      : null,
    lead.painSignal
      ? {
          field: "pain_signal" as const,
          label: lead.painSignal,
          sourceUrl,
          sourceLabel,
          confidence: lead.evidenceConfidence
        }
      : null
  ].filter((value): value is ColdOutreachEvidenceReference => Boolean(value));
}

export function evaluateColdOutreachSuppressionStatus(status: ColdOutreachSuppressionStatus) {
  const blockers = [
    status === "suppressed" ? "lead_suppressed" : null,
    status === "opted_out" ? "contact_opted_out" : null,
    status === "complained" ? "complaint_suppression_required" : null
  ].filter((value): value is string => Boolean(value));
  return {
    copyAllowed: blockers.length === 0,
    blockers
  };
}

function openingLine(lead: ColdOutreachLeadCompanyModel) {
  const source = lead.sourceLabel ?? lead.sourceUrl;
  if (!source || !lead.painSignal) {
    return `I am reaching out with a cautious renewal-control note for ${lead.companyName}, not a claim about your current process.`;
  }
  return `I noticed this source-backed renewal signal from ${source}: ${lead.painSignal}`;
}

function cautiousPainLine(lead: ColdOutreachLeadCompanyModel, offer: ColdOutreachOfferIcpModel) {
  const role = lead.roleTitle ? ` for a ${lead.roleTitle}` : "";
  return `A cautious hypothesis${role} is that ${offer.primaryPain}; please treat this as a review prompt, not a confirmed fact about your team.`;
}

function claimsRequiringApproval(offer: ColdOutreachOfferIcpModel, lead: ColdOutreachLeadCompanyModel) {
  return [
    ...offer.disallowedClaims.map((claim) => `Disallowed unless separately verified: ${claim}`),
    "Any statement that the recipient has a confirmed renewal problem",
    "Any implication of prior conversation, intent, or relationship",
    lead.evidenceConfidence < 0.75 ? "Evidence below high-confidence threshold" : null
  ].filter((value): value is string => Boolean(value));
}

function scoreVariant(input: {
  lead: ColdOutreachLeadCompanyModel;
  body: string;
  claimCount: number;
  safetyReasonCount: number;
}): OutreachDraftQualityScore {
  const personalizationStrength = input.lead.painSignal && (input.lead.sourceLabel || input.lead.sourceUrl) ? 82 : 35;
  const evidenceSupport = clampScore(input.lead.evidenceConfidence * 100);
  const claimRisk = clampScore(input.claimCount * 12 + input.safetyReasonCount * 20);
  const clarity = input.body.length <= 900 ? 90 : 72;
  const ctaQuality = input.body.includes("?") ? 88 : 60;
  const complianceRisk = input.lead.suppressionStatus === "not_suppressed" || input.lead.suppressionStatus === "unknown"
    ? clampScore(input.safetyReasonCount * 24)
    : 100;
  const overallApprovalReadiness = clampScore(
    (personalizationStrength + evidenceSupport + clarity + ctaQuality + (100 - claimRisk) + (100 - complianceRisk)) / 6
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

function variantBody(input: {
  lead: ColdOutreachLeadCompanyModel;
  offer: ColdOutreachOfferIcpModel;
  cta: string;
}) {
  return sanitizeOutreachText(
    [
      openingLine(input.lead),
      cautiousPainLine(input.lead, input.offer),
      `${input.offer.offerName}: ${input.offer.valueProp}`,
      input.lead.sourceLabel || input.lead.sourceUrl
        ? "I would keep any next step evidence-led and lightweight."
        : "This should remain generic until source-backed evidence is attached.",
      input.cta
    ].join("\n\n"),
    900
  );
}

function buildVariant(input: {
  variantType: ColdOutreachVariantType;
  subjectOrHeading: string;
  cta: string;
  lead: ColdOutreachLeadCompanyModel;
  offer: ColdOutreachOfferIcpModel;
  evidenceReferences: ColdOutreachEvidenceReference[];
  safetyReasonCount: number;
}): ColdOutreachDraftVariant {
  const bodyPreview = variantBody(input);
  const claims = claimsRequiringApproval(input.offer, input.lead);
  return {
    variantType: input.variantType,
    subjectOrHeading: sanitizeOutreachText(input.subjectOrHeading, 160),
    bodyPreview,
    openingLine: sanitizeOutreachText(openingLine(input.lead), 260),
    evidenceReferencesUsed: input.evidenceReferences,
    claimsRequiringReviewerApproval: claims,
    qualityScore: scoreVariant({
      lead: input.lead,
      body: bodyPreview,
      claimCount: claims.length,
      safetyReasonCount: input.safetyReasonCount
    })
  };
}

export function evaluateColdOutreachApproval(input: {
  safetyStatus: "safe" | "needs_review" | "blocked";
  reviewerApproved: boolean;
  suppressionStatus: ColdOutreachSuppressionStatus;
  archived?: boolean;
  rejected?: boolean;
}): ColdOutreachApprovalEvaluation {
  if (input.archived) return { approvalState: "archived", copyAllowed: false, blockers: ["draft_archived"] };
  if (input.rejected) return { approvalState: "rejected", copyAllowed: false, blockers: ["draft_rejected"] };
  const suppression = evaluateColdOutreachSuppressionStatus(input.suppressionStatus);
  const blockers = [
    input.safetyStatus === "blocked" ? "safety_status_blocked" : null,
    input.safetyStatus === "needs_review" ? "safety_review_required" : null,
    ...suppression.blockers,
    !input.reviewerApproved ? "reviewer_approval_required" : null
  ].filter((value): value is string => Boolean(value));
  return {
    approvalState: blockers.length ? "needs_review" : "approved_for_copy",
    copyAllowed: blockers.length === 0,
    blockers
  };
}

export function buildColdOutreachAuditMetadata(input: {
  lead: ColdOutreachLeadCompanyModel;
  offer: ColdOutreachOfferIcpModel;
  approvalState?: string;
  metadata?: Record<string, unknown>;
}) {
  return sanitizeOutreachMetadata({
    companyName: input.lead.companyName,
    websiteHash: input.lead.websiteHash,
    industry: input.lead.industry,
    companySizeBand: input.lead.companySizeBand,
    roleTitlePresent: Boolean(input.lead.roleTitle),
    sourcePresent: Boolean(input.lead.sourceLabel || input.lead.sourceUrl),
    evidenceConfidence: input.lead.evidenceConfidence,
    suppressionStatus: input.lead.suppressionStatus,
    offerName: input.offer.offerName,
    approvalState: input.approvalState ?? null,
    metadataProvided: Boolean(input.metadata)
  });
}

export function buildFounderLedColdOutreachDraftWorkbench(input: {
  lead: ColdOutreachLeadCompanyModel;
  offer?: ColdOutreachOfferIcpModel;
  reviewerApproved?: boolean;
}): ColdOutreachDraftWorkbenchResult {
  const offer = input.offer ?? NOTICECONTROL_COLD_OUTREACH_OFFER;
  const evidenceReferences = buildColdOutreachEvidenceReferences(input.lead);
  const safety = evaluateOutreachSafety({
    audience: "vendor_contact_placeholder",
    draftText: [
      input.lead.companyName,
      input.lead.industry,
      input.lead.roleTitle,
      input.lead.painSignal,
      offer.offerName,
      offer.valueProp
    ].filter(Boolean).join("\n"),
    hasEvidenceForSavingsClaim: evidenceReferences.length > 0,
    usesPersonalization: Boolean(input.lead.painSignal),
    hasApprovedPersonalizationSource: Boolean(input.lead.painSignal && (input.lead.sourceLabel || input.lead.sourceUrl)),
    copyRequested: false
  });
  const safetyReasons = Array.from(new Set([
    ...input.lead.blockerCodes,
    ...offer.blockerCodes,
    ...safety.safetyReasons
  ]));
  const blockedReasons = [
    "source_evidence_required",
    "lead_suppressed",
    "contact_opted_out",
    "complaint_suppression_required",
    "personalization_without_approved_source",
    "unsupported_or_deceptive_claim",
    "external_send_action_detected",
    "unscoped_personal_data_detected"
  ];
  const safetyStatus = safetyReasons.some((reason) => blockedReasons.includes(reason)) ? "blocked" : safety.safetyStatus;
  const approval = evaluateColdOutreachApproval({
    safetyStatus,
    reviewerApproved: input.reviewerApproved ?? false,
    suppressionStatus: input.lead.suppressionStatus
  });
  const variantInput = {
    lead: input.lead,
    offer,
    evidenceReferences,
    safetyReasonCount: safetyReasons.length
  };
  const variants = [
    buildVariant({
      variantType: "concise_email",
      subjectOrHeading: "Quick renewal-control question",
      cta: "Worth a quick look, or should I leave this with whoever owns renewal control?",
      ...variantInput
    }),
    buildVariant({
      variantType: "founder_led_email",
      subjectOrHeading: "Founder note on renewal control",
      cta: "If this is not relevant, no worries; if it is, I can keep the first review lightweight.",
      ...variantInput
    }),
    buildVariant({
      variantType: "linkedin_note",
      subjectOrHeading: "Renewal-control note",
      cta: "Open to a quick exchange if renewal timing is on your radar?",
      ...variantInput
    }),
    buildVariant({
      variantType: "internal_reviewer_summary",
      subjectOrHeading: "Reviewer summary before manual copy",
      cta: "Reviewer should verify evidence, suppression, claims, and audience before copy approval.",
      ...variantInput
    })
  ];

  return {
    lead: input.lead,
    offer,
    variants,
    safetyStatus,
    safetyReasons,
    copyAllowed: false,
    approval,
    unavailableFacts: [...UNAVAILABLE_FACTS]
  };
}

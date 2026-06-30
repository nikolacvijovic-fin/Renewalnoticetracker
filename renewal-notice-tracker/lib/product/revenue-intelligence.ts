import { getMarketProfile, type MarketProfileId } from "@/lib/product/market-profiles";

export type RevenueFoundationStatus = "foundation_only" | "future" | "blocked";
export type ComplianceSensitivityLevel = "low" | "moderate" | "high";
export type LeadEligibilityStatus = "eligible" | "needs_review" | "blocked";
export type OutreachComplianceDecision = "allow" | "review" | "block";
export type RecipientType = "business" | "consumer" | "unknown";
export type OutreachLegalBasis =
  | "business_legitimate_interest"
  | "consent"
  | "existing_customer"
  | "unknown";
export type OutreachMode = "manual_export" | "crm_upload" | "email_send";

export type ProductOfferProfile = {
  productKey: "noticecontrol_contract_intelligence";
  label: string;
  status: RevenueFoundationStatus;
  targetCustomerTypes: readonly string[];
  buyerRoles: readonly string[];
  painPoints: readonly string[];
  valuePropositions: readonly string[];
  useCases: readonly string[];
  objections: readonly string[];
  preferredCta: string;
  toneGuidance: readonly string[];
  supportedMarkets: readonly MarketProfileId[];
  supportedLanguages: readonly string[];
  complianceSensitivity: ComplianceSensitivityLevel;
};

export type IdealCustomerProfile = {
  id: "noticecontrol_ops_procurement_midmarket";
  label: string;
  status: RevenueFoundationStatus;
  industries: readonly string[];
  companySizes: readonly string[];
  countriesOrMarkets: readonly string[];
  buyerRoles: readonly string[];
  seniority: readonly string[];
  departments: readonly string[];
  painPoints: readonly string[];
  triggerEvents: readonly string[];
  disqualifiers: readonly string[];
  requiredEvidenceFields: readonly (keyof CompanyLeadEvidence)[];
};

export type CompanyLeadEvidence = {
  companyName?: string | null;
  domain?: string | null;
  countryOrMarket?: string | null;
  industry?: string | null;
  companySize?: string | null;
  buyerRole?: string | null;
  seniority?: string | null;
  department?: string | null;
  painPoints?: readonly string[] | null;
  triggerEvents?: readonly string[] | null;
  sourceUrls?: readonly string[] | null;
  sourceText?: string | null;
};

export type IcpFitExplanation = {
  fit: "strong_fit" | "possible_fit" | "not_fit";
  score: number;
  matchedEvidence: readonly string[];
  missingEvidence: readonly string[];
  disqualifyingEvidence: readonly string[];
  explanation: string;
};

export type CompanyProfile = {
  name: string;
  domain?: string | null;
  countryOrMarket?: string | null;
  industry?: string | null;
  size?: string | null;
};

export type LeadProfile = {
  role?: string | null;
  seniority?: string | null;
  department?: string | null;
  language?: string | null;
  timeZone?: string | null;
  recipientType?: RecipientType | null;
};

export type LeadSourceEvidence = {
  sourceUrl?: string | null;
  sourceText?: string | null;
  evidenceFields?: readonly string[] | null;
};

export type LeadComplianceState = {
  legalBasis?: OutreachLegalBasis | null;
  optOutSuppressed?: boolean;
  previousContactStatus?: "none" | "contacted_recently" | "replied" | "bounced" | "complained" | null;
  campaignStatus?: "none" | "drafted" | "approved" | "exported" | "sent" | null;
};

export type FutureLeadRecord = {
  company: CompanyProfile;
  lead: LeadProfile;
  evidence: LeadSourceEvidence;
  compliance: LeadComplianceState;
};

export type LeadEligibilityDecision = {
  status: LeadEligibilityStatus;
  reasonCodes: readonly string[];
  safeExplanation: string;
};

export type OutreachComplianceInput = {
  offer: ProductOfferProfile;
  lead: FutureLeadRecord;
  marketId?: MarketProfileId | string | null;
  requestedMode?: OutreachMode | null;
};

export type OutreachComplianceResult = {
  decision: OutreachComplianceDecision;
  reasonCodes: readonly string[];
  safeExplanation: string;
  auditMetadata: Record<string, string | boolean | null>;
};

export type OutreachGenerationRequest = {
  status: "future_not_live";
  offerKey: ProductOfferProfile["productKey"];
  leadEvidenceId: string;
  targetLanguage: string;
  requestedTone: string;
};

export type GeneratedOutreachDraft = {
  status: "future_not_live";
  subject: string;
  body: string;
  rationale: string;
  containsRawEvidence: false;
};

export type OutreachQaReviewResult = {
  status: "future_not_live";
  spamRisk: "low" | "medium" | "high";
  inventedFactRisk: "low" | "medium" | "high";
  genderAssumptionRisk: "low" | "medium" | "high";
  toneLanguageQuality: "pass" | "needs_review" | "fail";
  complianceWarnings: readonly string[];
};

export type OutreachApprovalState =
  | "draft_generated"
  | "qa_failed"
  | "needs_human_review"
  | "approved_for_export"
  | "rejected"
  | "regenerated"
  | "exported";

export type OutreachApprovalTransitionResult =
  | {
      allowed: true;
      from: OutreachApprovalState;
      to: OutreachApprovalState;
      reason: "allowed";
    }
  | {
      allowed: false;
      from: OutreachApprovalState;
      to: OutreachApprovalState;
      reason:
        | "human_approval_required"
        | "compliance_must_pass"
        | "qa_must_pass"
        | "terminal_state"
        | "unsupported_transition";
      safeExplanation: string;
    };

export const PRODUCT_OFFER_PROFILES: Record<ProductOfferProfile["productKey"], ProductOfferProfile> = {
  noticecontrol_contract_intelligence: {
    productKey: "noticecontrol_contract_intelligence",
    label: "NoticeControl Contract Intelligence",
    status: "foundation_only",
    targetCustomerTypes: ["SMB operations teams", "mid-market procurement teams", "finance-led vendor owners"],
    buyerRoles: ["COO", "Head of Operations", "Procurement Lead", "Finance Lead", "Legal Operations"],
    painPoints: [
      "missed renewal and notice deadlines",
      "unclear owner accountability",
      "contracts trapped in spreadsheets or inboxes",
      "manual reminder workflows without trust evidence"
    ],
    valuePropositions: [
      "turn reviewed contract metadata into trusted renewal-control workflows",
      "make P0 review, owner assignment, reminders, decisions, and exports inspectable",
      "surface financial and procurement exposure without pretending to be a full CLM suite"
    ],
    useCases: [
      "renewal notice control",
      "owner assignment and decision tracking",
      "contract register export",
      "risk explanation and exposure review"
    ],
    objections: [
      "we already use spreadsheets",
      "we do not want a full CLM implementation",
      "we need proof reminders are based on reviewed data"
    ],
    preferredCta: "Offer a short review of renewal-control gaps and first-value setup path.",
    toneGuidance: [
      "specific and evidence-based",
      "no legal advice",
      "no pressure or deceptive urgency",
      "avoid broad CLM or procurement-suite claims"
    ],
    supportedMarkets: ["global"],
    supportedLanguages: ["en"],
    complianceSensitivity: "moderate"
  }
};

export const ICP_PROFILES: Record<IdealCustomerProfile["id"], IdealCustomerProfile> = {
  noticecontrol_ops_procurement_midmarket: {
    id: "noticecontrol_ops_procurement_midmarket",
    label: "Ops/procurement-led SMB and mid-market renewal-control buyer",
    status: "foundation_only",
    industries: ["software", "professional services", "healthcare operations", "manufacturing", "logistics"],
    companySizes: ["50-500", "500-1500"],
    countriesOrMarkets: ["global", "us", "eu"],
    buyerRoles: ["operations", "procurement", "finance", "legal operations"],
    seniority: ["manager", "director", "vp", "c-level"],
    departments: ["operations", "procurement", "finance", "legal"],
    painPoints: ["renewal", "notice", "owner", "spreadsheet", "vendor", "contract"],
    triggerEvents: ["contract audit", "vendor consolidation", "finance cleanup", "missed renewal", "procurement review"],
    disqualifiers: ["student", "consumer", "job seeker", "unrelated agency pitch", "full CLM RFP only"],
    requiredEvidenceFields: ["companyName", "domain", "countryOrMarket", "buyerRole", "sourceUrls"]
  }
};

function textIncludesAny(value: string | null | undefined, candidates: readonly string[]) {
  const normalized = value?.toLowerCase() ?? "";
  return candidates.some((candidate) => normalized.includes(candidate.toLowerCase()));
}

function listMatchesAny(values: readonly string[] | null | undefined, candidates: readonly string[]) {
  return (values ?? []).some((value) => textIncludesAny(value, candidates));
}

export function explainIcpFit(
  profile: IdealCustomerProfile,
  evidence: CompanyLeadEvidence
): IcpFitExplanation {
  const matchedEvidence: string[] = [];
  const missingEvidence: string[] = [];
  const disqualifyingEvidence: string[] = [];

  for (const field of profile.requiredEvidenceFields) {
    const value = evidence[field];
    if (!value || (Array.isArray(value) && value.length === 0)) missingEvidence.push(String(field));
  }

  if (textIncludesAny(evidence.industry, profile.industries)) matchedEvidence.push("industry");
  if (textIncludesAny(evidence.companySize, profile.companySizes)) matchedEvidence.push("company_size");
  if (textIncludesAny(evidence.countryOrMarket, profile.countriesOrMarkets)) matchedEvidence.push("market");
  if (textIncludesAny(evidence.buyerRole, profile.buyerRoles)) matchedEvidence.push("buyer_role");
  if (textIncludesAny(evidence.seniority, profile.seniority)) matchedEvidence.push("seniority");
  if (textIncludesAny(evidence.department, profile.departments)) matchedEvidence.push("department");
  if (listMatchesAny(evidence.painPoints, profile.painPoints)) matchedEvidence.push("pain_point");
  if (listMatchesAny(evidence.triggerEvents, profile.triggerEvents)) matchedEvidence.push("trigger_event");

  const combinedEvidence = [
    evidence.companyName,
    evidence.domain,
    evidence.industry,
    evidence.companySize,
    evidence.buyerRole,
    evidence.seniority,
    evidence.department,
    evidence.sourceText,
    ...(evidence.painPoints ?? []),
    ...(evidence.triggerEvents ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const disqualifier of profile.disqualifiers) {
    if (combinedEvidence.includes(disqualifier.toLowerCase())) disqualifyingEvidence.push(disqualifier);
  }

  const score = Math.max(0, matchedEvidence.length * 10 - missingEvidence.length * 4 - disqualifyingEvidence.length * 25);
  const fit: IcpFitExplanation["fit"] =
    disqualifyingEvidence.length > 0 || score < 25
      ? "not_fit"
      : score >= 55 && missingEvidence.length <= 1
        ? "strong_fit"
        : "possible_fit";

  return {
    fit,
    score,
    matchedEvidence,
    missingEvidence,
    disqualifyingEvidence,
    explanation:
      fit === "strong_fit"
        ? "Evidence matches the ICP across multiple buyer, pain, and market signals."
        : fit === "possible_fit"
          ? "Some ICP evidence is present, but more source-backed fields are required before outreach."
          : "The lead does not have enough source-backed ICP evidence or has disqualifying signals."
  };
}

export function classifyLeadEligibility(lead: FutureLeadRecord): LeadEligibilityDecision {
  const reasonCodes: string[] = [];
  if (!lead.company.name || !lead.company.domain) reasonCodes.push("company_identity_incomplete");
  if (!lead.company.countryOrMarket) reasonCodes.push("market_missing");
  if (!lead.lead.role && !lead.lead.department) reasonCodes.push("recipient_role_missing");
  if (!lead.evidence.sourceUrl && !lead.evidence.sourceText) reasonCodes.push("source_evidence_missing");
  if (!lead.compliance.legalBasis || lead.compliance.legalBasis === "unknown") reasonCodes.push("legal_basis_missing");
  if (lead.compliance.optOutSuppressed) reasonCodes.push("suppression_or_opt_out");
  if (lead.compliance.previousContactStatus === "complained") reasonCodes.push("previous_complaint");
  if (lead.compliance.previousContactStatus === "contacted_recently") reasonCodes.push("recently_contacted");

  if (reasonCodes.includes("suppression_or_opt_out") || reasonCodes.includes("previous_complaint")) {
    return {
      status: "blocked",
      reasonCodes,
      safeExplanation: "Lead is blocked by suppression, opt-out, or complaint history."
    };
  }

  if (reasonCodes.length > 0) {
    return {
      status: "needs_review",
      reasonCodes,
      safeExplanation: "Lead requires human review before any outreach decision."
    };
  }

  return {
    status: "eligible",
    reasonCodes: ["eligible"],
    safeExplanation: "Lead has minimum source-backed eligibility evidence."
  };
}

export function evaluateOutreachCompliance(input: OutreachComplianceInput): OutreachComplianceResult {
  const profile = getMarketProfile(input.marketId ?? input.lead.company.countryOrMarket ?? "global");
  const eligibility = classifyLeadEligibility(input.lead);
  const reasonCodes = new Set<string>(eligibility.reasonCodes);

  if (profile.marketStatus !== "shipped") reasonCodes.add("market_not_shipped");
  if (profile.complianceReviewRequired) reasonCodes.add("market_compliance_review_required");
  if (profile.outreachComplianceStrictness === "restricted") reasonCodes.add("restricted_market_outreach_blocked");
  if (!profile.allowedOutreachModes.includes(input.requestedMode ?? "manual_export")) {
    reasonCodes.add("outreach_mode_not_allowed");
  }
  if (input.lead.lead.recipientType === "consumer" || input.lead.lead.recipientType === "unknown") {
    reasonCodes.add("recipient_type_review_required");
  }
  if (input.offer.complianceSensitivity === "high") reasonCodes.add("product_compliance_review_required");

  const blockingReasons = [
    "suppression_or_opt_out",
    "previous_complaint",
    "restricted_market_outreach_blocked",
    "outreach_mode_not_allowed"
  ];
  const reviewReasons = [
    "market_not_shipped",
    "market_compliance_review_required",
    "recipient_type_review_required",
    "legal_basis_missing",
    "source_evidence_missing",
    "recently_contacted",
    "product_compliance_review_required",
    "company_identity_incomplete",
    "recipient_role_missing"
  ];
  const allReasons = [...reasonCodes];
  const decision: OutreachComplianceDecision = allReasons.some((reason) => blockingReasons.includes(reason))
    ? "block"
    : allReasons.some((reason) => reviewReasons.includes(reason))
      ? "review"
      : "allow";

  return {
    decision,
    reasonCodes: decision === "allow" ? ["allowed"] : allReasons,
    safeExplanation:
      decision === "allow"
        ? "Minimum compliance checks passed. This is not legal advice and still requires future human approval before export."
        : decision === "review"
          ? "Human review is required before generation or export."
          : "Outreach is blocked by compliance, suppression, market, or channel policy.",
    auditMetadata: {
      product_key: input.offer.productKey,
      market_id: profile.marketId,
      decision,
      requested_mode: input.requestedMode ?? "manual_export",
      legal_basis: input.lead.compliance.legalBasis ?? null,
      opt_out_suppressed: Boolean(input.lead.compliance.optOutSuppressed),
      previous_contact_status: input.lead.compliance.previousContactStatus ?? "none"
    }
  };
}

const allowedTransitions: Record<OutreachApprovalState, readonly OutreachApprovalState[]> = {
  draft_generated: ["qa_failed", "needs_human_review", "rejected", "regenerated"],
  qa_failed: ["regenerated", "rejected"],
  needs_human_review: ["approved_for_export", "rejected", "regenerated"],
  approved_for_export: ["exported", "rejected"],
  rejected: [],
  regenerated: ["draft_generated", "qa_failed", "needs_human_review"],
  exported: []
};

export function evaluateOutreachApprovalTransition(input: {
  from: OutreachApprovalState;
  to: OutreachApprovalState;
  complianceDecision: OutreachComplianceDecision;
  qaPassed?: boolean;
  humanApproved?: boolean;
}): OutreachApprovalTransitionResult {
  if (input.from === "rejected" || input.from === "exported") {
    return {
      allowed: false,
      from: input.from,
      to: input.to,
      reason: "terminal_state",
      safeExplanation: "Terminal outreach approval states cannot transition."
    };
  }

  if (!allowedTransitions[input.from].includes(input.to)) {
    return {
      allowed: false,
      from: input.from,
      to: input.to,
      reason: "unsupported_transition",
      safeExplanation: "This outreach approval transition is not supported."
    };
  }

  if (input.to === "approved_for_export") {
    if (input.complianceDecision !== "allow") {
      return {
        allowed: false,
        from: input.from,
        to: input.to,
        reason: "compliance_must_pass",
        safeExplanation: "Compliance must allow outreach before human approval can approve export."
      };
    }
    if (!input.qaPassed) {
      return {
        allowed: false,
        from: input.from,
        to: input.to,
        reason: "qa_must_pass",
        safeExplanation: "QA must pass before approval for export."
      };
    }
    if (!input.humanApproved) {
      return {
        allowed: false,
        from: input.from,
        to: input.to,
        reason: "human_approval_required",
        safeExplanation: "Human approval is required before outreach can be approved for export."
      };
    }
  }

  if (input.to === "exported" && input.from !== "approved_for_export") {
    return {
      allowed: false,
      from: input.from,
      to: input.to,
      reason: "human_approval_required",
      safeExplanation: "Outreach cannot be exported unless it was approved for export first."
    };
  }

  return {
    allowed: true,
    from: input.from,
    to: input.to,
    reason: "allowed"
  };
}

export function canExportOutreach(input: {
  approvalState: OutreachApprovalState;
  complianceDecision: OutreachComplianceDecision;
  humanApproved: boolean;
}) {
  return (
    input.approvalState === "approved_for_export" &&
    input.complianceDecision === "allow" &&
    input.humanApproved
  );
}

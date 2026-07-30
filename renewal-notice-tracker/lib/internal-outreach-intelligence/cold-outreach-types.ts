import type { OutreachDraftQualityScore, OutreachSafetyStatus } from "@/lib/internal-outreach-intelligence/outreach-types";

export const COLD_OUTREACH_COMPANY_SIZE_BANDS = ["unknown", "1_50", "51_200", "201_1000", "1001_5000", "5000_plus"] as const;
export const COLD_OUTREACH_SUPPRESSION_STATUSES = ["unknown", "not_suppressed", "suppressed", "opted_out", "complained"] as const;
export const COLD_OUTREACH_APPROVAL_STATES = ["draft", "needs_review", "approved_for_copy", "rejected", "archived"] as const;
export const COLD_OUTREACH_VARIANT_TYPES = ["concise_email", "founder_led_email", "linkedin_note", "internal_reviewer_summary"] as const;

export type ColdOutreachCompanySizeBand = (typeof COLD_OUTREACH_COMPANY_SIZE_BANDS)[number];
export type ColdOutreachSuppressionStatus = (typeof COLD_OUTREACH_SUPPRESSION_STATUSES)[number];
export type ColdOutreachApprovalState = (typeof COLD_OUTREACH_APPROVAL_STATES)[number];
export type ColdOutreachVariantType = (typeof COLD_OUTREACH_VARIANT_TYPES)[number];

export type ColdOutreachLeadCompanyInput = {
  organizationId: string;
  companyName: string;
  website?: string | null;
  industry?: string | null;
  companySizeBand?: ColdOutreachCompanySizeBand;
  roleTitle?: string | null;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  painSignal?: string | null;
  evidenceConfidence: number;
  suppressionStatus?: ColdOutreachSuppressionStatus;
};

export type ColdOutreachLeadCompanyModel = {
  organizationId: string;
  companyName: string;
  website: string | null;
  websiteHash: string | null;
  industry: string | null;
  companySizeBand: ColdOutreachCompanySizeBand;
  roleTitle: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  painSignal: string | null;
  evidenceConfidence: number;
  suppressionStatus: ColdOutreachSuppressionStatus;
  blockerCodes: string[];
  warningCodes: string[];
};

export type ColdOutreachOfferIcpInput = {
  offerName: string;
  targetCustomer: string;
  primaryPain: string;
  valueProp: string;
  proofPoints: string[];
  disallowedClaims: string[];
};

export type ColdOutreachOfferIcpModel = {
  offerName: string;
  targetCustomer: string;
  primaryPain: string;
  valueProp: string;
  proofPoints: string[];
  disallowedClaims: string[];
  blockerCodes: string[];
};

export type ColdOutreachEvidenceReference = {
  field: "company_name" | "website" | "industry" | "company_size_band" | "role_title" | "source" | "pain_signal";
  label: string;
  sourceUrl: string | null;
  sourceLabel: string | null;
  confidence: number;
};

export type ColdOutreachApprovalEvaluation = {
  approvalState: ColdOutreachApprovalState;
  copyAllowed: boolean;
  blockers: string[];
};

export type ColdOutreachDraftVariant = {
  variantType: ColdOutreachVariantType;
  subjectOrHeading: string;
  bodyPreview: string;
  openingLine: string;
  evidenceReferencesUsed: ColdOutreachEvidenceReference[];
  claimsRequiringReviewerApproval: string[];
  qualityScore: OutreachDraftQualityScore;
};

export type ColdOutreachDraftWorkbenchResult = {
  lead: ColdOutreachLeadCompanyModel;
  offer: ColdOutreachOfferIcpModel;
  variants: ColdOutreachDraftVariant[];
  safetyStatus: OutreachSafetyStatus;
  safetyReasons: string[];
  copyAllowed: false;
  approval: ColdOutreachApprovalEvaluation;
  unavailableFacts: string[];
};

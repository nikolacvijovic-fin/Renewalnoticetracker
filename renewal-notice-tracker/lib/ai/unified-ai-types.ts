export type AiFactField =
  | "renewal_date"
  | "expiration_date"
  | "notice_deadline_date"
  | "auto_renewal"
  | "termination_window"
  | "opt_out_deadline"
  | "contract_value_amount"
  | "contract_value_currency"
  | "cancellation_window"
  | "other";

export type AiFactReviewStatus = "proposed" | "needs_review" | "reviewed" | "rejected";
export type AiFactTrustStatus = "proposed" | "needs_review" | "accepted" | "rejected" | "superseded";

export type AiEvidenceReference = {
  sourceLabel: string;
  sourceId?: string | null;
  excerptHash?: string | null;
};

export type AiProposedFactInput = {
  id?: string | null;
  organizationId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  field: AiFactField;
  value: string | number | boolean | null;
  source: "ocr" | "extraction" | "manual_import" | "provider";
  confidence: number;
  evidenceReference: AiEvidenceReference | null;
  reviewStatus?: AiFactReviewStatus;
};

export type NormalizedAiFact = {
  id: string | null;
  organizationId: string | null;
  entityType: string | null;
  entityId: string | null;
  field: AiFactField;
  fieldName: AiFactField;
  value: string | number | boolean | null;
  proposedValue: string | number | boolean | null;
  source: AiProposedFactInput["source"];
  extractionSource: AiProposedFactInput["source"];
  confidence: number;
  evidenceReference: AiEvidenceReference | null;
  evidenceRef: AiEvidenceReference | null;
  reviewStatus: AiFactReviewStatus;
  trustStatus: AiFactTrustStatus;
  requiresReview: boolean;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  createdAt: string;
  metadata: Record<string, string | number | boolean | null>;
};

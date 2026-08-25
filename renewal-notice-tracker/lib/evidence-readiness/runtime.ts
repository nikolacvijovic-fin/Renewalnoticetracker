import { EVIDENCE_FRESHNESS_DAYS } from "@/lib/evidence-readiness/config";
import type {
  EvidenceDecisionProfile,
  EvidenceObservation,
  EvidenceReadinessFacts,
  EvidenceSourceReference
} from "@/lib/evidence-readiness/types";
import type {
  CommercialDecision,
  CommercialDecisionApprovalStep,
  CommercialDecisionEvidenceLink
} from "@/lib/commercial-decision-workbench/decision-types";

type ContractMetadata = {
  id?: string;
  contract_title?: string | null;
  counterparty_name?: string | null;
  renewal_date?: string | null;
  expiration_date?: string | null;
  auto_renewal?: boolean | null;
  notice_period_value?: number | null;
  notice_deadline_date?: string | null;
  contract_value_amount?: number | null;
  contract_value_currency?: string | null;
  contract_value_period?: string | null;
  renewal_term?: string | null;
  financial_data_trust_status?: string | null;
  needs_review?: boolean | null;
  has_weak_evidence?: boolean | null;
  has_conflict?: boolean | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  updated_at?: string | null;
};

export type EvidenceReadinessRuntimeContext = {
  contract: {
    id: string;
    organization_id: string;
    is_sample?: boolean | null;
    source_type?: string | null;
    latest_file_id?: string | null;
    owner_user_id?: string | null;
    department?: string | null;
    updated_at?: string | null;
    renewal_decision_status?: string | null;
    contract_metadata?: ContractMetadata | ContractMetadata[] | null;
  };
  decision: CommercialDecision | null;
  evidenceLinks: CommercialDecisionEvidenceLink[];
  approvalSteps: CommercialDecisionApprovalStep[];
  ownerNotificationEmail: string | null;
  workspaceTimezoneConfigured: boolean;
  usage: {
    connectionId: string | null;
    connected: boolean;
    lastSuccessfulSyncAt: string | null;
    matchId: string | null;
    matchConfidence: number | null;
    purchasedQuantityKnown: boolean;
    assignedQuantityKnown: boolean;
    hasActiveConflict: boolean;
    activeMaterialFindingCount: number;
    reviewedMaterialFindingCount: number;
    materialFindingSourceId: string | null;
  };
  quote: {
    comparisonId: string | null;
    uploaded: boolean;
    reviewed: boolean;
    priceVerified: boolean;
    currency: string | null;
    materialChangeCount: number;
    reviewedMaterialChangeCount: number;
  };
  openEvidenceRequestCount: number;
  preferredScenarioExchangeRateSource: string | null;
  now?: string;
};

function firstMetadata(value: EvidenceReadinessRuntimeContext["contract"]["contract_metadata"]) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function source(input: Partial<EvidenceSourceReference> & Pick<EvidenceSourceReference, "sourceType" | "sourceRecordId">): EvidenceSourceReference {
  return {
    sourceType: input.sourceType,
    sourceRecordId: input.sourceRecordId,
    verifiedBy: input.verifiedBy ?? null,
    verifiedAt: input.verifiedAt ?? null,
    freshnessDate: input.freshnessDate ?? null
  };
}

function observation(state: EvidenceObservation["state"], input?: Omit<EvidenceObservation, "state">): EvidenceObservation {
  return { state, ...input };
}

function reviewedState(present: boolean, reviewed: boolean, conflicting = false) {
  if (conflicting) return "conflicting" as const;
  if (!present) return "missing" as const;
  return reviewed ? "verified" as const : "present_unreviewed" as const;
}

function criticalReviewedState(present: boolean, reviewed: boolean, conflicting = false) {
  if (conflicting) return "conflicting" as const;
  if (!present) return "missing" as const;
  return reviewed ? "verified" as const : "insufficient" as const;
}

function ageInDays(value: string | null, now: Date) {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(value).valueOf();
  return Number.isFinite(timestamp) ? Math.max(0, (now.valueOf() - timestamp) / 86_400_000) : Number.POSITIVE_INFINITY;
}

export function decisionProfileFromDecision(decision: CommercialDecision | null): EvidenceDecisionProfile {
  switch (decision?.decision_type) {
    case "renew_unchanged": return "renew_unchanged";
    case "renew_reduced_seats": return "reduce_seats";
    case "renegotiate_price_or_terms": return "renegotiate";
    case "consolidate_products": return "consolidate";
    case "terminate": return "terminate";
    case "replace_vendor": return "replace_vendor";
    default: return "renewal_triage";
  }
}

export function buildEvidenceReadinessFacts(context: EvidenceReadinessRuntimeContext): EvidenceReadinessFacts {
  const facts: EvidenceReadinessFacts = {};
  const metadata = firstMetadata(context.contract.contract_metadata);
  const now = new Date(context.now ?? new Date().toISOString());
  const reviewed = Boolean(metadata?.reviewed_at && !metadata.needs_review && !metadata.has_weak_evidence);
  const metadataSource = metadata?.id ? source({
    sourceType: "reviewed_contract_metadata",
    sourceRecordId: metadata.id,
    verifiedBy: metadata.reviewed_by ?? null,
    verifiedAt: metadata.reviewed_at ?? null,
    freshnessDate: metadata.updated_at ?? null
  }) : null;
  const contractSource = source({
    sourceType: "contract_file",
    sourceRecordId: context.contract.latest_file_id ?? context.contract.id,
    verifiedAt: context.contract.updated_at ?? null,
    freshnessDate: context.contract.updated_at ?? null
  });
  const isReal = !context.contract.is_sample && context.contract.source_type !== "sample";

  facts.real_contract_source = observation(isReal ? "verified" : "insufficient", {
    source: isReal ? contractSource : null,
    explanation: isReal ? "A real organization-scoped contract is present." : "Sample or demo evidence cannot support a real renewal decision."
  });
  facts.current_contract_file = observation(context.contract.latest_file_id ? "verified" : "missing", { source: context.contract.latest_file_id ? contractSource : null });
  facts.contract_extraction_reviewed = observation(metadata ? (reviewed ? "verified" : "insufficient") : "missing", { source: metadataSource });
  facts.counterparty_verified = observation(reviewedState(Boolean(metadata?.counterparty_name), reviewed), { source: metadataSource });
  facts.contract_scope_verified = observation(reviewedState(Boolean(metadata?.contract_title), reviewed), { source: metadataSource });

  facts.renewal_date_verified = observation(criticalReviewedState(Boolean(metadata?.renewal_date), reviewed, Boolean(metadata?.has_conflict)), { source: metadataSource });
  facts.auto_renewal_verified = observation(criticalReviewedState(typeof metadata?.auto_renewal === "boolean", reviewed), { source: metadataSource });
  const noticeApplicable = metadata?.auto_renewal !== false;
  const noticePresent = Boolean(metadata?.notice_deadline_date || metadata?.notice_period_value);
  facts.notice_timing_verified = noticeApplicable
    ? observation(criticalReviewedState(noticePresent, reviewed, Boolean(metadata?.has_conflict)), { source: metadataSource })
    : observation("not_applicable", { explanation: "Reviewed metadata confirms this contract does not auto-renew." });
  facts.deadline_conflict_free = observation(metadata?.has_conflict ? "conflicting" : reviewed ? "verified" : metadata ? "present_unreviewed" : "missing", { source: metadataSource });
  facts.organization_timezone = observation(context.workspaceTimezoneConfigured ? "verified" : "missing", context.workspaceTimezoneConfigured ? {
    source: source({ sourceType: "customer_confirmation", sourceRecordId: context.contract.organization_id })
  } : undefined);
  const deadline = metadata?.notice_deadline_date;
  const deadlinePassed = deadline ? new Date(`${deadline}T23:59:59.999Z`) < now : false;
  const recordedDecision = Boolean(context.contract.renewal_decision_status && !["undecided", "pending", "needs_review"].includes(context.contract.renewal_decision_status));
  facts.deadline_decision_status = observation(deadlinePassed && !recordedDecision ? "insufficient" : "verified", {
    source: metadataSource,
    explanation: deadlinePassed && !recordedDecision ? "The notice deadline passed without a recorded decision." : "The deadline has not passed without a recorded decision."
  });

  facts.annual_cost_verified = observation(reviewedState(metadata?.contract_value_amount !== null && metadata?.contract_value_amount !== undefined, reviewed), { source: metadataSource });
  facts.currency_verified = observation(reviewedState(Boolean(metadata?.contract_value_currency), reviewed), { source: metadataSource });
  facts.billing_period_known = observation(reviewedState(Boolean(metadata?.contract_value_period || metadata?.renewal_term), reviewed), { source: metadataSource });
  facts.quantity_basis_known = observation(context.usage.purchasedQuantityKnown ? "verified" : "missing", context.usage.matchId ? {
    source: source({ sourceType: "usage_row", sourceRecordId: context.usage.matchId, freshnessDate: context.usage.lastSuccessfulSyncAt })
  } : undefined);
  const crossCurrency = Boolean(metadata?.contract_value_currency && context.quote.currency && metadata.contract_value_currency !== context.quote.currency);
  facts.financial_conflict_free = observation(
    crossCurrency && !context.preferredScenarioExchangeRateSource ? "conflicting" : metadata?.has_conflict ? "conflicting" : reviewed ? "verified" : "present_unreviewed",
    { source: metadataSource, explanation: crossCurrency && !context.preferredScenarioExchangeRateSource ? "Cross-currency values require an approved conversion source." : undefined }
  );

  const connectionSource = context.usage.connectionId ? source({
    sourceType: "provider_usage_snapshot",
    sourceRecordId: context.usage.connectionId,
    freshnessDate: context.usage.lastSuccessfulSyncAt
  }) : null;
  facts.usage_provider_connected = observation(context.usage.connected ? "verified" : "missing", { source: connectionSource });
  const usageAge = ageInDays(context.usage.lastSuccessfulSyncAt, now);
  facts.usage_snapshot_fresh = observation(!context.usage.lastSuccessfulSyncAt ? "missing" : usageAge > EVIDENCE_FRESHNESS_DAYS.providerUsageSnapshot ? "stale" : "verified", { source: connectionSource });
  facts.product_contract_match = observation(context.usage.matchId ? (Number(context.usage.matchConfidence) >= 0.8 ? "verified" : "insufficient") : "missing", context.usage.matchId ? {
    source: source({ sourceType: "product_contract_match", sourceRecordId: context.usage.matchId, freshnessDate: context.usage.lastSuccessfulSyncAt })
  } : undefined);
  facts.purchased_assigned_quantities = observation(context.usage.purchasedQuantityKnown && context.usage.assignedQuantityKnown ? "verified" : "missing", context.usage.matchId ? {
    source: source({ sourceType: "usage_row", sourceRecordId: context.usage.matchId, freshnessDate: context.usage.lastSuccessfulSyncAt })
  } : undefined);
  facts.usage_evidence_conflict_free = observation(context.usage.hasActiveConflict ? "conflicting" : context.usage.matchId ? "verified" : "missing", context.usage.matchId ? {
    source: source({ sourceType: "product_contract_match", sourceRecordId: context.usage.matchId, freshnessDate: context.usage.lastSuccessfulSyncAt })
  } : undefined);

  const ownerFresh = ageInDays(context.contract.updated_at ?? null, now) <= EVIDENCE_FRESHNESS_DAYS.ownerConfirmation;
  facts.owner_assigned = observation(context.contract.owner_user_id ? (ownerFresh ? "verified" : "stale") : "missing", context.contract.owner_user_id ? {
    source: source({ sourceType: "customer_confirmation", sourceRecordId: context.contract.id, verifiedBy: context.contract.owner_user_id, freshnessDate: context.contract.updated_at ?? null })
  } : undefined);
  facts.owner_notification_destination = observation(context.contract.owner_user_id ? (context.ownerNotificationEmail ? "verified" : "insufficient") : "missing", context.contract.owner_user_id ? {
    source: source({ sourceType: "customer_confirmation", sourceRecordId: context.contract.owner_user_id, verifiedBy: context.contract.owner_user_id })
  } : undefined);
  facts.department_known = observation(context.contract.department ? "verified" : "missing", context.contract.department ? {
    source: source({ sourceType: "customer_confirmation", sourceRecordId: context.contract.id })
  } : undefined);
  facts.decision_due_date = observation(context.decision?.decision_deadline ? "verified" : "missing", context.decision?.decision_deadline ? {
    source: source({ sourceType: "customer_confirmation", sourceRecordId: context.decision.id, verifiedBy: context.decision.decision_owner_user_id ?? null })
  } : undefined);

  const quoteSource = context.quote.comparisonId ? source({ sourceType: "quote_file", sourceRecordId: context.quote.comparisonId }) : null;
  facts.renewal_quote_uploaded = observation(context.quote.uploaded ? (context.quote.reviewed ? "verified" : "present_unreviewed") : "missing", { source: quoteSource });
  facts.renewal_quote_reviewed = observation(context.quote.reviewed ? "verified" : context.quote.uploaded ? "present_unreviewed" : "missing", { source: quoteSource });
  facts.proposed_price_currency_verified = observation(context.quote.priceVerified && context.quote.currency ? "verified" : context.quote.uploaded ? "present_unreviewed" : "missing", { source: quoteSource });
  facts.quote_changes_reviewed = observation(!context.quote.materialChangeCount ? "not_applicable" : context.quote.reviewedMaterialChangeCount >= context.quote.materialChangeCount ? "verified" : "present_unreviewed", { source: quoteSource });

  const selectedProfile = decisionProfileFromDecision(context.decision);
  facts.decision_profile_selected = observation(selectedProfile === "renewal_triage" ? "missing" : "verified", context.decision ? {
    source: source({ sourceType: "customer_confirmation", sourceRecordId: context.decision.id, verifiedBy: context.decision.decision_owner_user_id ?? null })
  } : undefined);
  const pendingApproval = context.approvalSteps.find((step) => step.status === "pending");
  facts.required_approvers_known = observation(context.decision?.separation_of_duties_required ? (pendingApproval?.approver_user_id ? "verified" : "missing") : "not_applicable", pendingApproval ? {
    source: source({ sourceType: "approval_record", sourceRecordId: pendingApproval.id })
  } : undefined);
  facts.material_findings_reviewed = observation(!context.usage.activeMaterialFindingCount ? "not_applicable" : context.usage.reviewedMaterialFindingCount >= context.usage.activeMaterialFindingCount ? "verified" : "present_unreviewed", context.usage.materialFindingSourceId ? {
    source: source({ sourceType: "subscription_finding", sourceRecordId: context.usage.materialFindingSourceId })
  } : undefined);
  facts.evidence_requests_resolved = context.decision
    ? observation(context.openEvidenceRequestCount ? "insufficient" : "verified", {
        source: source({ sourceType: "customer_confirmation", sourceRecordId: context.decision.id })
      })
    : observation("not_applicable", { explanation: "Evidence requests apply after a decision workspace exists." });
  const changedAfterApproval = Boolean(context.decision?.approved_at && context.decision.approved_version !== context.decision.decision_version);
  facts.approval_evidence_current = context.decision?.approved_at
    ? observation(changedAfterApproval ? "conflicting" : "verified", {
        source: source({ sourceType: "approval_record", sourceRecordId: context.decision.id, verifiedAt: context.decision.approved_at })
      })
    : selectedProfile === "terminate"
      ? observation("missing", {
          explanation: "Termination readiness requires recorded human legal or commercial approval.",
          recommendedAction: "Obtain and record human legal or commercial approval."
        })
    : observation("not_applicable", { explanation: "Approval freshness applies after an approval is recorded." });
  const terminationEvidence = context.evidenceLinks.find((link) => /termination|notice method/i.test(link.evidence_label) && (link.confidence ?? 0) >= 0.7);
  facts.termination_method_verified = observation(terminationEvidence ? "verified" : "missing", terminationEvidence ? {
    source: source({ sourceType: "contract_citation", sourceRecordId: terminationEvidence.evidence_id ?? terminationEvidence.id, verifiedAt: terminationEvidence.updated_at })
  } : undefined);

  if (!isReal) {
    for (const [key, value] of Object.entries(facts)) {
      if (value?.state === "not_applicable") continue;
      facts[key] = observation("insufficient", {
        explanation: "Sample or demo evidence is excluded from real evidence readiness.",
        recommendedAction: "Upload and review a real organization contract."
      });
    }
  }

  return facts;
}

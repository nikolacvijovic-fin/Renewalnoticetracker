import type {
  EvidenceDecisionProfile,
  EvidenceRequirementDefinition,
  EvidenceRequirementState
} from "@/lib/evidence-readiness/types";

export const EVIDENCE_READINESS_CALCULATION_VERSION = "evidence-readiness-v1";
export const EVIDENCE_READINESS_DECISION_THRESHOLD = 85;

export const EVIDENCE_STATE_CREDIT: Record<EvidenceRequirementState, number> = {
  verified: 1,
  present_unreviewed: 0.4,
  missing: 0,
  stale: 0,
  conflicting: 0,
  insufficient: 0,
  not_applicable: 0
};

export const EVIDENCE_FRESHNESS_DAYS = {
  providerUsageSnapshot: 7,
  ownerConfirmation: 90
} as const;

const noUsage: Partial<Record<EvidenceDecisionProfile, { applicable: boolean }>> = {
  renewal_triage: { applicable: false },
  renew_unchanged: { applicable: false },
  renegotiate: { applicable: false },
  terminate: { applicable: false }
};

const noQuote: Partial<Record<EvidenceDecisionProfile, { applicable: boolean }>> = {
  renewal_triage: { applicable: false },
  renew_unchanged: { applicable: false },
  reduce_seats: { applicable: false },
  terminate: { applicable: false }
};

export const EVIDENCE_REQUIREMENT_CONFIG: readonly EvidenceRequirementDefinition[] = [
  { key: "real_contract_source", label: "Real contract source", category: "contract_identity", weight: 4, criticalByDefault: true, defaultAction: "Upload the current real contract." },
  { key: "current_contract_file", label: "Current contract file", category: "contract_identity", weight: 3, criticalByDefault: true, defaultAction: "Upload the current contract version." },
  { key: "contract_extraction_reviewed", label: "Contract extraction reviewed", category: "contract_identity", weight: 4, criticalByDefault: true, defaultAction: "Review the extracted contract metadata." },
  { key: "counterparty_verified", label: "Vendor or counterparty verified", category: "contract_identity", weight: 2, criticalByDefault: false, defaultAction: "Confirm the vendor or counterparty." },
  { key: "contract_scope_verified", label: "Contract title or product scope verified", category: "contract_identity", weight: 2, criticalByDefault: false, defaultAction: "Confirm the contract title or product scope." },

  { key: "renewal_date_verified", label: "Renewal date verified", category: "renewal_timing", weight: 6, criticalByDefault: true, defaultAction: "Review and confirm the renewal date." },
  { key: "auto_renewal_verified", label: "Auto-renewal status verified", category: "renewal_timing", weight: 5, criticalByDefault: true, defaultAction: "Confirm whether the contract auto-renews." },
  { key: "notice_timing_verified", label: "Notice period or deadline verified", category: "renewal_timing", weight: 7, criticalByDefault: true, defaultAction: "Review and confirm the notice deadline." },
  { key: "deadline_conflict_free", label: "Deadline calculation has no unresolved conflict", category: "renewal_timing", weight: 3, criticalByDefault: true, defaultAction: "Resolve the conflicting renewal or notice dates." },
  { key: "organization_timezone", label: "Organization timezone configured", category: "renewal_timing", weight: 2, criticalByDefault: false, defaultAction: "Configure the organization timezone." },
  { key: "deadline_decision_status", label: "Passed deadline has a recorded decision", category: "renewal_timing", weight: 2, criticalByDefault: true, defaultAction: "Record the decision for the passed deadline." },

  { key: "annual_cost_verified", label: "Current annual cost verified", category: "financial", weight: 5, criticalByDefault: false, defaultAction: "Confirm the current annual cost." },
  { key: "currency_verified", label: "Currency verified", category: "financial", weight: 3, criticalByDefault: true, defaultAction: "Confirm the contract currency." },
  { key: "billing_period_known", label: "Billing period or contract term known", category: "financial", weight: 2, criticalByDefault: false, defaultAction: "Confirm the billing period or contract term." },
  { key: "quantity_basis_known", label: "Seat or quantity basis known", category: "financial", weight: 2, criticalByDefault: false, defaultAction: "Confirm the purchased quantity or seat basis.", profiles: { renewal_triage: { applicable: false }, renew_unchanged: { applicable: false }, terminate: { applicable: false } } },
  { key: "financial_conflict_free", label: "Financial values have no unresolved conflict", category: "financial", weight: 3, criticalByDefault: true, defaultAction: "Resolve conflicting reviewed financial values." },

  { key: "usage_provider_connected", label: "Usage provider connected", category: "usage_optimization", weight: 3, criticalByDefault: false, defaultAction: "Connect the relevant usage provider.", profiles: noUsage },
  { key: "usage_snapshot_fresh", label: "Latest usage snapshot is fresh", category: "usage_optimization", weight: 4, criticalByDefault: false, defaultAction: "Synchronize current usage.", profiles: { ...noUsage, reduce_seats: { applicable: true, critical: true } } },
  { key: "product_contract_match", label: "Product-to-contract match verified", category: "usage_optimization", weight: 3, criticalByDefault: false, defaultAction: "Resolve the ambiguous product-to-contract match.", profiles: { ...noUsage, reduce_seats: { applicable: true, critical: true }, consolidate: { applicable: true, critical: true } } },
  { key: "purchased_assigned_quantities", label: "Purchased and assigned quantities known", category: "usage_optimization", weight: 3, criticalByDefault: false, defaultAction: "Confirm purchased and assigned quantities.", profiles: { ...noUsage, reduce_seats: { applicable: true, critical: true } } },
  { key: "usage_evidence_conflict_free", label: "Usage evidence is complete and conflict-free", category: "usage_optimization", weight: 2, criticalByDefault: false, defaultAction: "Resolve stale, partial, unmapped, or conflicting usage evidence.", profiles: { ...noUsage, reduce_seats: { applicable: true, critical: true } } },

  { key: "owner_assigned", label: "Contract owner assigned", category: "ownership", weight: 3, criticalByDefault: false, defaultAction: "Assign a contract owner." },
  { key: "owner_notification_destination", label: "Owner notification destination valid", category: "ownership", weight: 2, criticalByDefault: false, defaultAction: "Confirm the owner's notification destination." },
  { key: "department_known", label: "Responsible department known", category: "ownership", weight: 2, criticalByDefault: false, defaultAction: "Assign the responsible department." },
  { key: "decision_due_date", label: "Decision due date defined", category: "ownership", weight: 3, criticalByDefault: false, defaultAction: "Set the renewal decision due date." },

  { key: "renewal_quote_uploaded", label: "Renewal quote uploaded", category: "renewal_quote", weight: 2, criticalByDefault: false, defaultAction: "Upload the renewal quote.", profiles: { ...noQuote, renegotiate: { applicable: true, critical: true }, replace_vendor: { applicable: true, critical: true } } },
  { key: "renewal_quote_reviewed", label: "Renewal quote extraction reviewed", category: "renewal_quote", weight: 2, criticalByDefault: false, defaultAction: "Review the renewal quote extraction.", profiles: { ...noQuote, renegotiate: { applicable: true, critical: true } } },
  { key: "proposed_price_currency_verified", label: "Proposed price and currency verified", category: "renewal_quote", weight: 3, criticalByDefault: false, defaultAction: "Confirm the proposed price and currency.", profiles: { ...noQuote, renegotiate: { applicable: true, critical: true } } },
  { key: "quote_changes_reviewed", label: "Material quote changes reviewed", category: "renewal_quote", weight: 3, criticalByDefault: false, defaultAction: "Review the material quote changes.", profiles: noQuote },

  { key: "decision_profile_selected", label: "Decision profile selected", category: "decision_approval", weight: 2, criticalByDefault: false, defaultAction: "Select the intended renewal decision." },
  { key: "required_approvers_known", label: "Required approvers known", category: "decision_approval", weight: 2, criticalByDefault: false, defaultAction: "Assign the required approver." },
  { key: "material_findings_reviewed", label: "Material findings reviewed", category: "decision_approval", weight: 2, criticalByDefault: false, defaultAction: "Review the material findings.", profiles: { consolidate: { applicable: true, critical: true }, terminate: { applicable: false } } },
  { key: "evidence_requests_resolved", label: "Open evidence requests resolved", category: "decision_approval", weight: 2, criticalByDefault: false, defaultAction: "Resolve open evidence requests." },
  { key: "approval_evidence_current", label: "Approval evidence remains current", category: "decision_approval", weight: 2, criticalByDefault: true, defaultAction: "Review evidence changed after approval." },
  { key: "termination_method_verified", label: "Termination method evidence verified", category: "decision_approval", weight: 2, criticalByDefault: true, defaultAction: "Confirm the contractual notice method and obtain human legal or commercial review.", profiles: { renewal_triage: { applicable: false }, renew_unchanged: { applicable: false }, reduce_seats: { applicable: false }, renegotiate: { applicable: false }, consolidate: { applicable: false }, replace_vendor: { applicable: false } } }
] as const;

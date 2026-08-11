export const SAMPLE_CONTRACT_ACTIONS = {
  created: "contract.sample_created",
  opened: "contract.sample_opened",
  removed: "contract.sample_removed",
  movedToFirstReal: "contract.sample_moved_to_first_real"
} as const;

const SAMPLE_CONTRACT_TITLE = "Sample SaaS Renewal Agreement";
const SAMPLE_VENDOR_NAME = "Acme Analytics Cloud";

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function buildSampleContractDates(now = new Date()) {
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return {
    effectiveDate: toDateOnly(addDays(base, -320)),
    noticeDeadlineDate: toDateOnly(addDays(base, 10)),
    renewalDate: toDateOnly(addDays(base, 45)),
    expirationDate: toDateOnly(addDays(base, 45))
  };
}

export function buildSampleContractMetadata(now = new Date()) {
  const dates = buildSampleContractDates(now);
  const fieldConfidence = {
    contract_title: 1,
    counterparty_name: 1,
    effective_date: 1,
    notice_deadline_date: 1,
    renewal_date: 1,
    expiration_date: 1,
    auto_renewal: 1,
    contract_value_amount: 1,
    contract_value_currency: 1
  };
  const fieldSourceSnippets = {
    contract_title: "Synthetic sample evidence: fictional SaaS renewal agreement title.",
    counterparty_name: "Synthetic sample evidence: fictional vendor Acme Analytics Cloud.",
    notice_deadline_date: "Synthetic sample evidence: opt-out notice is due 35 days before renewal.",
    renewal_date: "Synthetic sample evidence: fictional renewal date is shown for the demo.",
    expiration_date: "Synthetic sample evidence: fictional expiration date matches the renewal date.",
    auto_renewal: "Synthetic sample evidence: fictional agreement auto-renews unless notice is given.",
    contract_value_amount: "Synthetic sample evidence: fictional annual value is 48000 USD.",
    contract_value_currency: "Synthetic sample evidence: fictional currency is USD."
  };

  return {
    contract_title: SAMPLE_CONTRACT_TITLE,
    counterparty_name: SAMPLE_VENDOR_NAME,
    contract_type: "SaaS subscription",
    effective_date: dates.effectiveDate,
    renewal_date: dates.renewalDate,
    expiration_date: dates.expirationDate,
    auto_renewal: true,
    renewal_term: "Annual",
    notice_period_value: 35,
    notice_period_unit: "days",
    notice_deadline_date: dates.noticeDeadlineDate,
    termination_window: "Submit written opt-out notice before the fictional notice deadline.",
    governing_law: null,
    payment_terms: "Annual prepaid",
    contract_value_amount: 48000,
    contract_value_currency: "USD",
    contract_value_period: "annual",
    price_change_trigger: null,
    payment_trigger: null,
    financial_data_trust_status: "reviewed_sample",
    extracted_clauses: [],
    field_confidence: fieldConfidence,
    field_source_snippets: fieldSourceSnippets,
    reminder_recommendations: [],
    needs_review: false,
    reviewer_notes: null,
    review_mode: "sample_reviewed",
    review_reason: "Synthetic sample data for first-run onboarding.",
    has_conflict: false,
    has_derived_date: false,
    has_weak_evidence: false,
    is_ocr_assisted: false,
    is_manual_without_evidence: false,
    changes_previously_verified_p0: false,
    accepted_unverified_risk_requested: false,
    contract_template_key: "sample_contract"
  };
}

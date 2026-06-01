type TestRole = "admin" | "operator" | "reviewer" | "owner" | "member";

export function makeTestOrganization(overrides: Record<string, unknown> = {}) {
  return {
    id: "org-1",
    name: "Acme Legal Ops",
    plan_tier: "growth",
    subscription_status: "active",
    billing_provider: "paddle",
    trial_ends_at: null,
    subscription_current_period_end: "2099-01-01T00:00:00.000Z",
    ...overrides
  };
}

export function makeTestUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "user@example.com",
    ...overrides
  };
}

export function makeTestMember(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "owner-1",
    full_name: "Jane Doe",
    email: "jane@example.com",
    role: "owner",
    ...overrides
  };
}

export function makeActiveOrganizationContext(
  overrides: {
    user?: Record<string, unknown>;
    organizationId?: string;
    role?: TestRole;
  } = {}
) {
  return {
    user: makeTestUser(overrides.user),
    organizationId: overrides.organizationId ?? "org-1",
    role: overrides.role ?? "owner"
  };
}

export function makeContractMetadata(overrides: Record<string, unknown> = {}) {
  return {
    contract_title: "MSA",
    counterparty_name: "Acme",
    contract_type: "MSA",
    renewal_date: "2026-11-30",
    expiration_date: "2026-12-31",
    notice_deadline_date: "2026-12-01",
    auto_renewal: true,
    payment_terms: "Net 30",
    needs_review: false,
    contract_value_amount: 100000,
    contract_value_currency: "USD",
    financial_data_trust_status: "high",
    price_change_trigger: "Annual increase",
    ...overrides
  };
}

export function makeReminder(overrides: Record<string, unknown> = {}) {
  return {
    id: "reminder-1",
    remind_at: "2099-01-01T00:00:00.000Z",
    status: "scheduled",
    created_at: "2026-05-02T00:00:00.000Z",
    ...overrides
  };
}

export function makeRenewalDecision(overrides: Record<string, unknown> = {}) {
  return {
    id: "decision-1",
    status: "renew",
    decision_date: "2026-06-01",
    summary: "Renewed",
    created_at: "2026-06-01T00:00:00.000Z",
    ...overrides
  };
}

export function makeNote(overrides: Record<string, unknown> = {}) {
  return {
    id: "note-1",
    body: "=sensitive note text that should not appear in basic export",
    author_user_id: "owner-1",
    created_at: "2026-06-02T00:00:00.000Z",
    ...overrides
  };
}

export function makeContract(overrides: Record<string, unknown> = {}) {
  return {
    id: "contract-1",
    organization_id: "org-1",
    status: "active",
    cycle_status: "awaiting_decision",
    status_tag: "active",
    owner_user_id: "owner-1",
    owner_name: "Jane Doe",
    department: "Finance",
    renewal_decision_status: "undecided",
    created_at: "2026-05-01T00:00:00.000Z",
    counterparty_id: "counterparty-1",
    contract_metadata: makeContractMetadata(),
    reminders: [makeReminder()],
    renewal_decisions: [makeRenewalDecision()],
    notes: [makeNote()],
    ...overrides
  };
}

export function makeBillingSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: "org-1",
    planTier: "growth",
    subscriptionStatus: "active",
    billingProvider: "paddle",
    trialEndsAt: null,
    subscriptionCurrentPeriodEnd: "2099-01-01T00:00:00.000Z",
    providerConfigured: true,
    ...overrides
  };
}

export function makeIntelligenceAccessState(overrides: Record<string, unknown> = {}) {
  return {
    riskBadge: { allowed: true, reason: "allowed" },
    riskExplanation: { allowed: true, reason: "allowed" },
    riskQueue: { allowed: true, reason: "allowed" },
    financialIntelligence: { allowed: true, reason: "allowed" },
    procurementAnalytics: { allowed: true, reason: "allowed" },
    ...overrides
  };
}

export function makeExportPresetScenario(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: "org-1",
    actorUserId: "user-1",
    presetId: "basic_contract_register",
    format: "csv",
    rowCount: 1,
    ...overrides
  };
}


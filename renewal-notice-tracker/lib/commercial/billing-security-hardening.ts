export type BillingSecuritySection = {
  title: string;
  summary: string;
  items: string[];
};

export const billingSecurityRiskMap: BillingSecuritySection = {
  title: "Risk map",
  summary: "Billing and entitlements are both revenue and security boundaries. Wrong behavior here leaks money, trust, and sometimes tenant access.",
  items: [
    "Checkout and billing-portal routes are privileged because they mutate or expose commercial control for an organization.",
    "Webhook handlers are effectively machine-authenticated admin actions and can corrupt subscription state if they accept replay, drift, or bad mapping.",
    "Entitlement enforcement is a backend authorization problem, not just a UI pricing problem.",
    "Downgrades, past_due, cancelled, and trialing transitions are the most likely places for entitlement drift and race conditions."
  ]
};

export const billingAbuseScenarios: BillingSecuritySection = {
  title: "Billing abuse scenarios",
  summary: "Assume motivated users will try to hit billing routes directly, replay webhooks, and retain paid access after downgrade.",
  items: [
    "A member or wrong-org admin hits checkout or portal routes directly and gains billing control they should not have.",
    "A user manipulates plan selection or sends an invalid plan slug to create inconsistent billing state.",
    "A customer keeps using paid features during plan transition, downgrade lag, or past_due ambiguity.",
    "An attacker or buggy integration replays webhook events and causes stale or duplicated state transitions.",
    "A multi-org user opens billing for the wrong active org because billing context is not explicit enough."
  ]
};

export const entitlementBypassScenarios: BillingSecuritySection = {
  title: "Entitlement bypass scenarios",
  summary: "Feature denial is only trustworthy if backend enforcement is authoritative and consistent under race conditions.",
  items: [
    "Feature gating exists in UI copy, but server actions still succeed if called directly.",
    "Entitlement checks use stale subscription state and allow temporary bypass during downgrade or failed payment.",
    "Contract-cap or usage-based limits are enforced on some creation paths but not all import/manual/upload paths.",
    "Admin rescue or internal routes expose premium capabilities without checking plan state.",
    "Exports, digests, manual contracts, or multi-recipient reminders can be triggered through less obvious paths even when the plan should deny them."
  ]
};

export const webhookRisks: BillingSecuritySection = {
  title: "Webhook risks",
  summary: "Signed webhooks are necessary but not sufficient. The danger is in replay, mapping, state transition logic, and response hygiene.",
  items: [
    "Signature validation passes, but the same provider event is processed multiple times.",
    "Customer or subscription mapping resolves to the wrong organization or an ambiguous one.",
    "Out-of-order webhook events move the organization to an older or impossible subscription state.",
    "Webhook error responses leak internal detail that helps attackers or causes provider retry confusion.",
    "Missing audit or alerting means billing drift is discovered only by customers."
  ]
};

export const webhookIdempotencyRequirements: BillingSecuritySection = {
  title: "Idempotency requirements",
  summary: "Billing webhooks and plan-state mutations need a real event ledger, not best-effort duplicate tolerance.",
  items: [
    "Persist canonical provider event id, provider name, processed_at, mapped organization id, and outcome.",
    "Reject or no-op duplicate event ids safely.",
    "Validate state transition monotonicity so older events cannot overwrite newer subscription state without explicit handling.",
    "Make checkout/session-creation side effects and webhook writes individually auditable and correlation-friendly.",
    "Apply the same idempotency discipline to manual billing sync or future admin commercial overrides."
  ]
};

export const billingHardeningRecommendations: BillingSecuritySection = {
  title: "Hardening recommendations",
  summary: "Keep billing authority narrow, state transitions explicit, and entitlement enforcement server-authoritative.",
  items: [
    "Keep checkout and portal access owner-only by default unless delegated purchasing is a deliberate business choice.",
    "Validate requested plan ids against a canonical allowlist and fail closed on unknown or unavailable plans.",
    "Move all entitlement checks into backend helpers used by every privileged feature path, not just the main UI.",
    "Add webhook event ledgering and state-transition validation before mutating organization billing state.",
    "Treat past_due and cancelled as degraded or denied feature states consistently across every gated action.",
    "Audit checkout started, portal opened, webhook synced, plan changed, denial shown, and denial bypass attempts with org and actor context.",
    "Use generic webhook and billing-route errors externally; keep detailed diagnostics in server logs and audit metadata only."
  ]
};

export const billingTestsNeeded: BillingSecuritySection = {
  title: "Tests needed",
  summary: "Billing safety needs negative tests and race-condition tests, not just happy-path subscription checks.",
  items: [
    "Checkout route denies non-members, members, and wrong-org users.",
    "Billing portal route denies non-members, members, and wrong-org users.",
    "Invalid plan requests fail closed and do not create checkout sessions.",
    "Webhook duplicate event replay does not mutate state twice.",
    "Out-of-order webhook events do not regress subscription state.",
    "Entitlement-denied actions fail backend-direct for exports, digests, manual contracts, and multi-recipient reminders.",
    "Downgrade or past_due transitions remove premium capability consistently across all feature entry points.",
    "Plan-state race tests prove creation/import/export paths do not bypass downgraded entitlements."
  ]
};

export const billingReleaseBlockers = [
  "Non-owner users can access checkout or portal routes.",
  "Wrong-org billing access is possible for multi-org users.",
  "Unknown or invalid plan identifiers can create or influence checkout state.",
  "Webhook processing is not idempotent.",
  "Out-of-order webhook events can regress subscription state.",
  "Paid feature enforcement is missing on any backend path for exports, digests, manual contracts, or multi-recipient reminders.",
  "Past_due or cancelled accounts can continue using premium features beyond intended grace behavior.",
  "Billing and entitlement changes are not audited with enough context to reconstruct incidents."
];

export const bestBillingSecurityApproach: BillingSecuritySection = {
  title: "Best implementation approach",
  summary: "Treat billing as privileged org administration plus machine-authenticated state sync, and keep entitlements authoritative on the server.",
  items: [
    "Owner-only commercial control by default.",
    "Canonical plan allowlist and canonical entitlement helper.",
    "Provider event ledger plus state-transition validation.",
    "Backend-denied premium actions everywhere, regardless of UI state.",
    "Audit and alert on anomalous billing access, webhook failures, and entitlement mismatches."
  ]
};

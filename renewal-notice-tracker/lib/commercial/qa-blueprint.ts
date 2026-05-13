export type QaBlueprintSection = {
  title: string;
  summary: string;
  items: string[];
};

export const unifiedQaBlueprint = {
  testStrategy: {
    title: "Test strategy",
    summary:
      "Use a risk-weighted test pyramid: heavy unit and integration coverage for trust-sensitive logic, executable E2E for the narrow set of business-critical journeys, and manual QA for ambiguity, incident response, and release sanity.",
    items: [
      "Bias automated coverage toward reminder trust, extraction/review correctness, entitlement enforcement, tenant isolation, and import/export correctness.",
      "Avoid vanity coverage on presentation-only components and strategy content that does not prove runtime safety.",
      "Treat high-power admin, billing, export, and rescue actions as backend security and trust surfaces, not just UI flows.",
      "Use manual QA to validate clarity, operator usability, and release readiness where automation is weaker."
    ]
  } satisfies QaBlueprintSection,
  riskMap: {
    title: "Risk map",
    summary:
      "The biggest product risks are missed or duplicated reminders, false trust in extraction, cross-org leakage, broken upgrades, and silent operational failures that users discover too late.",
    items: [
      "Product risk: core workflows degrade when contract creation, review, reminder creation, or filtering become unreliable.",
      "Trust risk: low-confidence or failed extraction is mistaken for reviewed truth, or reminders/digests fail silently.",
      "Commercial risk: plan gates, billing routes, or entitlements drift from pricing and subscription state.",
      "Reliability risk: retries, duplicate suppression, cron processing, and admin rescue paths fail under load or incidents.",
      "Release risk: flaky trust-sensitive tests create false confidence and allow regressions through."
    ]
  } satisfies QaBlueprintSection,
  unitTestPriorities: {
    title: "Unit test priorities",
    summary:
      "Unit tests should protect logic-heavy business behavior, not shallow render snapshots.",
    items: [
      "P0: entitlement logic, reminder date generation, escalation generation, import parsing/validation, export sanitization, ICS generation, lifecycle transitions, safe error mapping.",
      "P1: validation schemas, dashboard metric calculations, digest summary generation, evidence row generation.",
      "P2: business-impacting utilities not already covered transitively through higher-value tests.",
      "Do not unit test pure presentation markup, framework wiring, or simple SDK pass-through wrappers."
    ]
  } satisfies QaBlueprintSection,
  integrationTestPriorities: {
    title: "Integration test priorities",
    summary:
      "Integration tests are the main safety net for backend correctness across auth, persistence, reminders, billing, imports, and role-scoped actions.",
    items: [
      "P0: review updates and reminder regeneration, billing and entitlements, imports and job tracking, reminder cron processing, retry and duplicate suppression, org/membership/role behavior.",
      "P1: auth with Supabase session handling, upload/storage/extraction pipeline, exports, settings persistence, digest send flows.",
      "P2: contract creation paths already well covered transitively, unless touched by a risky change."
    ]
  } satisfies QaBlueprintSection,
  e2eSuite: {
    title: "E2E suite",
    summary:
      "End-to-end coverage should stay narrow and ruthless: protect the journeys that prove activation, trust, permission boundaries, and monetization.",
    items: [
      "P0 journeys: sign up/sign in/auth callback, first-time onboarding, upload and review extraction, bulk import, create reminder, export CSV/XLSX, billing checkout and post-upgrade flow, admin debug actions, permission restrictions by role.",
      "P1 journeys: create manual contract, assign owner and status, apply reminder rule and escalation, open pricing and upgrade path, send monthly digest, contract filtering/detail flow, renewal decision and notes.",
      "P2 journeys: playbook attachment and step completion until workflow depth becomes more revenue-critical.",
      "Convert blueprint-only journeys into executable Playwright coverage for the top P0 paths first."
    ]
  } satisfies QaBlueprintSection,
  manualQaPlan: {
    title: "Manual QA plan",
    summary:
      "Manual QA should validate smoke health, release regressions, billing safety, permission boundaries, reminder reliability, import/export correctness, extraction/review trust, admin usability, settings safety, and UX clarity.",
    items: [
      "Run smoke, permissions, billing, reminder reliability, import/export, and extraction/review checklists on every release candidate.",
      "Use admin/debug and UX sanity checklists to validate operator usability and customer-facing clarity before production.",
      "Every manual item should define steps, expected result, severity, and whether it blocks release."
    ]
  } satisfies QaBlueprintSection,
  releaseGates: {
    title: "Release gates",
    summary:
      "Gate releases by business risk, not raw test volume.",
    items: [
      "Minimum PR merge gates: passing typecheck, changed-area unit/integration coverage, targeted trust-sensitive tests for changed reminders/billing/permissions/extraction/exports, and human review.",
      "Minimum release gates: full merge-gate suite, staging verification on critical journeys, no open P0 defects in reminders, permissions, billing, extraction/review, or tenant isolation, and confirmed smoke/rollback plan.",
      "Never skip: typecheck, trust-sensitive targeted tests, authorization checks, commercial entitlement checks, and post-deploy smoke on core workflows.",
      "Can skip for fast iteration: broad visual passes, P2 scenarios, long-tail staging checks, and non-critical performance stress if unrelated."
    ]
  } satisfies QaBlueprintSection,
  observabilityChecks: {
    title: "Observability checks",
    summary:
      "QA is incomplete if operators cannot explain what happened after a failure. Observability must cover reminders, notifications, digests, billing state, failures, and admin rescue actions.",
    items: [
      "Reminder/admin checks: failed reminders, attempt counts, next retry times, duplicate suppression behavior, resend/rerun traces, and notification logs must be visible.",
      "Extraction/review checks: processing errors, low-confidence state, evidence fidelity, and review queue counts must reconcile with persisted data.",
      "Commercial checks: checkout, plan changes, denials, exports, digests, and billing portal actions must be auditable by organization and plan state.",
      "Analytics checks: high-value events must reconcile with persisted state and remain deduplicated and correctly attributed."
    ]
  } satisfies QaBlueprintSection,
  topNextActions: {
    title: "Top 10 next actions",
    summary:
      "These are the highest-ROI moves to convert strategy into real runtime confidence.",
    items: [
      "Stabilize or replace the flaky reminder-route coverage with a deterministic trust-sensitive integration suite.",
      "Implement executable Playwright coverage for signup-to-first-value, upload/review, and upgrade/unlock P0 journeys.",
      "Add backend-direct negative authorization tests for admin, billing, export, settings, and rescue actions.",
      "Create a dirty-data import fixture pack with partial failures, duplicate-like rows, and date-format ambiguity.",
      "Add cross-org export payload assertions, not just status-code assertions.",
      "Add webhook idempotency and out-of-order status transition tests.",
      "Build extraction/review golden fixtures for low-confidence, ambiguous clause, missing-date, and corrected-date scenarios.",
      "Tie release blockers to concrete named tests in CI rather than checklist language alone.",
      "Add runtime analytics reconciliation tests for activation, gate, checkout, and reminder events.",
      "Automate staging smoke checks for auth, dashboard, upload/review, reminder, export, billing, and admin rescue flows."
    ]
  } satisfies QaBlueprintSection,
  mustBlockRelease: {
    title: "What must block release",
    summary:
      "Anything that breaks reminder trust, leaks tenant data, corrupts billing state, or creates false confidence in extraction must block release.",
    items: [
      "Missed, duplicated, or silently failing reminders and digests.",
      "Cross-org access to contracts, exports, billing, settings, or admin/debug tools.",
      "Paid feature bypass on lower plans or false denial on entitled customers.",
      "Webhook or billing state drift that breaks upgrades, downgrades, or cancellations.",
      "Low-confidence or failed extraction being treated as trusted reviewed truth.",
      "Review corrections not becoming canonical or not regenerating reminders correctly.",
      "Import/export corruption or silent partial-failure handling on trust-sensitive outputs.",
      "Core analytics or audit blind spots that make critical failures or commercial behavior invisible post-release."
    ]
  } satisfies QaBlueprintSection
};


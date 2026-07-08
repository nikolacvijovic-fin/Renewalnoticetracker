export type QaRedTeamRisk = {
  title: string;
  whyItIsDangerous: string;
  severity: "P0" | "P1" | "P2";
};

export const qaRedTeamReview = {
  brutalCritique:
    "The QA strategy is much stronger on documented intent than on proven execution. There is now a lot of testing architecture in the repo, but the product could still ship with false confidence if the team mistakes strategy artifacts and targeted content tests for coverage of the real trust-sensitive runtime paths.",
  topWeaknesses: [
    "Too much strategy-surface coverage can create the illusion that quality improved more than runtime confidence actually did.",
    "Reminder reliability now has deterministic route-level coverage, but it remains a trust-sensitive path that should stay boring and release-gated.",
    "E2E coverage is still blueprint-heavy and implementation-light for the highest-risk user journeys.",
    "Permission strategy is strong on paper, but direct action-level abuse cases remain easy to miss unless backed by concrete negative tests.",
    "Extraction/review trust depends on subtle state transitions and confidence handling that are more fragile than the current executed suite suggests.",
    "Import and export correctness are still vulnerable to real-world dirty data and large-file edge cases that strategy docs alone do not catch.",
    "Commercial QA can still miss drift between pricing copy, entitlement helpers, and route-level gating.",
    "Analytics QA is at risk of validating event catalogs more than validating the actual runtime correctness of emitted events.",
    "Release quality is still exposed if trust-sensitive tests are allowed to drift out of the release gate.",
    "The current safety model is better at describing what should block release than automatically proving those release blockers are actually covered."
  ],
  topMissingTests: [
    "Executable E2E test for signup to first reviewed, owned, reminder-backed contract.",
    "Executable E2E test for review correction changing reminders and downstream contract state.",
    "Executable negative test matrix for direct unauthorized server-action invocation across admin, billing, export, and settings actions.",
    "Stable reminder cron route test covering unauthorized, authorized, mixed-success, and duplicate-suppression scenarios.",
    "Import integration test using a dirtier multi-row fixture with partial failures, duplicate-like rows, and date-format ambiguity.",
    "Cross-org export denial test that inspects downloaded payload contents, not just status code.",
    "Webhook idempotency and out-of-order status transition test with realistic provider payload sequences.",
    "Extraction/review test for ambiguous clause plus low-confidence field behavior across review queue, status, and reminder generation.",
    "Analytics runtime assertion tests that emitted events reconcile to actual persisted state for high-value milestones.",
    "Staging or smoke automation for the production-like release-critical path instead of relying mostly on manual intent."
  ],
  whatMustChangeImmediately: [
    "Keep deterministic reminder-route and processor coverage in the trust-sensitive release gate.",
    "Convert the top P0 E2E journeys from strategy-only into executable Playwright coverage.",
    "Add backend-direct negative authorization tests for every high-power admin, billing, export, and rescue action.",
    "Tie release blockers to concrete named tests rather than only to checklist language.",
    "Prove extraction-review-reminder correctness with a golden-path and ambiguous-path fixture set."
  ],
  revisedPriorities: [
    "First: executed trust-sensitive coverage for reminders, review/reminder regeneration, billing/webhook sync, and cross-org denial.",
    "Second: executable E2E coverage for signup-to-first-value, import-to-review, and upgrade-to-unlocked-feature journeys.",
    "Third: dirty-data import/export realism and negative permission abuse cases.",
    "Fourth: runtime analytics QA tied to persisted state and billing truth, not just taxonomy validation.",
    "Fifth: only after that, expand broader UI regression and lower-risk admin strategy checks."
  ]
};

export const qaRedTeamRisks: QaRedTeamRisk[] = [
  {
    title: "Strategy coverage is being mistaken for runtime coverage",
    whyItIsDangerous:
      "The repo now has many well-structured QA modules and admin surfaces, but those tests mostly prove the strategy content renders and exports correctly. That does not automatically increase confidence in the production code paths.",
    severity: "P0"
  },
  {
    title: "Reminder trust must remain deterministically tested",
    whyItIsDangerous:
      "Reminder dispatch is central to the trust loop; any return of timing-sensitive or under-owned route coverage should block release.",
    severity: "P0"
  },
  {
    title: "Direct backend abuse cases can still slip through",
    whyItIsDangerous:
      "If backend actions are mostly defended by page-level or UI-level tests, unauthorized callers can still reach dangerous mutations directly.",
    severity: "P0"
  },
  {
    title: "Dirty-data realism is under-proven",
    whyItIsDangerous:
      "Imports and extraction behavior often fail on messy customer data, not on happy-path fixtures. Without ugly fixtures, support-heavy failures will still surprise the team.",
    severity: "P1"
  },
  {
    title: "Analytics QA could validate the plan more than the events",
    whyItIsDangerous:
      "It is easy to prove the event schema exists while missing that real emitted events are duplicated, absent, or mis-scoped in runtime flows.",
    severity: "P1"
  }
];

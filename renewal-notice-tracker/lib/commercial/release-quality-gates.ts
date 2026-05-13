export type ReleaseQualitySection = {
  area: string;
  items: string[];
};

export const releaseQualitySections: ReleaseQualitySection[] = [
  {
    area: "pre-commit checks",
    items: [
      "Typecheck on changed code paths.",
      "Fast unit and integration tests relevant to changed files.",
      "Lint on changed surfaces where available.",
      "No committed secrets, test-only credentials, or broken snapshots."
    ]
  },
  {
    area: "pre-merge checks",
    items: [
      "Full typecheck.",
      "Core Vitest suite for business logic, billing, permissions, and analytics/admin strategy surfaces.",
      "Required trust-sensitive route tests for reminders, exports, billing, and permissions.",
      "Targeted Playwright or browser checks for changed high-risk user journeys."
    ]
  },
  {
    area: "branch protection rules",
    items: [
      "Require passing CI status checks before merge.",
      "Require at least one human review for production-facing changes.",
      "Disallow direct pushes to protected main/release branches.",
      "Require linear history or merge policy that preserves traceability."
    ]
  },
  {
    area: "test suites by stage",
    items: [
      "Local/PR: typecheck, fast unit/integration, changed-area tests.",
      "Merge gate: broader integration coverage plus trust-sensitive smoke tests.",
      "Release candidate: staging verification, critical E2E journeys, reminder and billing checks.",
      "Post-deploy: production smoke checks and telemetry sanity review."
    ]
  },
  {
    area: "staging verification",
    items: [
      "Run critical auth, upload/review, reminder, export, billing, and admin rescue journeys against staging.",
      "Verify staging has realistic seeded data for active org, failed reminder, import error, and paid-plan scenarios.",
      "Confirm cron-safe paths in a controlled way without harming real customer data."
    ]
  },
  {
    area: "release checklist",
    items: [
      "Confirm no known release-blocking reminder, permission, billing, or extraction regressions remain open.",
      "Verify schema/config/env changes are applied and reversible.",
      "Review top error, failure, and denial dashboards before release.",
      "Record what changed, what was verified, and rollback trigger owners."
    ]
  },
  {
    area: "production smoke checks",
    items: [
      "Auth and dashboard load.",
      "Contract list and contract detail open on a safe internal test org.",
      "Export gate and billing CTA behavior on known test states.",
      "Reminder/admin failure views still render for seeded internal scenarios.",
      "Core telemetry and error-rate sanity immediately after deployment."
    ]
  },
  {
    area: "rollback criteria",
    items: [
      "Reminder processing is broken, duplicated, or silently delayed.",
      "Cross-org or role-based authorization regression is detected.",
      "Billing, entitlement, or upgrade path is broken for active customers.",
      "Extraction/review workflow creates false trust or loses corrections.",
      "Production error rate or latency materially spikes on core workflows."
    ]
  },
  {
    area: "hotfix process",
    items: [
      "Use a narrowly scoped branch and PR, even for urgent fixes where feasible.",
      "Run the minimum trust-sensitive test subset for the affected area before deploy.",
      "Verify production smoke checks immediately after hotfix release.",
      "Backfill missing regression tests right after incident stabilization."
    ]
  }
];

export const minimumPrMergeGates = [
  "Passing typecheck.",
  "Passing fast unit/integration suite for touched logic.",
  "Passing trust-sensitive targeted tests if reminders, billing, permissions, extraction/review, or exports changed.",
  "At least one reviewer for production-facing code."
];

export const minimumReleaseGates = [
  "Passing full merge-gate suite.",
  "Passing release-candidate staging verification on critical journeys.",
  "No open P0 defects in reminders, permissions, billing, extraction/review, or tenant isolation.",
  "Production smoke plan and rollback owner confirmed."
];

export const whatCanBeSkippedInFastIteration = [
  "Broad visual regression passes for unrelated screens.",
  "Nightly-only P2 scenarios and deep admin strategy-content checks.",
  "Non-critical performance stress tests when no performance-sensitive code changed.",
  "Long-tail staging checks unrelated to the changed area."
];

export const whatMustNeverBeSkipped = [
  "Typecheck for release-bound code.",
  "Targeted trust-sensitive tests for changed reminder, billing, permission, extraction/review, or export logic.",
  "Authorization checks for admin, billing, and cross-org data paths.",
  "Commercial and entitlement checks when pricing or plan behavior changed.",
  "Post-deploy smoke checks on core workflows."
];

export const deploymentConfidenceModel = {
  name: "risk-weighted release confidence",
  principles: [
    "Gate by business risk, not by raw test count.",
    "Treat reminder, authorization, billing, and extraction-review regressions as release-critical.",
    "Allow faster iteration on isolated low-risk UI or content changes with narrower checks.",
    "Use staging to prove critical journeys end-to-end before production release."
  ],
  confidenceTiers: [
    "Low-risk change: typecheck + changed-area tests + light smoke.",
    "Medium-risk change: typecheck + targeted integration + relevant UI/E2E smoke + reviewer approval.",
    "High-risk change: full targeted suites, staging verification, explicit rollback plan, and post-deploy smoke."
  ]
};


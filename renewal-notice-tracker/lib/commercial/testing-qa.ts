export type TestingMaturityScore = {
  area:
    | "unit_testing"
    | "integration_testing"
    | "e2e_testing"
    | "permissions_security_testing"
    | "billing_commercial_testing"
    | "reminder_reliability_testing"
    | "extraction_review_testing"
    | "ui_regression_testing"
    | "release_confidence"
    | "overall_qa_maturity";
  label: string;
  score: number;
  rationale: string;
};

export type QaStrategySection = {
  title: string;
  objective: string;
  priorities: string[];
};

export type TestDomainCoverage = {
  domain: string;
  criticalPaths: string[];
  majorRisks: string[];
  unitTestsNeeded: string[];
  integrationTestsNeeded: string[];
  e2eTestsNeeded: string[];
  manualQaNeeded: string[];
};

export type AutomatedTestDefinition = {
  testName: string;
  level: "unit" | "integration" | "e2e";
  whatItProves: string;
  whyItMatters: string;
  priority: "P0" | "P1" | "P2";
  blocksRelease: boolean;
};

export type ManualQaChecklist = {
  title: string;
  checks: string[];
};

export type ReleaseQualityRule = {
  title: string;
  items: string[];
};

export const testingCurrentStateReview = {
  existingCoverage: [
    "Vitest unit and integration coverage for billing routes, billing providers, entitlements, webhooks, imports, exports, reminder logic, reminder gating, digest cron, and several UI components.",
    "Admin strategy surfaces are heavily covered by content-level tests.",
    "Commercial and analytics definitions are covered by strategy-structure tests."
  ],
  partiallyCovered: [
    "Reminder processing and cron authorization are covered by deterministic route and processor tests, but the path should remain release-gated.",
    "Permissions are partially covered through auth guards and permission tests, but deeper tenant-isolation scenarios are still thin.",
    "Review and extraction validation are covered in parts, but full extraction-to-review correctness is not deeply exercised."
  ],
  underTested: [
    "End-to-end user journeys from signup to first value to paid.",
    "Cross-org multi-tenant isolation across reads, writes, exports, and admin/debug surfaces.",
    "Reminder reliability under retries, duplicates, lag, and failure recovery at system level.",
    "Import edge cases with malformed spreadsheets, partial row failure, duplicate rows, and rollback behavior.",
    "UI regression and release-quality checks across key dashboards and contract workflows.",
    "Security-sensitive settings, role changes, and org membership transitions."
  ],
  highestRiskFlows: [
    "Reminder generation, dispatch, retry, and duplicate suppression.",
    "Extraction plus human review correctness for notice dates and reminder recommendations.",
    "Billing checkout, entitlement enforcement, and plan transitions.",
    "Spreadsheet import and export correctness.",
    "Permissions and tenant isolation on contract data and admin/debug tooling."
  ],
  trustSensitiveAreas: [
    "Wrong notice or renewal dates reaching reminders.",
    "Missed, late, or duplicate reminders.",
    "Cross-tenant data leakage.",
    "Entitlement bypass or incorrect commercial denial.",
    "Import corruption or misleading export data."
  ],
  assumptions: [
    "Playwright exists in dependencies but there is little or no committed e2e coverage yet.",
    "The current test suite is mostly unit/integration and is run in Vitest.",
    "The former send-reminders timeout warning is now covered by deterministic route tests, but reminder regressions remain release-critical.",
    "Staging/production monitoring is not yet encoded as a strict release gate."
  ]
};

export const testingMaturityScores: TestingMaturityScore[] = [
  {
    area: "unit_testing",
    label: "Unit testing maturity",
    score: 7,
    rationale: "There is broad unit coverage for business logic, validation, entitlements, and strategy modules."
  },
  {
    area: "integration_testing",
    label: "Integration testing maturity",
    score: 6,
    rationale: "Several route and action tests exist, but full workflow integration coverage is still uneven."
  },
  {
    area: "e2e_testing",
    label: "End-to-end testing maturity",
    score: 2,
    rationale: "Playwright is present, but there is no visible committed e2e safety net for critical user journeys."
  },
  {
    area: "permissions_security_testing",
    label: "Permissions/security testing maturity",
    score: 5,
    rationale: "Some guard coverage exists, but tenant isolation and role-transition depth look under-tested."
  },
  {
    area: "billing_commercial_testing",
    label: "Billing/commercial testing maturity",
    score: 7,
    rationale: "Billing routes, providers, webhooks, and entitlement logic are relatively well covered."
  },
  {
    area: "reminder_reliability_testing",
    label: "Reminder/reliability testing maturity",
    score: 7,
    rationale: "Core reminder logic, cron authorization, empty results, mixed outcomes, and duplicate suppression are now covered deterministically, with deeper end-to-end delivery evidence still needed."
  },
  {
    area: "extraction_review_testing",
    label: "Extraction/review testing maturity",
    score: 4,
    rationale: "Validation exists, but correctness of extraction-review workflows remains under-proven."
  },
  {
    area: "ui_regression_testing",
    label: "UI regression testing maturity",
    score: 3,
    rationale: "A few component tests exist, but there is no real regression harness for key flows or layouts."
  },
  {
    area: "release_confidence",
    label: "Release confidence",
    score: 5,
    rationale: "The suite is stronger after deterministic reminder coverage and required P0 fixture validation, but release trust still depends on seeded browser evidence in staging."
  },
  {
    area: "overall_qa_maturity",
    label: "Overall QA maturity",
    score: 5,
    rationale: "Better than a startup with no tests, but still not robust enough for a trust-sensitive workflow product."
  }
];

export const qaStrategySections: QaStrategySection[] = [
  {
    title: "Unit tests",
    objective: "Protect pure business logic, validation, entitlements, lifecycle transitions, and template/rule logic.",
    priorities: [
      "Contract lifecycle and status transitions",
      "Reminder scheduling and escalation builders",
      "Extraction normalization and evidence building",
      "Billing entitlements and commercial denial rules"
    ]
  },
  {
    title: "Integration tests",
    objective: "Prove real route, action, database-shape, and provider-adapter behavior without requiring a browser.",
    priorities: [
      "Imports and exports",
      "Billing checkout/manage/webhook flows",
      "Reminder cron and digest cron",
      "Review and reminder regeneration"
    ]
  },
  {
    title: "End-to-end tests",
    objective: "Protect trust-sensitive user journeys across auth, dashboard, contracts, review, reminders, and billing.",
    priorities: [
      "Signup to first value",
      "Import to review to reminder",
      "Upgrade from gate to paid plan",
      "Role-based access and tenant isolation"
    ]
  },
  {
    title: "Permissions and security tests",
    objective: "Guarantee tenant isolation, role safety, and admin boundary correctness.",
    priorities: [
      "Cross-org contract access denial",
      "Role-based settings restrictions",
      "Export and admin route authorization",
      "Webhook and cron secret handling"
    ]
  },
  {
    title: "Reliability and observability tests",
    objective: "Prove reminders, retries, digests, and failure visibility behave correctly under stress and error.",
    priorities: [
      "Retry idempotency",
      "Duplicate suppression",
      "Cron unauthorized access",
      "Failure logging and admin rescue visibility"
    ]
  }
];

export const testCoverageMap: TestDomainCoverage[] = [
  {
    domain: "auth",
    criticalPaths: ["signup", "login", "auth page validation", "session-based route access"],
    majorRisks: ["unauthorized access", "broken onboarding attribution", "weak route guarding"],
    unitTestsNeeded: ["auth validation edge cases", "redirect/state helpers"],
    integrationTestsNeeded: ["protected route behavior", "signup creates organization and trial context"],
    e2eTestsNeeded: ["signup to dashboard", "unauthenticated redirect behavior"],
    manualQaNeeded: ["login/logout sanity", "expired session handling"]
  },
  {
    domain: "onboarding",
    criticalPaths: ["first upload", "first review", "first owner", "first reminder", "first live obligation"],
    majorRisks: ["weak activation hidden by setup activity", "users stuck before first value"],
    unitTestsNeeded: ["onboarding checklist state derivation"],
    integrationTestsNeeded: ["dashboard first-value prompts and gating"],
    e2eTestsNeeded: ["new workspace reaches first value", "stalled onboarding sees rescue prompts"],
    manualQaNeeded: ["trial UX flow", "first-value messaging review"]
  },
  {
    domain: "org/membership",
    criticalPaths: ["org membership lookup", "role enforcement", "settings visibility"],
    majorRisks: ["cross-tenant data exposure", "admin-only actions visible to non-admins"],
    unitTestsNeeded: ["role helper behavior"],
    integrationTestsNeeded: ["settings/admin pages by role", "membership-based route protection"],
    e2eTestsNeeded: ["admin vs member capabilities", "cross-org access denial"],
    manualQaNeeded: ["role-change smoke test"]
  },
  {
    domain: "upload/manual creation",
    criticalPaths: ["file upload", "manual contract creation", "capacity gating"],
    majorRisks: ["contract-cap bypass", "bad fallback metadata", "broken creation flow"],
    unitTestsNeeded: ["fallback metadata behavior", "capacity calculation"],
    integrationTestsNeeded: ["upload action success/failure", "manual creation denial by plan"],
    e2eTestsNeeded: ["upload to contract detail", "manual creation on allowed and denied plans"],
    manualQaNeeded: ["large-file and malformed-file checks"]
  },
  {
    domain: "spreadsheet import",
    criticalPaths: ["parse", "normalize", "partial failure handling", "job status reporting"],
    majorRisks: ["silent row loss", "wrong date import", "duplicate contracts", "support-heavy edge cases"],
    unitTestsNeeded: ["normalization edge cases", "date parsing", "duplicate handling"],
    integrationTestsNeeded: ["import job lifecycle", "partial success with errors", "capacity enforcement on import"],
    e2eTestsNeeded: ["messy CSV import to review queue", "import with commercial limit reached"],
    manualQaNeeded: ["real customer sample CSV pass", "Excel export/import round-trip"]
  },
  {
    domain: "extraction",
    criticalPaths: ["text extraction", "metadata extraction", "failure recording", "confidence handling"],
    majorRisks: ["wrong notice dates", "missing key dates", "silent extraction degradation"],
    unitTestsNeeded: ["extractor fallbacks", "field normalization", "confidence threshold logic"],
    integrationTestsNeeded: ["API extract route success/failure", "processing error persistence"],
    e2eTestsNeeded: ["upload PDF -> extraction -> review queue"],
    manualQaNeeded: ["golden document set review for real contracts"]
  },
  {
    domain: "review",
    criticalPaths: ["review form submit", "status transition", "evidence rows", "reminder regeneration"],
    majorRisks: ["approved wrong data", "review does not update reminders", "evidence mismatch"],
    unitTestsNeeded: ["review schema edge cases", "status transition rules"],
    integrationTestsNeeded: ["review action updates metadata and evidence", "review regenerates system reminders"],
    e2eTestsNeeded: ["review extracted contract and confirm due-soon output"],
    manualQaNeeded: ["review UX sanity with low-confidence contract"]
  },
  {
    domain: "reminders",
    criticalPaths: ["manual reminder creation", "system reminder generation", "dispatch", "retry", "duplicate suppression"],
    majorRisks: ["missed reminders", "duplicate reminders", "wrong recipients", "late reminders"],
    unitTestsNeeded: ["reminder recommendation logic", "retry/backoff rules", "recipient dedupe"],
    integrationTestsNeeded: ["cron route", "notification policy", "authorized vs unauthorized behavior"],
    e2eTestsNeeded: ["create reminder and observe scheduled state", "edit contract and verify reminder updates"],
    manualQaNeeded: ["clock-based reminder sanity", "recipient correctness verification"]
  },
  {
    domain: "rules/escalations",
    criticalPaths: ["multi-recipient rules", "escalation chains", "plan gating"],
    majorRisks: ["gated feature bypass", "wrong escalation recipients", "broken chain building"],
    unitTestsNeeded: ["escalation builder", "recipient limit rules"],
    integrationTestsNeeded: ["multi-recipient denial on low plans", "escalation persistence"],
    e2eTestsNeeded: ["Growth-only escalation flow"],
    manualQaNeeded: ["real escalation preview verification"]
  },
  {
    domain: "exports/ICS",
    criticalPaths: ["CSV export", "XLSX export", "ICS route", "commercial denial"],
    majorRisks: ["wrong exported data", "unauthorized export", "calendar drift"],
    unitTestsNeeded: ["export field mapping", "ICS formatting"],
    integrationTestsNeeded: ["CSV/XLSX/ICS route auth and payloads"],
    e2eTestsNeeded: ["export from allowed plan", "export denied from blocked plan"],
    manualQaNeeded: ["open exported spreadsheet and ICS in real clients"]
  },
  {
    domain: "digest",
    criticalPaths: ["digest eligibility", "digest content generation", "cron dispatch"],
    majorRisks: ["wrong recipient list", "digest sends to ineligible orgs", "empty or misleading digest"],
    unitTestsNeeded: ["digest eligibility logic"],
    integrationTestsNeeded: ["monthly digest cron behavior", "plan gating"],
    e2eTestsNeeded: ["digest-enabled org receives correct summary in staging"],
    manualQaNeeded: ["digest email content spot checks"]
  },
  {
    domain: "counterparties/templates/playbooks",
    criticalPaths: ["counterparty creation", "template application", "playbook runs"],
    majorRisks: ["wrong deadline calculation", "template offset bugs", "playbooks adding complexity without correctness"],
    unitTestsNeeded: ["template deadline math", "playbook schema behavior"],
    integrationTestsNeeded: ["template application on contract updates"],
    e2eTestsNeeded: ["apply template and validate resulting reminder dates"],
    manualQaNeeded: ["template edge-case walkthrough"]
  },
  {
    domain: "billing/entitlements",
    criticalPaths: ["checkout", "portal/manage", "webhooks", "feature enforcement", "contract caps"],
    majorRisks: ["under/over-entitlement", "wrong plan state", "commercial bypass", "revenue leakage"],
    unitTestsNeeded: ["entitlement rules", "contract tracking limits", "provider resolution"],
    integrationTestsNeeded: ["checkout/manage/webhook routes", "denial audit logs"],
    e2eTestsNeeded: ["upgrade from gate to paid", "plan downgrade effect on features"],
    manualQaNeeded: ["billing-provider smoke checklist", "annual/monthly term sanity"]
  },
  {
    domain: "admin/debug",
    criticalPaths: ["failed reminder visibility", "resend/rerun actions", "import failure visibility"],
    majorRisks: ["sensitive data exposure", "admin rescue action failure", "ops blind spots"],
    unitTestsNeeded: ["admin helper permissions"],
    integrationTestsNeeded: ["admin actions by role", "failure data rendering"],
    e2eTestsNeeded: ["admin-only debug access", "rerun/resend happy path in staging"],
    manualQaNeeded: ["incident drill checklist"]
  },
  {
    domain: "analytics instrumentation",
    criticalPaths: ["commercial events", "activation milestones", "idempotency-sensitive events"],
    majorRisks: ["false dashboards", "duplicate events", "missing source attribution"],
    unitTestsNeeded: ["event payload builders", "snapshot derivation"],
    integrationTestsNeeded: ["critical route emits expected events"],
    e2eTestsNeeded: ["signup to first value to checkout analytics smoke test"],
    manualQaNeeded: ["dashboard vs raw data reconciliation"]
  },
  {
    domain: "settings/integrations",
    criticalPaths: ["billing settings", "notification settings", "integrations visibility"],
    majorRisks: ["wrong settings exposed", "integration confusion", "billing self-serve broken"],
    unitTestsNeeded: ["settings UI state helpers"],
    integrationTestsNeeded: ["settings page renders by role and provider"],
    e2eTestsNeeded: ["settings manage billing path"],
    manualQaNeeded: ["provider-specific settings review"]
  },
  {
    domain: "permissions/tenant isolation",
    criticalPaths: ["contract read/write isolation", "export isolation", "admin isolation", "settings isolation"],
    majorRisks: ["catastrophic cross-tenant leak", "member can modify admin-only settings"],
    unitTestsNeeded: ["authorization utility coverage"],
    integrationTestsNeeded: ["cross-org access denied across routes and actions"],
    e2eTestsNeeded: ["two-org isolation scenario"],
    manualQaNeeded: ["tenant-leak exploratory pass before release"]
  },
  {
    domain: "failure/retry logic",
    criticalPaths: ["processing error recording", "retry windows", "max attempts", "terminal failure visibility"],
    majorRisks: ["silent failure", "infinite retry loops", "duplicate retries", "missed operator visibility"],
    unitTestsNeeded: ["retry policy rules", "processing error sanitization"],
    integrationTestsNeeded: ["failed reminder to retry to terminal state", "error recording"],
    e2eTestsNeeded: ["staging chaos test for transient notification failure"],
    manualQaNeeded: ["ops retry incident rehearsal"]
  }
];

export const automatedTestPlan: AutomatedTestDefinition[] = [
  {
    testName: "Contract review regenerates system reminders correctly",
    level: "integration",
    whatItProves: "Reviewed metadata flows through to reminder regeneration without stale system reminders.",
    whyItMatters: "Wrong reminder regeneration directly harms trust.",
    priority: "P0",
    blocksRelease: true
  },
  {
    testName: "Cross-tenant contract export is denied",
    level: "integration",
    whatItProves: "One organization cannot export another organization's contract data.",
    whyItMatters: "Multi-tenant isolation failure is catastrophic.",
    priority: "P0",
    blocksRelease: true
  },
  {
    testName: "Signup to first-value happy path",
    level: "e2e",
    whatItProves: "A new workspace can reach upload, review, owner, reminder, and live obligation successfully.",
    whyItMatters: "This is the product's core conversion path.",
    priority: "P0",
    blocksRelease: true
  },
  {
    testName: "Reminder cron unauthorized request returns fast 401",
    level: "integration",
    whatItProves: "Cron auth guard rejects bad secrets reliably and does not invoke processing.",
    whyItMatters: "Current flakiness here weakens trust in release quality for reminder infrastructure.",
    priority: "P0",
    blocksRelease: true
  },
  {
    testName: "Reminder retry path is idempotent",
    level: "integration",
    whatItProves: "Retry logic does not create duplicate sends or inconsistent terminal states.",
    whyItMatters: "Duplicate or missed reminders are one of the worst trust failures in the product.",
    priority: "P0",
    blocksRelease: true
  },
  {
    testName: "Import partial failure preserves valid rows and surfaces invalid rows",
    level: "integration",
    whatItProves: "Messy spreadsheets do not silently corrupt or drop data.",
    whyItMatters: "Import correctness is core to SMB/mid-market onboarding trust.",
    priority: "P0",
    blocksRelease: true
  },
  {
    testName: "Billing webhook plan transition updates entitlements",
    level: "integration",
    whatItProves: "Paid plan changes correctly affect feature access and contract caps.",
    whyItMatters: "Revenue and user trust both depend on correct commercial state.",
    priority: "P0",
    blocksRelease: true
  },
  {
    testName: "Extraction failure is visible and review fallback remains safe",
    level: "integration",
    whatItProves: "Extraction failures do not silently pass bad metadata forward.",
    whyItMatters: "Trust-sensitive dates must fail visibly and safely.",
    priority: "P0",
    blocksRelease: true
  },
  {
    testName: "ICS export reflects reviewed contract dates only",
    level: "integration",
    whatItProves: "Calendar output uses trusted workflow state.",
    whyItMatters: "External calendar corruption damages trust fast.",
    priority: "P1",
    blocksRelease: false
  },
  {
    testName: "Growth-only escalation flow is enforced end-to-end",
    level: "e2e",
    whatItProves: "Lower plans are denied and Growth plans can configure escalations successfully.",
    whyItMatters: "Commercial gating and collaboration value must both work.",
    priority: "P1",
    blocksRelease: false
  }
];

export const manualQaChecklists: ManualQaChecklist[] = [
  {
    title: "Smoke testing",
    checks: [
      "Login as admin and load dashboard",
      "Create or upload one contract",
      "Review one contract and confirm owner/reminder state",
      "Open contracts list and contract detail",
      "Open settings and billing controls"
    ]
  },
  {
    title: "Release testing",
    checks: [
      "Run new-workspace first-value path",
      "Run import with realistic CSV",
      "Run export and ICS checks",
      "Verify admin/debug pages load for admin and deny non-admin",
      "Confirm no known flaky tests are ignored without decision"
    ]
  },
  {
    title: "Billing testing",
    checks: [
      "Checkout starts with correct target plan",
      "Webhook updates subscription state",
      "Blocked features show correct denial and upgrade path",
      "Manage billing portal opens when configured",
      "Plan downgrade changes UI and limits"
    ]
  },
  {
    title: "Reminder testing",
    checks: [
      "Create manual reminder and inspect recipients",
      "Review contract and confirm system reminders regenerate",
      "Verify due-soon reminders appear in admin/debug state",
      "Check retry and failed-send visibility",
      "Verify no duplicate reminders on repeated edits"
    ]
  },
  {
    title: "Import/export testing",
    checks: [
      "Import clean CSV",
      "Import messy CSV with partial row errors",
      "Verify imported rows on contracts page",
      "Export CSV and XLSX and open both",
      "Download ICS and inspect dates in a calendar client"
    ]
  },
  {
    title: "Role/permission testing",
    checks: [
      "Member cannot access admin page",
      "Member cannot use admin actions",
      "Wrong org cannot access another org contract by URL",
      "Blocked plan cannot access gated features",
      "Admin retains billing manage access"
    ]
  },
  {
    title: "Reliability/admin testing",
    checks: [
      "Open admin page and verify failures render",
      "Rerun reminder action works on failed item in staging",
      "Resend notification action works on failed notification in staging",
      "Import failures are visible and readable",
      "Health endpoint responds"
    ]
  },
  {
    title: "Regression testing",
    checks: [
      "Contracts list filters still work",
      "Review form still renders evidence and reminder guidance",
      "Upload form still shows plan-aware commercial guidance",
      "Dashboard still shows onboarding and retention panels",
      "Marketing pricing and services pages still render"
    ]
  }
];

export const releaseQualitySystem: ReleaseQualityRule[] = [
  {
    title: "Pre-merge test gates",
    items: [
      "Typecheck must pass",
      "P0 unit/integration suite must pass",
      "Changed trust-sensitive areas must include or update tests",
      "No new flaky test may be merged without explicit issue and owner"
    ]
  },
  {
    title: "Pre-release checklist",
    items: [
      "Run smoke checklist",
      "Run release checklist",
      "Review failed or quarantined tests",
      "Confirm billing/provider environment sanity",
      "Confirm analytics and admin debug surfaces load"
    ]
  },
  {
    title: "Staging validation",
    items: [
      "Exercise signup to first value",
      "Exercise import to review to reminder",
      "Exercise one billing upgrade path",
      "Exercise one admin rescue path",
      "Exercise one export and ICS path"
    ]
  },
  {
    title: "Production monitoring checks",
    items: [
      "Reminder failure rate",
      "Notification retry spikes",
      "Extraction failure spikes",
      "Cron unauthorized and failure events",
      "Billing webhook failures"
    ]
  },
  {
    title: "Rollback criteria",
    items: [
      "Reminder send success drops below critical threshold",
      "Cross-tenant access issue discovered",
      "Billing entitlements or checkout break in production",
      "Imports corrupt or silently lose contract data",
      "Wrong-behavior incident affects trusted dates or reminders"
    ]
  },
  {
    title: "Hotfix rules",
    items: [
      "Hotfixes for trust-sensitive paths need focused regression tests before release",
      "Do not bundle unrelated feature changes into reminder, billing, or permission hotfixes",
      "Document root cause and add a permanent regression test after each hotfix"
    ]
  }
];

export const testingFinalRecommendation = {
  topMissingTests: [
    "Signup to first-value e2e",
    "Cross-tenant contract access denial across routes",
    "Reminder retry idempotency integration test",
    "Review regenerates reminders correctly integration test",
    "Import partial failure with clear surfaced errors",
    "Plan downgrade end-to-end entitlement regression",
    "Admin-only rescue action authorization test",
    "ICS trusted-date correctness regression",
    "Growth escalation end-to-end gating test",
    "Analytics critical event emission smoke test"
  ],
  topRiskFlows: testingCurrentStateReview.highestRiskFlows,
  bestCiCdQualityGates: [
    "Required typecheck",
    "Required P0 unit/integration suite",
    "Targeted e2e on trust-sensitive flows before release",
    "No unresolved flaky P0 tests",
    "Manual staging validation for billing and reminders"
  ],
  bestQaProcess: [
    "Risk-based release testing anchored on reminders, billing, imports, review correctness, and tenant isolation",
    "Keep most logic fast in unit/integration tests and reserve e2e for the narrowest high-risk user journeys",
    "Tie every production incident or hotfix to a permanent regression test",
    "Treat flaky tests in trust-sensitive paths as product risk, not test noise"
  ],
  topNextActions: [
    "Keep send-reminders route and processor coverage deterministic in the release-critical suite",
    "Add first-value e2e flow",
    "Add cross-tenant isolation integration tests",
    "Add reminder retry/idempotency integration coverage",
    "Add review-to-reminder regeneration integration coverage",
    "Add import partial-failure regression suite",
    "Add downgrade/entitlement e2e or deep integration coverage",
    "Create staging smoke checklist in CI/release docs",
    "Establish P0/P1 tagging for trust-sensitive tests",
    "Add release-blocking rule for reminder, billing, and permission regressions"
  ]
};

export type LearningLanguage =
  | "TypeScript"
  | "React"
  | "SQL"
  | "Python"
  | "Go"
  | "R"
  | "Java";

export type LearningSubsystemStatus = "planned" | "scaffolded" | "active" | "production_ready";

export type LanguageSubsystem = {
  language: LearningLanguage;
  subsystemName: string;
  ownedResponsibility: string;
  productPurpose: string;
  commercialValue: string;
  runtimeLocation: string;
  beginnerTasks: string[];
  intermediateTasks: string[];
  advancedTasks: string[];
  filesToStudy: string[];
  testsToRun: string[];
  integrationPoints: string[];
  currentStatus: LearningSubsystemStatus;
  enterpriseReadinessImpact: string;
};

export const LANGUAGE_SUBSYSTEMS: LanguageSubsystem[] = [
  {
    language: "TypeScript",
    subsystemName: "Product orchestration and domain policy",
    ownedResponsibility: "product_orchestration",
    productPurpose: "Owns server actions, entitlement decisions, service clients, route helpers, and contract workflow truth.",
    commercialValue: "Keeps shipped renewal-control behavior coherent while gating premium exports, intelligence, billing, and add-ons.",
    runtimeLocation: "app/, lib/, components server boundaries",
    beginnerTasks: ["Trace a contract action from form submission to audit log.", "Add a typed helper test for a domain policy."],
    intermediateTasks: ["Refactor a page-local rule into a shared view model.", "Add a route-handler guard for a high-risk API route."],
    advancedTasks: ["Design a new entitlement-gated workflow without leaking billing truth.", "Wire a new signed add-on client through the platform capability gate."],
    filesToStudy: ["lib/actions/contracts", "lib/auth.ts", "lib/billing/entitlements.ts", "lib/product/platform-capability-gates.ts"],
    testsToRun: ["npm run typecheck", "npm run test:permission-boundaries", "npm run test:release-critical"],
    integrationPoints: ["React UI", "Supabase SQL", "Python signed client", "Go worker", "Java connector scaffold"],
    currentStatus: "active",
    enterpriseReadinessImpact: "Primary control layer for tenant scope, billing gates, route safety, and service orchestration."
  },
  {
    language: "React",
    subsystemName: "Operator and customer product surfaces",
    ownedResponsibility: "product_ui",
    productPurpose: "Owns dashboards, onboarding, admin pages, contract detail experiences, and risk-first interface clarity.",
    commercialValue: "Turns renewal-control data into usable CFO, procurement, and operator workflows without exposing internal service complexity.",
    runtimeLocation: "app/**/*.tsx and components/**/*.tsx",
    beginnerTasks: ["Update a dashboard card using existing design tokens.", "Add an empty-state test for a table component."],
    intermediateTasks: ["Build an internal admin page from an existing registry.", "Add a contract-detail panel without changing backend behavior."],
    advancedTasks: ["Design a cross-surface entitlement consistency UI test.", "Move page-shaped logic into a reusable view model."],
    filesToStudy: ["app/dashboard/page.tsx", "app/dashboard/contracts/[id]/page.tsx", "components/contracts", "components/layout"],
    testsToRun: ["npm run test:data-integrity", "npm run test:scope-freeze"],
    integrationPoints: ["TypeScript view models", "Supabase-backed query helpers", "Admin registries"],
    currentStatus: "active",
    enterpriseReadinessImpact: "Keeps customer-facing experience narrow, scannable, and separated from future service internals."
  },
  {
    language: "SQL",
    subsystemName: "Trust, tenancy, audit, and reporting backbone",
    ownedResponsibility: "trust_reporting_backbone",
    productPurpose: "Owns Supabase schema, RLS, constraints, indexes, audit ledgers, reporting views, and tenant isolation.",
    commercialValue: "Makes enterprise buyer trust possible by enforcing boundaries below the application layer.",
    runtimeLocation: "supabase/migrations and generated database types",
    beginnerTasks: ["Read an RLS policy and identify its tenant scope.", "Add an index assertion test for a new query path."],
    intermediateTasks: ["Design an append-only audit table with safe metadata.", "Add a reporting view that does not expose raw contract text."],
    advancedTasks: ["Model immutable approval evidence with revocation-only semantics.", "Design background export scale limits with tenant-scoped queries."],
    filesToStudy: ["supabase/migrations", "lib/supabase/database.types.ts", "tests/scale-performance-boundary.test.ts"],
    testsToRun: ["npm run test:scale-readiness", "npm run test:privacy-ops"],
    integrationPoints: ["TypeScript query helpers", "enterprise audit model", "R analytics export fixtures"],
    currentStatus: "active",
    enterpriseReadinessImpact: "Source of truth for tenant isolation, audit evidence, and bounded reporting."
  },
  {
    language: "Python",
    subsystemName: "Contract intelligence and document extraction",
    ownedResponsibility: "contract_intelligence",
    productPurpose: "Owns OCR/document extraction contracts, quote comparison, usage reconciliation, and deterministic intelligence service boundaries.",
    commercialValue: "Creates premium intelligence value while keeping AI/provider behavior outside the customer UI shell.",
    runtimeLocation: "services/python-intelligence",
    beginnerTasks: ["Run endpoint tests and inspect request/response models.", "Add a deterministic validation rule for fixture input."],
    intermediateTasks: ["Add a new signed endpoint contract without raw document logging.", "Create a provider adapter interface behind test fixtures."],
    advancedTasks: ["Implement source-grounded extraction with evidence QA.", "Add quote comparison with prompt/version tracking and human review gates."],
    filesToStudy: ["services/python-intelligence/app", "lib/add-ons/python-intelligence-client.ts", "tests/add-on-clients.test.ts"],
    testsToRun: ["pytest", "npm run test:add-ons"],
    integrationPoints: ["TypeScript signed HTTP client", "SQL evidence tables", "enterprise audit events"],
    currentStatus: "scaffolded",
    enterpriseReadinessImpact: "Separates intelligence computation from product authorization and customer UI."
  },
  {
    language: "Go",
    subsystemName: "Reliability workers and queue processing",
    ownedResponsibility: "reliability_workers",
    productPurpose: "Owns reliable background jobs, reminder processing, retries, idempotency, stale rescue, and webhook normalization scaffolds.",
    commercialValue: "Improves operational trust for reminders, exports, imports, and background workflows at scale.",
    runtimeLocation: "services/go-worker",
    beginnerTasks: ["Run worker health mode and unit tests.", "Add a retry classification fixture."],
    intermediateTasks: ["Implement a bounded queue polling loop against a fake repository.", "Add idempotency coverage for a worker action."],
    advancedTasks: ["Move a production background workflow behind lease-safe worker execution.", "Add structured operational events for retry exhaustion."],
    filesToStudy: ["services/go-worker/internal", "app/api/internal/export-jobs/route.ts", "lib/notifications/reminders.ts"],
    testsToRun: ["go test ./...", "npm run test:background-exports", "npm run test:trust-sensitive"],
    integrationPoints: ["TypeScript internal routes", "SQL job ledgers", "monitoring adapter"],
    currentStatus: "scaffolded",
    enterpriseReadinessImpact: "Provides the path from cron-style routes to durable worker reliability."
  },
  {
    language: "R",
    subsystemName: "Analytics, forecasting, and research",
    ownedResponsibility: "analytics_research",
    productPurpose: "Owns renewal spend forecasting, risk trend analysis, savings opportunity modeling, and activation cohort research from exported/reporting data.",
    commercialValue: "Supports CFO-facing insights without giving research scripts direct production database authority.",
    runtimeLocation: "services/r-analytics",
    beginnerTasks: ["Run a fixture-backed summary script.", "Add a required-column validation to an analysis script."],
    intermediateTasks: ["Create a deterministic cohort summary from exported CSV data.", "Compare savings opportunity cohorts across fixtures."],
    advancedTasks: ["Prototype forecasting assumptions for later productized reporting.", "Validate model drift using redacted export fixtures."],
    filesToStudy: ["services/r-analytics/README.md", "services/r-analytics/scripts", "docs/MULTI_LANGUAGE_ENTERPRISE_LEARNING_ARCHITECTURE.md"],
    testsToRun: ["Rscript services/r-analytics/scripts/renewal_spend_forecast.R", "Rscript -e \"testthat::test_dir('services/r-analytics/tests/testthat')\""],
    integrationPoints: ["CSV/reporting exports", "SQL reporting views", "TypeScript dashboard decisions after productization"],
    currentStatus: "scaffolded",
    enterpriseReadinessImpact: "Keeps analytics experimentation read-only, fixture-backed, and safe for future enterprise reporting."
  },
  {
    language: "Java",
    subsystemName: "Enterprise connectors and integration contracts",
    ownedResponsibility: "enterprise_integrations",
    productPurpose: "Owns optional procurement, ERP, identity, and workflow connector scaffolds for enterprise buyers.",
    commercialValue: "Creates a disciplined path toward SAP/Coupa/Oracle/ServiceNow/identity integrations without polluting the renewal-control kernel.",
    runtimeLocation: "services/java-enterprise-connectors",
    beginnerTasks: ["Run connector health tests.", "Read a connector interface and document safe metadata."],
    intermediateTasks: ["Add a mocked procurement adapter contract.", "Add HMAC verification for an internal connector request."],
    advancedTasks: ["Implement a provider-specific connector behind feature gates and audit contracts.", "Add backoff/idempotency behavior for enterprise workflow sync."],
    filesToStudy: ["services/java-enterprise-connectors/src", "lib/add-ons/java-enterprise-client.ts", "docs/add-on-architecture.md"],
    testsToRun: ["mvn test", "npm run test:add-ons"],
    integrationPoints: ["TypeScript signed client", "SQL audit ledgers", "future enterprise identity contracts"],
    currentStatus: "scaffolded",
    enterpriseReadinessImpact: "Keeps enterprise-only integrations optional, gated, and separate from customer runtime UI."
  }
];

export function listLanguageSubsystems() {
  return LANGUAGE_SUBSYSTEMS;
}

export function getLanguageSubsystem(language: LearningLanguage) {
  return LANGUAGE_SUBSYSTEMS.find((subsystem) => subsystem.language === language) ?? null;
}

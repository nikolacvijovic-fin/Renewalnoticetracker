import fs from "node:fs";
import path from "node:path";

export const REQUIRED_DEPLOYMENT_SCRIPTS = [
  "typecheck",
  "test:release-critical",
  "test:scope-freeze",
  "test:ops-readiness",
  "test:monitoring-readiness",
  "test:privacy-ops",
  "test:scale-readiness",
  "test:background-exports",
  "release:check"
];

export const REQUIRED_DEPLOYMENT_DOCS = [
  "docs/CURRENT_PRODUCT_TRUTH.md",
  "docs/CUSTOMER_ONBOARDING_BOUNDARY.md",
  "docs/ENTERPRISE_ONBOARDING_READINESS.md",
  "docs/OPERATIONAL_EVENT_INVENTORY.md",
  "docs/OPERATIONAL_MATURITY.md",
  "docs/OPERATIONAL_RUNBOOKS.md",
  "docs/DEPLOYMENT_RELEASE_SAFETY.md",
  "docs/EVENT_TAXONOMY.md",
  "docs/DATA_GOVERNANCE_RETENTION_BOUNDARY.md",
  "docs/ENTERPRISE_IDENTITY_RBAC_BOUNDARY.md",
  "docs/API_AND_INTEGRATION_BOUNDARY.md",
  "docs/PLATFORM_MODULE_REGISTRY.md"
];

export const REQUIRED_OPERATIONAL_CONTRACTS = [
  "lib/observability/monitoring.ts",
  "lib/observability/server-logger.ts",
  "lib/observability/operational-logging.ts",
  "lib/observability/metrics.ts",
  "lib/observability/alert-rules.ts"
];

export const REQUIRED_MIGRATION_SLUGS = [
  "initial",
  "billing_provider",
  "security_hardening",
  "privacy_operations",
  "ocr_jobs",
  "phase1_pilot_core",
  "phase1_workflow_and_import_rescue",
  "financial_intelligence_fields",
  "scale_readiness_indexes"
];

export const REQUIRED_RUNBOOK_TOPICS = [
  "export",
  "OCR queue",
  "reminder dispatch",
  "billing webhook",
  "leaked secret",
  "tenant isolation",
  "backup"
];

const productionEnvironmentValues = new Set(["production", "prod"]);
const unsafeSecretPattern =
  /^(test|dev|demo|local|example|placeholder|changeme|change-me|dummy|mock|fake)(?:[-_].*)?$/i;
const unsafeSecretValuePattern =
  /(?:test|dev|demo|local|example|placeholder|changeme|change-me|dummy|mock|fake|localhost)/i;
const unsafeProductionHostPattern = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i;

const productionSecrets = [
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SIGNING_SECRET",
  "NOTICECONTROL_EMAIL_ACTION_SECRET",
  "CRON_SHARED_SECRET",
  "PADDLE_API_KEY",
  "PADDLE_WEBHOOK_SECRET",
  "PADDLE_STARTER_PRICE_ID",
  "PADDLE_GROWTH_PRICE_ID",
  "INTERNAL_HEALTH_SECRET",
  "INTERNAL_OCR_JOBS_SECRET",
  "INTERNAL_OPERATIONS_SECRET",
  "INTERNAL_DESTRUCTIVE_OPS_SECRET",
  "INTERNAL_DESTRUCTIVE_OPS_SIGNING_SECRET"
];

function issue(code, message, details = {}) {
  return { code, message, details };
}

function readText(repoRoot, relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(repoRoot, relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

export function isProductionEnvironment(env = process.env) {
  return [
    env.NODE_ENV,
    env.VERCEL_ENV,
    env.APP_ENV,
    env.NOTICECONTROL_ENV,
    env.RELEASE_TARGET_ENV
  ].some((value) => productionEnvironmentValues.has(String(value ?? "").trim().toLowerCase()));
}

function validateProductionUrl(env, key) {
  const value = env[key];
  if (!value) {
    return issue("ERR_DEPLOY_CONFIG_MISSING_URL", `${key} is required for production deployment.`, {
      key
    });
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return issue("ERR_DEPLOY_CONFIG_INVALID_URL", `${key} must be a valid production URL.`, {
      key
    });
  }

  if (parsed.protocol !== "https:") {
    return issue("ERR_DEPLOY_CONFIG_INSECURE_URL", `${key} must use https in production.`, {
      key
    });
  }

  if (unsafeProductionHostPattern.test(parsed.hostname) || parsed.hostname.endsWith(".local")) {
    return issue("ERR_DEPLOY_CONFIG_LOCAL_URL", `${key} must not point to a local host in production.`, {
      key
    });
  }

  return null;
}

function validateProductionSecret(env, key) {
  const value = String(env[key] ?? "").trim();
  if (!value) {
    return issue("ERR_DEPLOY_CONFIG_MISSING_SECRET", `${key} is required for production deployment.`, {
      key
    });
  }

  if (value.length < 8 || unsafeSecretPattern.test(value) || unsafeSecretValuePattern.test(value)) {
    return issue(
      "ERR_DEPLOY_CONFIG_PLACEHOLDER_SECRET",
      `${key} must be replaced with a production secret or provider identifier.`,
      { key }
    );
  }

  return null;
}

function validateBoundedInteger(env, key, min, max) {
  const value = env[key];
  if (value == null || String(value).trim() === "") {
    return issue("ERR_DEPLOY_CONFIG_MISSING_OPERATION_LIMIT", `${key} is required for deployment readiness.`, {
      key,
      min,
      max
    });
  }

  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    return issue("ERR_DEPLOY_CONFIG_OPERATION_LIMIT_OUT_OF_RANGE", `${key} must be an integer between ${min} and ${max}.`, {
      key,
      min,
      max
    });
  }

  return null;
}

export function getProductionConfigSafetyIssues(env = process.env) {
  if (!isProductionEnvironment(env)) {
    return [];
  }

  const checks = [
    validateProductionUrl(env, "NEXT_PUBLIC_APP_URL"),
    validateProductionUrl(env, "NEXT_PUBLIC_SUPABASE_URL"),
    ...productionSecrets.map((key) => validateProductionSecret(env, key))
  ];

  if (env.PADDLE_ENVIRONMENT !== "production") {
    checks.push(
      issue("ERR_DEPLOY_CONFIG_BILLING_ENVIRONMENT", "PADDLE_ENVIRONMENT must be production for production deployments.", {
        key: "PADDLE_ENVIRONMENT"
      })
    );
  }

  if (env.OCR_PROVIDER === "openai") {
    checks.push(validateProductionSecret(env, "OCR_OPENAI_API_KEY"));
    if (!env.OCR_OPENAI_MODEL) {
      checks.push(
        issue("ERR_DEPLOY_CONFIG_OCR_MODEL_MISSING", "OCR_OPENAI_MODEL is required when OCR_PROVIDER is openai in production.", {
          key: "OCR_OPENAI_MODEL"
        })
      );
    }
  }

  if (env.MONITORING_EVENT_SINK === "structured_log_and_webhook") {
    checks.push(validateProductionUrl(env, "MONITORING_ALERT_WEBHOOK_URL"));
    checks.push(validateProductionSecret(env, "MONITORING_ALERT_WEBHOOK_SIGNING_SECRET"));
  }

  return checks.filter(Boolean);
}

export function getBackgroundJobConfigIssues(env = process.env) {
  return [
    validateBoundedInteger(env, "BACKGROUND_EXPORT_PAGE_SIZE", 100, 5000),
    validateBoundedInteger(env, "BACKGROUND_EXPORT_JOB_LIMIT", 1, 10),
    validateBoundedInteger(env, "REMINDER_PROCESSING_LEASE_MINUTES", 1, 120),
    validateBoundedInteger(env, "OCR_PROCESSING_LEASE_MINUTES", 1, 120)
  ].filter(Boolean);
}

export function getMissingRequiredScripts(packageJson) {
  const scripts = packageJson.scripts ?? {};
  return REQUIRED_DEPLOYMENT_SCRIPTS.filter((scriptName) => !scripts[scriptName]);
}

export function getRepoStructureIssues(repoRoot) {
  const issues = [];

  for (const docPath of REQUIRED_DEPLOYMENT_DOCS) {
    if (!exists(repoRoot, docPath)) {
      issues.push(issue("ERR_DEPLOY_DOC_MISSING", `Missing deployment/readiness document: ${docPath}.`, { path: docPath }));
    }
  }

  for (const contractPath of REQUIRED_OPERATIONAL_CONTRACTS) {
    if (!exists(repoRoot, contractPath)) {
      issues.push(
        issue("ERR_DEPLOY_OPERATIONAL_CONTRACT_MISSING", `Missing operational contract module: ${contractPath}.`, {
          path: contractPath
        })
      );
    }
  }

  return issues;
}

export function getMigrationSafetyIssues(repoRoot) {
  const migrationDir = path.join(repoRoot, "supabase", "migrations");
  if (!fs.existsSync(migrationDir)) {
    return [issue("ERR_DEPLOY_MIGRATIONS_MISSING", "Missing Supabase migrations directory.", { path: "supabase/migrations" })];
  }

  const files = fs.readdirSync(migrationDir).filter((file) => file.endsWith(".sql"));
  const issues = [];
  const timestampCounts = new Map();

  if (files.length === 0) {
    issues.push(issue("ERR_DEPLOY_MIGRATIONS_EMPTY", "No Supabase migration files were found."));
  }

  for (const file of files) {
    const match = file.match(/^(\d{12})_[a-z0-9_]+\.sql$/);
    if (!match) {
      issues.push(issue("ERR_DEPLOY_MIGRATION_NAME_INVALID", `Migration ${file} must use YYYYMMDDNNNN_slug.sql naming.`, { file }));
      continue;
    }

    timestampCounts.set(match[1], (timestampCounts.get(match[1]) ?? 0) + 1);
  }

  for (const [timestamp, count] of timestampCounts.entries()) {
    if (count > 1) {
      issues.push(issue("ERR_DEPLOY_MIGRATION_TIMESTAMP_DUPLICATE", `Duplicate migration timestamp ${timestamp}.`, { timestamp }));
    }
  }

  for (const slug of REQUIRED_MIGRATION_SLUGS) {
    if (!files.some((file) => file.includes(slug))) {
      issues.push(issue("ERR_DEPLOY_MIGRATION_COVERAGE_MISSING", `Missing expected migration coverage for ${slug}.`, { slug }));
    }
  }

  return issues;
}

export function getRunbookCoverageIssues(repoRoot) {
  if (!exists(repoRoot, "docs/OPERATIONAL_RUNBOOKS.md")) {
    return [issue("ERR_DEPLOY_RUNBOOK_MISSING", "Missing docs/OPERATIONAL_RUNBOOKS.md.")];
  }

  const runbook = readText(repoRoot, "docs/OPERATIONAL_RUNBOOKS.md").toLowerCase();
  return REQUIRED_RUNBOOK_TOPICS.filter((topic) => !runbook.includes(topic.toLowerCase())).map((topic) =>
    issue("ERR_DEPLOY_RUNBOOK_TOPIC_MISSING", `Operational runbooks must cover ${topic}.`, { topic })
  );
}

export function getFutureFeatureTruthIssues(repoRoot) {
  const issues = [];
  const platformModules = readText(repoRoot, "lib/product/platform-modules.ts");
  const currentTruth = exists(repoRoot, "docs/CURRENT_PRODUCT_TRUTH.md")
    ? readText(repoRoot, "docs/CURRENT_PRODUCT_TRUTH.md")
    : "";
  const enterpriseIdentityDoc = exists(repoRoot, "docs/enterprise/ENTERPRISE_IDENTITY_IMPLEMENTATION_PLAN.md")
    ? readText(repoRoot, "docs/enterprise/ENTERPRISE_IDENTITY_IMPLEMENTATION_PLAN.md")
    : "";
  const apiBoundaryDoc = exists(repoRoot, "docs/API_AND_INTEGRATION_BOUNDARY.md")
    ? readText(repoRoot, "docs/API_AND_INTEGRATION_BOUNDARY.md")
    : "";

  const futureModules = [
    "enterprise_identity_rbac_retention",
    "enterprise_integrations",
    "advanced_retention_governance_analytics"
  ];

  for (const moduleId of futureModules) {
    const modulePattern = new RegExp(`${moduleId}:[\\s\\S]*?status: "(deferred|experimental)"`);
    if (!modulePattern.test(platformModules)) {
      issues.push(
        issue("ERR_DEPLOY_FUTURE_MODULE_MARKED_SHIPPED", `${moduleId} must remain deferred/experimental until promoted by release gate.`, {
          moduleId
        })
      );
    }
  }

  if (!/full_clm_expansion:[\s\S]*?status: "excluded"/.test(platformModules)) {
    issues.push(issue("ERR_DEPLOY_EXCLUDED_MODULE_DRIFT", "full_clm_expansion must remain excluded."));
  }

  for (const phraseGroup of [
    ["provider-backed SSO login"],
    ["live SCIM provisioning endpoints", "live SCIM endpoints"],
    ["customer API"],
    ["Slack/Teams", "Slack, Teams"],
    ["full CLM"]
  ]) {
    if (
      !phraseGroup.some(
        (phrase) =>
          currentTruth.includes(phrase) ||
          enterpriseIdentityDoc.includes(phrase) ||
          apiBoundaryDoc.includes(phrase)
      )
    ) {
      issues.push(issue("ERR_DEPLOY_FUTURE_TRUTH_DOC_MISSING", `Future/shipped truth docs must mention ${phraseGroup[0]}.`, { phrase: phraseGroup[0] }));
    }
  }

  return issues;
}

export function getScriptReadinessIssues(packageJson) {
  return getMissingRequiredScripts(packageJson).map((scriptName) =>
    issue("ERR_DEPLOY_SCRIPT_MISSING", `Missing required package script: ${scriptName}.`, { scriptName })
  );
}

export function getDeploymentReadinessIssues({
  repoRoot,
  env = process.env,
  packageJson = JSON.parse(readText(repoRoot, "package.json"))
}) {
  return [
    ...getProductionConfigSafetyIssues(env),
    ...getBackgroundJobConfigIssues(env),
    ...getScriptReadinessIssues(packageJson),
    ...getRepoStructureIssues(repoRoot),
    ...getMigrationSafetyIssues(repoRoot),
    ...getRunbookCoverageIssues(repoRoot),
    ...getFutureFeatureTruthIssues(repoRoot)
  ];
}

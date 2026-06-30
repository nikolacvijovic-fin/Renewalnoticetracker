import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAlertRunbookReadinessIssues,
  getBackgroundJobConfigIssues,
  getDeploymentReadinessIssues,
  getFutureFeatureTruthIssues,
  getMigrationFileSafetyIssues,
  getMigrationSafetyIssues,
  getMissingRequiredScripts,
  getProductionConfigSafetyIssues,
  getScriptContentIssues,
  REQUIRED_DEPLOYMENT_DOCS,
  REQUIRED_DEPLOYMENT_SCRIPTS,
  REQUIRED_OPERATIONAL_CONTRACTS,
  REQUIRED_PRODUCT_POLICY_CONTRACTS
} from "@/scripts/deployment-readiness-gates.mjs";

function makeProductionEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "production",
    NEXT_PUBLIC_APP_URL: "https://app.noticecontrol.example",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "pk_live_noticecontrol_anon_123456789",
    SUPABASE_SERVICE_ROLE_KEY: "sk_live_noticecontrol_service_123456789",
    SUPABASE_STORAGE_BUCKET: "noticecontrol-prod-contract-files",
    SUPABASE_EXPORTS_BUCKET: "noticecontrol-prod-export-artifacts",
    OPENAI_API_KEY: "sk_live_noticecontrol_openai_123456789",
    OCR_PROVIDER: "openai",
    OCR_OPENAI_API_KEY: "sk_live_noticecontrol_ocr_123456789",
    OCR_OPENAI_MODEL: "gpt-4.1-mini",
    RESEND_API_KEY: "re_live_noticecontrol_123456789",
    RESEND_WEBHOOK_SIGNING_SECRET: "resend_live_webhook_secret_123456789",
    NOTICECONTROL_EMAIL_ACTION_SECRET: "email_action_live_secret_123456789",
    CRON_SHARED_SECRET: "cron_live_secret_123456789",
    PADDLE_API_KEY: "paddle_live_api_key_123456789",
    PADDLE_WEBHOOK_SECRET: "paddle_live_webhook_secret_123456789",
    PADDLE_ENVIRONMENT: "production",
    PADDLE_STARTER_PRICE_ID: "pri_live_starter_123456789",
    PADDLE_GROWTH_PRICE_ID: "pri_live_growth_123456789",
    INTERNAL_HEALTH_SECRET: "health_live_secret_123456789",
    INTERNAL_OCR_JOBS_SECRET: "ocr_jobs_live_secret_123456789",
    INTERNAL_OPERATIONS_SECRET: "operations_live_secret_123456789",
    INTERNAL_DESTRUCTIVE_OPS_SECRET: "destructive_live_secret_123456789",
    INTERNAL_DESTRUCTIVE_OPS_SIGNING_SECRET: "destructive_signing_live_secret_123456789",
    BACKGROUND_EXPORT_PAGE_SIZE: "1000",
    BACKGROUND_EXPORT_JOB_LIMIT: "3",
    REMINDER_PROCESSING_LEASE_MINUTES: "15",
    OCR_PROCESSING_LEASE_MINUTES: "30",
    MONITORING_EVENT_SINK: "structured_log",
    ...overrides
  };
}

function makeTempRepo(files: Record<string, string>) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "noticecontrol-deploy-gate-"));
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, contents);
  }
  return repoRoot;
}

describe("deployment readiness gates", () => {
  it("defines the scripts and operational contracts that release readiness must protect", () => {
    expect(REQUIRED_DEPLOYMENT_SCRIPTS).toEqual(
      expect.arrayContaining([
        "test:release-critical",
        "test:scope-freeze",
        "test:ops-readiness",
        "test:monitoring-readiness",
        "test:privacy-ops",
        "test:scale-readiness",
        "release:check"
      ])
    );
    expect(REQUIRED_DEPLOYMENT_DOCS).toContain("docs/DEPLOYMENT_RELEASE_SAFETY.md");
    expect(REQUIRED_DEPLOYMENT_DOCS).toContain("docs/MARKET_EXPANSION_BOUNDARY.md");
    expect(REQUIRED_PRODUCT_POLICY_CONTRACTS).toContain("lib/product/market-profiles.ts");
    expect(REQUIRED_PRODUCT_POLICY_CONTRACTS).toContain("lib/product/market-activation-approval.ts");
    expect(REQUIRED_OPERATIONAL_CONTRACTS).toEqual(
      expect.arrayContaining([
        "lib/observability/monitoring.ts",
        "lib/observability/metrics.ts",
        "lib/observability/alert-rules.ts"
      ])
    );
  });

  it("catches missing release scripts without requiring a live deployment", () => {
    expect(getMissingRequiredScripts({ scripts: { typecheck: "tsc --noEmit" } })).toEqual(
      expect.arrayContaining(["test:release-critical", "test:scope-freeze", "release:check"])
    );
  });

  it("catches release scripts that exist but omit required deployment safety tests", () => {
    const issues = getScriptContentIssues({
      scripts: {
        "test:monitoring-readiness": "vitest run tests/monitoring-readiness.test.ts",
        "test:deployment-readiness": "vitest run tests/config.test.ts",
        "test:scope-freeze": "vitest run tests/release-gates.test.ts"
      }
    });

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["ERR_DEPLOY_SCRIPT_COVERAGE_MISSING"])
    );
    expect(issues.map((issue) => issue.details.testFile)).toEqual(
      expect.arrayContaining([
        "tests/metrics-alert-rules.test.ts",
        "tests/deployment-readiness-gates.test.ts",
        "tests/market-profiles.test.ts",
        "tests/market-activation-approval.test.ts"
      ])
    );
  });

  it("fails deployment readiness when market policy boundary files are missing", () => {
    const repoRoot = makeTempRepo({
      "docs/CURRENT_PRODUCT_TRUTH.md": "provider-backed SSO login live SCIM provisioning endpoints customer API Slack/Teams full CLM",
      "lib/observability/monitoring.ts": "export {};",
      "lib/observability/server-logger.ts": "export {};",
      "lib/observability/operational-logging.ts": "export {};",
      "lib/observability/metrics.ts": "export {};",
      "lib/observability/alert-rules.ts": "export {};",
      "docs/OPERATIONAL_RUNBOOKS.md": "export OCR queue reminder dispatch billing webhook leaked secret tenant isolation backup",
      "supabase/migrations/202604050001_initial.sql": "-- initial",
      "lib/product/platform-modules.ts": `
        export const PLATFORM_MODULES = {
          enterprise_identity_rbac_retention: { status: "deferred" },
          enterprise_integrations: { status: "deferred" },
          advanced_retention_governance_analytics: { status: "experimental" },
          full_clm_expansion: { status: "excluded" }
        };
      `,
      "docs/enterprise/ENTERPRISE_IDENTITY_IMPLEMENTATION_PLAN.md": "provider-backed SSO login live SCIM provisioning endpoints",
      "docs/API_AND_INTEGRATION_BOUNDARY.md": "customer API Slack/Teams"
    });

    const issues = getDeploymentReadinessIssues({
      repoRoot,
      env: makeProductionEnv(),
      packageJson: {
        scripts: Object.fromEntries(REQUIRED_DEPLOYMENT_SCRIPTS.map((scriptName) => [scriptName, "echo ok"]))
      }
    });
    const codes = issues.map((issue) => issue.code);

    expect(codes).toContain("ERR_DEPLOY_DOC_MISSING");
    expect(codes).toContain("ERR_DEPLOY_PRODUCT_POLICY_CONTRACT_MISSING");
    expect(JSON.stringify(issues)).toContain("docs/MARKET_EXPANSION_BOUNDARY.md");
    expect(JSON.stringify(issues)).toContain("lib/product/market-profiles.ts");
    expect(JSON.stringify(issues)).toContain("lib/product/market-activation-approval.ts");
  });

  it("rejects production placeholder config without exposing secret values", () => {
    const issues = getProductionConfigSafetyIssues(
      makeProductionEnv({
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        SUPABASE_EXPORTS_BUCKET: "export-artifacts",
        SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
        PADDLE_ENVIRONMENT: "sandbox"
      })
    );
    const rendered = JSON.stringify(issues);

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "ERR_DEPLOY_CONFIG_INSECURE_URL",
        "ERR_DEPLOY_CONFIG_LOCAL_URL",
        "ERR_DEPLOY_CONFIG_PLACEHOLDER_SECRET",
        "ERR_DEPLOY_CONFIG_PLACEHOLDER_BUCKET",
        "ERR_DEPLOY_CONFIG_BILLING_ENVIRONMENT"
      ])
    );
    expect(rendered).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(rendered).not.toContain("test-service-key");
  });

  it("keeps background job deployment config bounded", () => {
    expect(getBackgroundJobConfigIssues(makeProductionEnv())).toEqual([]);

    const issues = getBackgroundJobConfigIssues(
      makeProductionEnv({
        BACKGROUND_EXPORT_PAGE_SIZE: "999999",
        BACKGROUND_EXPORT_JOB_LIMIT: "0",
        REMINDER_PROCESSING_LEASE_MINUTES: "0",
        OCR_PROCESSING_LEASE_MINUTES: "999"
      })
    );

    expect(issues.map((issue) => issue.details.key)).toEqual(
      expect.arrayContaining([
        "BACKGROUND_EXPORT_PAGE_SIZE",
        "BACKGROUND_EXPORT_JOB_LIMIT",
        "REMINDER_PROCESSING_LEASE_MINUTES",
        "OCR_PROCESSING_LEASE_MINUTES"
      ])
    );
  });

  it("validates migration naming and critical shipped coverage while allowing future-only schema to stay documented", () => {
    const repoRoot = makeTempRepo({
      "supabase/migrations/202604050001_initial.sql": "-- initial",
      "supabase/migrations/202604120001_billing_provider.sql": "-- billing",
      "supabase/migrations/202604190001_security_hardening.sql": "-- security",
      "supabase/migrations/not-a-migration.sql": "-- bad"
    });

    const issues = getMigrationSafetyIssues(repoRoot);

    expect(issues.map((issue) => issue.code)).toContain("ERR_DEPLOY_MIGRATION_NAME_INVALID");
    expect(issues.map((issue) => issue.code)).toContain("ERR_DEPLOY_MIGRATION_COVERAGE_MISSING");
    expect(JSON.stringify(issues)).not.toContain("enterprise_identity");
    expect(JSON.stringify(issues)).not.toContain("scim");
  });

  it("rejects unordered, duplicated, and empty migration files with stable deployment errors", () => {
    const issues = getMigrationFileSafetyIssues(
      [
        "202604050002_second.sql",
        "202604050001_first.sql",
        "202604050001_duplicate.sql",
        "202604050003_empty.sql"
      ],
      (file) => (file.includes("empty") ? "   " : "-- migration")
    );

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "ERR_DEPLOY_MIGRATION_ORDER_INVALID",
        "ERR_DEPLOY_MIGRATION_TIMESTAMP_DUPLICATE",
        "ERR_DEPLOY_MIGRATION_EMPTY_FILE"
      ])
    );
  });

  it("requires every alert rule runbook ID to resolve to an operational runbook", () => {
    const repoRoot = makeTempRepo({
      "lib/observability/alert-rules.ts": `
        export const ALERT_RULES = {
          export_failure: { runbookId: "runbook_export_job_failure" },
          missing: { runbookId: "runbook_missing" }
        };
      `,
      "docs/OPERATIONAL_RUNBOOKS.md": "Runbook ID: `runbook_export_job_failure`"
    });

    expect(getAlertRunbookReadinessIssues(repoRoot)).toEqual([
      expect.objectContaining({
        code: "ERR_DEPLOY_ALERT_RULE_RUNBOOK_MISSING",
        details: expect.objectContaining({ runbookId: "runbook_missing" })
      })
    ]);
  });

  it("detects shipped/future product truth drift for enterprise and integration modules", () => {
    const repoRoot = makeTempRepo({
      "lib/product/platform-modules.ts": `
        export const PLATFORM_MODULES = {
          enterprise_identity_rbac_retention: { status: "shipped" },
          enterprise_integrations: { status: "deferred" },
          advanced_retention_governance_analytics: { status: "experimental" },
          full_clm_expansion: { status: "excluded" }
        };
      `,
      "docs/CURRENT_PRODUCT_TRUTH.md": "provider-backed SSO login live SCIM provisioning endpoints customer API Slack/Teams full CLM",
      "docs/enterprise/ENTERPRISE_IDENTITY_IMPLEMENTATION_PLAN.md": "provider-backed SSO login live SCIM provisioning endpoints",
      "docs/API_AND_INTEGRATION_BOUNDARY.md": "customer API Slack/Teams"
    });

    expect(getFutureFeatureTruthIssues(repoRoot).map((issue) => issue.code)).toContain(
      "ERR_DEPLOY_FUTURE_MODULE_MARKED_SHIPPED"
    );
  });

  it("composes repo, monitoring, runbook, migration, script, and config checks into one release gate", () => {
    const repoRoot = makeTempRepo({
      "package.json": JSON.stringify({ scripts: { typecheck: "tsc --noEmit" } }),
      "supabase/migrations/202604050001_initial.sql": "-- initial",
      "docs/OPERATIONAL_RUNBOOKS.md": "export job failure",
      "lib/product/platform-modules.ts": `
        export const PLATFORM_MODULES = {
          enterprise_identity_rbac_retention: { status: "deferred" },
          enterprise_integrations: { status: "deferred" },
          advanced_retention_governance_analytics: { status: "experimental" },
          full_clm_expansion: { status: "excluded" }
        };
      `,
      "docs/CURRENT_PRODUCT_TRUTH.md": "provider-backed SSO login live SCIM provisioning endpoints customer API Slack/Teams full CLM",
      "docs/enterprise/ENTERPRISE_IDENTITY_IMPLEMENTATION_PLAN.md": "provider-backed SSO login live SCIM provisioning endpoints",
      "docs/API_AND_INTEGRATION_BOUNDARY.md": "customer API Slack/Teams"
    });

    const issues = getDeploymentReadinessIssues({
      repoRoot,
      env: makeProductionEnv({
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        BACKGROUND_EXPORT_JOB_LIMIT: "99"
      }),
      packageJson: { scripts: { typecheck: "tsc --noEmit" } }
    });
    const codes = issues.map((issue) => issue.code);

    expect(codes).toContain("ERR_DEPLOY_CONFIG_LOCAL_URL");
    expect(codes).toContain("ERR_DEPLOY_CONFIG_OPERATION_LIMIT_OUT_OF_RANGE");
    expect(codes).toContain("ERR_DEPLOY_SCRIPT_MISSING");
    expect(codes).toContain("ERR_DEPLOY_DOC_MISSING");
    expect(codes).toContain("ERR_DEPLOY_OPERATIONAL_CONTRACT_MISSING");
    expect(codes).toContain("ERR_DEPLOY_MIGRATION_COVERAGE_MISSING");
    expect(codes).toContain("ERR_DEPLOY_RUNBOOK_TOPIC_MISSING");
  });
});

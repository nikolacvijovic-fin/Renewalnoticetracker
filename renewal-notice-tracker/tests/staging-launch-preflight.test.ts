import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getStagingReleasePreflightIssues,
  hasStagingReleasePreflightFailures,
  printStagingReleasePreflight
} from "@/scripts/staging-release-preflight.mjs";
import { prepareStagingFixtures } from "@/scripts/staging-fixtures.mjs";

function stagingEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    RELEASE_TARGET_ENV: "staging",
    RELEASE_SMOKE_OWNER: "operator",
    RELEASE_ROLLBACK_OWNER: "operator",
    E2E_BASE_URL: "https://staging.noticecontrol.example",
    E2E_AUTH_COOKIE_NAME: "sb-session",
    E2E_AUTH_COOKIE_VALUE: "secret-primary-cookie",
    E2E_SECONDARY_AUTH_COOKIE_VALUE: "secret-secondary-cookie",
    E2E_REVIEW_CONTRACT_PATH: "/dashboard/contracts/review",
    E2E_FOREIGN_CONTRACT_PATH: "/dashboard/contracts/foreign",
    NEXT_PUBLIC_SUPABASE_URL: "https://staging.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
    SUPABASE_DB_URL: "postgres://staging",
    SUPABASE_STORAGE_BUCKET: "staging-contracts",
    SUPABASE_EXPORTS_BUCKET: "staging-exports",
    RESEND_API_KEY: "resend-secret",
    RESEND_FROM_EMAIL: "staging@noticecontrol.example",
    NOTICECONTROL_SENDING_DOMAIN: "noticecontrol.example",
    NOTICECONTROL_REPLY_TO_EMAIL: "support@noticecontrol.example",
    RESEND_WEBHOOK_SIGNING_SECRET: "resend-webhook-secret",
    NOTICECONTROL_EMAIL_ACTION_SECRET: "email-action-secret",
    PADDLE_ENVIRONMENT: "sandbox",
    PADDLE_API_KEY: "paddle-secret",
    PADDLE_WEBHOOK_SECRET: "paddle-webhook-secret",
    PADDLE_STARTER_PRICE_ID: "starter",
    PADDLE_GROWTH_PRICE_ID: "growth",
    CRON_SHARED_SECRET: "cron-secret",
    ADD_ON_INTERNAL_SIGNING_SECRET: "signing-secret",
    INTERNAL_HEALTH_SECRET: "health-secret",
    INTERNAL_OCR_JOBS_SECRET: "ocr-secret",
    INTERNAL_OPERATIONS_SECRET: "operations-secret",
    INTERNAL_DESTRUCTIVE_OPS_SECRET: "destructive-secret",
    INTERNAL_DESTRUCTIVE_OPS_SIGNING_SECRET: "destructive-signing-secret",
    OCR_PROVIDER: "openai",
    OPENAI_API_KEY: "openai-secret",
    OCR_OPENAI_API_KEY: "ocr-openai-secret",
    OCR_OPENAI_MODEL: "gpt-4.1-mini",
    BACKGROUND_EXPORT_PAGE_SIZE: "1000",
    BACKGROUND_EXPORT_JOB_LIMIT: "3",
    REMINDER_PROCESSING_LEASE_MINUTES: "15",
    OCR_PROCESSING_LEASE_MINUTES: "30",
    PDF_UPLOAD_ATTEMPT_RETENTION_HOURS: "72",
    ...overrides
  };
}

describe("staging launch preflight", () => {
  it("keeps the new helpers free of credential persistence and database mutation", () => {
    const preflight = fs.readFileSync(path.join(process.cwd(), "scripts", "staging-release-preflight.mjs"), "utf8");
    const fixtures = fs.readFileSync(path.join(process.cwd(), "scripts", "staging-fixtures.mjs"), "utf8");

    expect(preflight).not.toMatch(/console\.(log|error)\([^)]*process\.env/);
    expect(fixtures).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(fixtures).not.toContain("createAdminSupabaseClient");
    expect(fixtures).not.toContain("E2E_AUTH_COOKIE_VALUE");
    expect(fixtures).toContain("RELEASE_TARGET_ENV=staging");
    expect(fixtures).toContain("--confirm-staging-fixtures");
  });

  it("reports names grouped by category without exposing secret values", () => {
    const result = getStagingReleasePreflightIssues(
      stagingEnv({ E2E_AUTH_COOKIE_VALUE: "", ADD_ON_INTERNAL_SIGNING_SECRET: "" })
    );
    const lines: string[] = [];
    printStagingReleasePreflight(result, (line) => lines.push(line));
    const rendered = lines.join("\n");

    expect(result.missingByGroup.e2e).toContain("E2E_AUTH_COOKIE_VALUE");
    expect(result.missingByGroup.internal).toContain("ADD_ON_INTERNAL_SIGNING_SECRET");
    expect(rendered).not.toContain("secret-primary-cookie");
    expect(hasStagingReleasePreflightFailures(result)).toBe(true);
  });

  it("rejects localhost staging release URLs", () => {
    const result = getStagingReleasePreflightIssues(stagingEnv({ E2E_BASE_URL: "http://localhost:3000" }));
    expect(result.invalidUrls).toEqual(["E2E_BASE_URL"]);
  });

  it("rejects non-local HTTP staging release URLs", () => {
    const result = getStagingReleasePreflightIssues(
      stagingEnv({ E2E_BASE_URL: "http://staging.noticecontrol.example" })
    );
    expect(result.invalidUrls).toEqual(["E2E_BASE_URL"]);
  });

  it("fails closed for production fixture preparation and requires explicit confirmation", async () => {
    await expect(prepareStagingFixtures({ env: stagingEnv({ RELEASE_TARGET_ENV: "production" }), confirmed: true })).rejects.toThrow(
      "RELEASE_TARGET_ENV=staging"
    );
    await expect(prepareStagingFixtures({ env: stagingEnv(), confirmed: false })).rejects.toThrow(
      "--confirm-staging-fixtures"
    );
  });

  it("creates only the deterministic synthetic PDF after explicit staging confirmation", async () => {
    const fixturePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "noticecontrol-staging-fixture-")), "fixture.pdf");
    const result = await prepareStagingFixtures({
      env: stagingEnv({ E2E_CONTRACT_INTELLIGENCE_PDF_PATH: fixturePath }),
      confirmed: true
    });
    expect(result.pdfPath).toBe(fixturePath);
    expect(fs.readFileSync(fixturePath).subarray(0, 4).toString()).toBe("%PDF");
  });
});

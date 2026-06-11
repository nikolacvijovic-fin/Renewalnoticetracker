import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(join(projectRoot, path), "utf8");
}

describe("operational maturity boundaries", () => {
  it("keeps high-risk API routes on the shared route-handler pattern", () => {
    const standardizedRoutes = [
      "app/api/internal/health/route.ts",
      "app/api/internal/ocr-jobs/route.ts",
      "app/api/internal/export-jobs/route.ts",
      "app/api/internal/workspace-deletion/route.ts",
      "app/api/email-actions/[action]/[token]/route.ts",
      "app/api/cron/send-reminders/route.ts",
      "app/api/cron/monthly-digest/route.ts",
      "app/api/intelligence/risk/contracts/[id]/explanation-view/route.ts",
      "app/api/webhooks/billing/paddle/route.ts",
      "app/api/webhooks/billing/paypal/route.ts",
      "app/api/webhooks/stripe/route.ts"
    ];

    for (const route of standardizedRoutes) {
      const source = readProjectFile(route);
      expect(source, route).toContain("createRouteHandler");
      expect(source, route).not.toContain("NextResponse.json");
    }
  });

  it("documents named monitoring signals for critical operational failures", () => {
    const source = [
      readProjectFile("docs/OPERATIONAL_MATURITY.md"),
      readProjectFile("docs/OPERATIONAL_EVENT_INVENTORY.md"),
      readProjectFile("docs/OPERATIONAL_RUNBOOKS.md")
    ].join("\n");
    const requiredSignals = [
      "reminder_dispatch_failed",
      "export_failed",
      "ocr_job_failed",
      "billing_webhook_failed",
      "workspace_deletion_attempted",
      "workspace_deletion_route_failed",
      "internal_route_auth_failed",
      "MONITORING_EVENT_SINK=structured_log_and_webhook",
      "MONITORING_ALERT_WEBHOOK_URL",
      "MONITORING_ALERT_WEBHOOK_TIMEOUT_MS",
      "MONITORING_ALERT_WEBHOOK_DELIVERY_MODE",
      "MONITORING_EVENT_SINK=structured_log"
    ];

    for (const signal of requiredSignals) {
      expect(source, signal).toContain(signal);
    }
  });

  it("keeps production runbooks covering P0/P1/P2 operational scenarios", () => {
    const runbooks = readProjectFile("docs/OPERATIONAL_RUNBOOKS.md");

    for (const required of [
      "Export Job Failure Or Runaway Queue",
      "OCR Queue Stuck Or High Terminal Failures",
      "Reminder Dispatch Failures",
      "Billing Webhook Failures Or Replays",
      "Suspected Sensitive-Data Logging Issue",
      "Tenant Isolation Or Unauthorized Export Incident",
      "Backup Or Restore Evidence Issue",
      "P0",
      "P1",
      "P2",
      "failure_code",
      "failure_category",
      "MONITORING_ALERT_WEBHOOK_TIMEOUT_MS",
      "MONITORING_ALERT_WEBHOOK_DELIVERY_MODE",
      "MONITORING_EVENT_SINK=structured_log",
      "x-noticecontrol-signature-sha256",
      "HMAC-SHA-256",
      "fire_and_forget"
    ]) {
      expect(runbooks).toContain(required);
    }

    for (const forbidden of [
      "raw contract text, full notes, OCR output",
      "Do not paste raw contract text"
    ]) {
      expect(runbooks).toContain(forbidden);
    }
  });

  it("ships staging-safe load-test scaffolding without embedded production secrets", () => {
    const script = readProjectFile("scripts/load/noticecontrol-staging-smoke.k6.js");
    const packageJson = JSON.parse(readProjectFile("package.json")) as {
      scripts?: Record<string, string>;
    };
    const scaleDoc = readProjectFile("docs/SCALE_AND_PERFORMANCE.md");

    for (const required of [
      "/dashboard",
      "/dashboard/contracts",
      "/dashboard/contracts/export/csv?preset=basic_contract_register",
      "/api/exports/contracts",
      "/api/internal/export-jobs",
      "/api/internal/ocr-jobs",
      "/api/cron/send-reminders",
      "/api/webhooks/billing/paddle",
      "STAGING_INTERNAL_OPERATIONS_SECRET",
      "STAGING_INTERNAL_OCR_SECRET",
      "STAGING_CRON_SECRET",
      "safe-mock-signature"
    ]) {
      expect(script).toContain(required);
    }

    expect(packageJson.scripts?.["load:staging:k6"]).toBe(
      "k6 run scripts/load/noticecontrol-staging-smoke.k6.js"
    );
    expect(scaleDoc).toContain("scripts/load/noticecontrol-staging-smoke.k6.js");
    expect(script).not.toContain("production");
    expect(script).not.toContain("sk_");
    expect(script).not.toContain("raw contract text");
    expect(script).not.toContain("full notes");
  });

  it("keeps internal ops summaries aware of export and OCR job health without customer content", () => {
    const source = readProjectFile("lib/contracts/queries.ts");
    const panel = readProjectFile("components/admin/admin-panel.tsx");
    const backgroundExports = readProjectFile("lib/contracts/background-exports.ts");
    const exportJobsRoute = readProjectFile("app/api/internal/export-jobs/route.ts");
    const reminders = readProjectFile("lib/notifications/reminders.ts");
    const ocrJobs = readProjectFile("lib/ocr/jobs.ts");

    expect(source).toContain('.from("data_export_requests")');
    expect(source).toContain('.from("ocr_jobs")');
    expect(source).toContain("exportJobHealth");
    expect(source).toContain("ocrJobHealth");
    expect(source).toContain("staleProcessing");
    expect(source).toContain('select("id", { count: "exact", head: true })');
    expect(source).toContain(".limit(25)");
    expect(source).toContain(".limit(15)");
    expect(source).toContain(".limit(10)");
    expect(source).not.toContain("last_error: summarizeError");
    expect(source).not.toContain("error_message: summarizeError");
    expect(panel).toContain("Background export job health");
    expect(panel).toContain("OCR job health");
    expect(panel).toContain("DiagnosticLine");
    expect(panel).not.toContain("last_error}");
    expect(panel).not.toContain("error_message}");
    expect(panel).not.toContain("storage_object_path");
    expect(panel).not.toContain("extracted_text");
    expect(backgroundExports).toContain("getAppConfig().operations.backgroundExportPageSize");
    expect(backgroundExports).toContain("getAppConfig().operations.backgroundExportJobLimit");
    expect(exportJobsRoute).toContain("getAppConfig().operations.backgroundExportJobLimit");
    expect(reminders).toContain("getAppConfig().operations.reminderProcessingLeaseMinutes");
    expect(ocrJobs).toContain("getAppConfig().operations.ocrProcessingLeaseMinutes");
  });

  it("keeps scoped OCR file lookup tied to the queued job organization", () => {
    const source = readProjectFile("lib/ocr/jobs.ts");
    const helperStart = source.indexOf("export async function getScopedOcrContractFileForJob");
    const helperEnd = source.indexOf("export async function processPendingOcrJobs");
    const helper = source.slice(helperStart, helperEnd);

    expect(helper).toContain('.from("contracts")');
    expect(helper).toContain('.eq("id", input.contractId)');
    expect(helper).toContain('.eq("organization_id", input.organizationId)');
    expect(helper).toContain("input.contractFileId");
  });

  it("keeps export query shape preset-aware and bounded for synchronous scale", () => {
    const source = readProjectFile("lib/contracts/kernel-queries.ts");

    expect(source).toContain("function getExportSelectForPreset");
    expect(source).toContain('presetId === "notes_and_decisions_export"');
    expect(source).toContain('notes (');
    expect(source).toContain("EXPORT_SYNC_ROW_LIMIT");
    expect(source).toContain("options?.maxRows ?? EXPORT_SYNC_ROW_LIMIT");
    expect(source).toContain(".range(0, maxRows - 1)");
    expect(source).toContain("EXPORT_BACKGROUND_ROW_LIMIT");
    expect(source).toContain("getBackgroundExportRows");
    expect(source).toContain(".eq(\"organization_id\", organizationId)");
  });
});

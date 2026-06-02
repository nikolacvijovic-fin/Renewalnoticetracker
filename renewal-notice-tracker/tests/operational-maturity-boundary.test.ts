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
      readProjectFile("docs/OPERATIONAL_EVENT_INVENTORY.md")
    ].join("\n");
    const requiredSignals = [
      "reminder_dispatch_failed",
      "export_failed",
      "ocr_job_failed",
      "billing_webhook_failed",
      "workspace_deletion_attempted",
      "workspace_deletion_route_failed",
      "internal_route_auth_failed"
    ];

    for (const signal of requiredSignals) {
      expect(source, signal).toContain(signal);
    }
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

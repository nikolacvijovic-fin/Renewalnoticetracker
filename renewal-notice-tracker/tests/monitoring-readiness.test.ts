import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOperationalEvent,
  emitOperationalEvent,
  resetOperationalEventSinkForTesting,
  setOperationalEventSinkForTesting
} from "@/lib/observability/monitoring";
import { ConfigValidationError, parseAppConfig } from "@/lib/config";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

function makeMonitoringConfig(overrides: Record<string, string | undefined> = {}) {
  return {
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    SUPABASE_STORAGE_BUCKET: "contract-files",
    SUPABASE_EXPORTS_BUCKET: "export-artifacts",
    OPENAI_API_KEY: "test-openai-key",
    RESEND_API_KEY: "test-resend-key",
    RESEND_FROM_EMAIL: "notifications@noticecontrol.com",
    CRON_SHARED_SECRET: "test-cron-secret",
    INTERNAL_HEALTH_SECRET: "test-health-secret",
    INTERNAL_OCR_JOBS_SECRET: "test-ocr-secret",
    INTERNAL_OPERATIONS_SECRET: "test-operations-secret",
    INTERNAL_DESTRUCTIVE_OPS_SECRET: "test-destructive-secret",
    INTERNAL_DESTRUCTIVE_OPS_SIGNING_SECRET: "test-destructive-signing-secret",
    MONITORING_EVENT_SINK: "structured_log",
    BACKGROUND_EXPORT_PAGE_SIZE: "1000",
    BACKGROUND_EXPORT_JOB_LIMIT: "3",
    REMINDER_PROCESSING_LEASE_MINUTES: "15",
    OCR_PROCESSING_LEASE_MINUTES: "30",
    ...overrides
  };
}

describe("monitoring readiness", () => {
  afterEach(() => {
    resetOperationalEventSinkForTesting();
    vi.restoreAllMocks();
  });

  it("normalizes critical events with severity, context, and safe metadata", () => {
    const event = buildOperationalEvent({
      eventName: "export_failed",
      severity: "P2",
      sensitivity: "customer_sensitive",
      alert: true,
      organizationId: "org-1",
      actorUserId: "user-1",
      route: "/dashboard/contracts/export/csv",
      requestId: "request-1",
      metadata: {
        export_preset: "notes_and_decisions_export",
        sensitive_sections_included: true,
        note_body: "raw note should not be emitted",
        raw_contract_text: "raw contract should not be emitted",
        provider_payload: { token: "billing secret should not be emitted" }
      },
      error: new Error("OCR output or contract text should not be emitted")
    });

    expect(event).toMatchObject({
      eventName: "export_failed",
      severity: "P2",
      sensitivity: "customer_sensitive",
      alert: true,
      organizationId: "org-1",
      actorUserId: "user-1",
      route: "/dashboard/contracts/export/csv",
      requestId: "request-1"
    });
    expect(event.metadata).toMatchObject({
      export_preset: "notes_and_decisions_export",
      sensitive_sections_included: true,
      note_body: "[REDACTED]",
      raw_contract_text: "[REDACTED]",
      provider_payload: "[REDACTED]"
    });
    expect(event.error).toMatchObject({
      name: "Error",
      message: "[REDACTED]"
    });
    expect(JSON.stringify(event)).not.toContain("raw note should not be emitted");
    expect(JSON.stringify(event)).not.toContain("raw contract should not be emitted");
    expect(JSON.stringify(event)).not.toContain("billing secret should not be emitted");
    expect(JSON.stringify(event)).not.toContain("OCR output or contract text should not be emitted");
  });

  it("emits through a swappable sink so future providers do not change callers", async () => {
    const sink = vi.fn();
    setOperationalEventSinkForTesting(sink);

    const event = await emitOperationalEvent({
      eventName: "billing_webhook_failed",
      severity: "P1",
      sensitivity: "restricted",
      alert: true,
      route: "/api/webhooks/billing/paddle",
      requestId: "request-2",
      metadata: {
        provider: "paddle",
        provider_payload: "must redact"
      }
    });

    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "billing_webhook_failed",
        severity: "P1",
        alert: true,
        metadata: expect.objectContaining({
          provider: "paddle",
          provider_payload: "[REDACTED]"
        })
      })
    );
    expect(event.metadata.provider_payload).toBe("[REDACTED]");
  });

  it("documents the operational inventory and alert severity policy", () => {
    const doc = readRepoFile("docs", "OPERATIONAL_EVENT_INVENTORY.md");

    for (const required of [
      "internal_route_auth_failed",
      "export_failed",
      "export_sync_attempted",
      "export_sync_completed",
      "export_sync_rejected",
      "export_background_requested",
      "export_background_claimed",
      "export_background_completed",
      "export_background_expired",
      "export_background_downloaded",
      "export_too_large",
      "reminder_claimed",
      "reminder_sent",
      "reminder_retry_scheduled",
      "reminder_terminal_failed",
      "reminder_stale_rescued",
      "ocr_job_claimed",
      "ocr_job_completed",
      "ocr_job_retry_scheduled",
      "ocr_job_terminal_failed",
      "ocr_job_stale_rescued",
      "billing_webhook_received",
      "billing_webhook_replayed",
      "billing_webhook_succeeded",
      "reminder_dispatch_failed",
      "ocr_job_failed",
      "billing_webhook_failed",
      "workspace_deletion_route_failed",
      "intelligence_access_denied",
      "P0",
      "P1",
      "P2",
      "P3",
      "Alerts must never contain secrets"
    ]) {
      expect(doc).toContain(required);
    }
  });

  it("wires monitoring readiness into package scripts", () => {
    const packageJson = JSON.parse(readRepoFile("package.json")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["test:monitoring-readiness"]).toContain(
      "tests/monitoring-readiness.test.ts"
    );
  });

  it("validates monitoring and job operation config before runtime use", () => {
    expect(parseAppConfig(makeMonitoringConfig()).operations).toMatchObject({
      monitoringEventSink: "structured_log",
      backgroundExportPageSize: 1000,
      backgroundExportJobLimit: 3,
      reminderProcessingLeaseMinutes: 15,
      ocrProcessingLeaseMinutes: 30
    });

    expect(() =>
      parseAppConfig(makeMonitoringConfig({ SUPABASE_EXPORTS_BUCKET: undefined }))
    ).toThrow(ConfigValidationError);
    expect(() =>
      parseAppConfig(makeMonitoringConfig({ BACKGROUND_EXPORT_JOB_LIMIT: "99" }))
    ).toThrow(/BACKGROUND_EXPORT_JOB_LIMIT/i);
  });
});

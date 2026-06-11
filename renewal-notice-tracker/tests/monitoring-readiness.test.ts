import fs from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  alertWebhookOperationalEventSink,
  buildAlertWebhookPayload,
  buildOperationalEvent,
  deliverAlertWebhookEvent,
  emitOperationalEvent,
  resolveOperationalEventSink,
  resetOperationalEventSinkForTesting,
  setOperationalEventSinkForTesting,
  structuredLogAndWebhookOperationalEventSink,
  structuredLogOperationalEventSink
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
    MONITORING_ALERT_WEBHOOK_URL: "",
    MONITORING_ALERT_WEBHOOK_SIGNING_SECRET: "",
    MONITORING_ALERT_WEBHOOK_TIMEOUT_MS: "2500",
    MONITORING_ALERT_WEBHOOK_DELIVERY_MODE: "await",
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

  it("keeps structured_log as the current provider behind an explicit sink boundary", () => {
    expect(resolveOperationalEventSink("structured_log")).toBe(structuredLogOperationalEventSink);
    expect(resolveOperationalEventSink("structured_log_and_webhook")).toBe(
      structuredLogAndWebhookOperationalEventSink
    );

    const monitoringSource = readRepoFile("lib", "observability", "monitoring.ts");
    expect(monitoringSource).toContain(
      "type OperationalEventSinkProvider = \"structured_log\" | \"structured_log_and_webhook\""
    );
    expect(monitoringSource).toContain("resolveOperationalEventSink");
    expect(monitoringSource).toContain("structuredLogOperationalEventSink");
    expect(monitoringSource).toContain("structuredLogAndWebhookOperationalEventSink");
    expect(monitoringSource).toContain("buildAlertWebhookPayload");
    expect(monitoringSource).toContain("getAppConfig().operations.monitoringEventSink");
  });

  it("sanitizes events before they cross the external alert webhook boundary", () => {
    const event = buildOperationalEvent({
      eventName: "tenant_isolation_failure_suspected",
      severity: "P0",
      sensitivity: "restricted",
      alert: true,
      organizationId: "org-1",
      actorUserId: "user-1",
      requestId: "request-3",
      metadata: {
        contract_id: "contract-1",
        raw_contract_text: "raw contract should not leave process",
        full_note_body: "raw note should not leave process",
        provider_payload: { token: "billing secret should not leave process" },
        storage_path: "supabase/storage/private/object"
      },
      error: new Error("confidential renewal clause should not leave process")
    });

    const payload = buildAlertWebhookPayload(event);
    const serialized = JSON.stringify(payload);

    expect(payload).toMatchObject({
      event_name: "tenant_isolation_failure_suspected",
      severity: "P0",
      alert: true,
      organization_id: "org-1",
      request_id: "request-3",
      metadata: expect.objectContaining({
        contract_id: "contract-1",
        raw_contract_text: "[REDACTED]",
        full_note_body: "[REDACTED]",
        provider_payload: "[REDACTED]",
        storage_path: "[REDACTED]"
      }),
      error: expect.objectContaining({
        name: "Error",
        message: "[REDACTED]"
      })
    });
    expect(serialized).not.toContain("raw contract should not leave process");
    expect(serialized).not.toContain("raw note should not leave process");
    expect(serialized).not.toContain("billing secret should not leave process");
    expect(serialized).not.toContain("confidential renewal clause");
    expect(serialized).not.toContain("supabase/storage/private/object");
  });

  it("signs alert webhook delivery over the exact JSON request body when configured", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));
    const event = buildOperationalEvent({
      eventName: "workspace_deletion_route_failed",
      severity: "P1",
      sensitivity: "restricted",
      alert: true,
      organizationId: "org-1",
      actorUserId: "operator-1",
      requestId: "request-signature",
      metadata: {
        failure_code: "ERR_WORKSPACE_DELETE_FAILED_001",
        raw_contract_text: "raw contract should be redacted before signing"
      }
    });

    await deliverAlertWebhookEvent(event, {
      url: "https://alerts.example.test/noticecontrol",
      signingSecret: "alert-signing-secret",
      timeoutMs: 2500,
      deliveryMode: "await"
    });

    const init = fetchSpy.mock.calls[0]?.[1] as
      | (RequestInit & { headers: Record<string, string>; body: string })
      | undefined;
    expect(init).toBeDefined();
    expect(typeof init?.body).toBe("string");

    const expectedSignature = createHmac("sha256", "alert-signing-secret")
      .update(init?.body ?? "")
      .digest("hex");

    expect(init?.headers["x-noticecontrol-signature-sha256"]).toBe(expectedSignature);
    expect(JSON.parse(init?.body ?? "{}")).toMatchObject({
      event_name: "workspace_deletion_route_failed",
      metadata: expect.objectContaining({
        failure_code: "ERR_WORKSPACE_DELETE_FAILED_001",
        raw_contract_text: "[REDACTED]"
      })
    });
    expect(init?.body).not.toContain("raw contract should be redacted before signing");
  });

  it("omits the alert webhook signature header when no signing secret is configured", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));
    const event = buildOperationalEvent({
      eventName: "export_background_failed",
      severity: "P1",
      sensitivity: "customer_sensitive",
      alert: true,
      organizationId: "org-1",
      requestId: "request-no-signature"
    });

    await deliverAlertWebhookEvent(event, {
      url: "https://alerts.example.test/noticecontrol",
      signingSecret: null,
      timeoutMs: 2500,
      deliveryMode: "await"
    });

    const init = fetchSpy.mock.calls[0]?.[1] as
      | (RequestInit & { headers: Record<string, string> })
      | undefined;
    expect(init?.headers).not.toHaveProperty("x-noticecontrol-signature-sha256");
  });

  it("aborts slow alert webhook delivery without leaking raw error text", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      const signal = (init as RequestInit).signal;

      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const error = new Error("raw contract text should never leak from timeout");
          error.name = "AbortError";
          reject(error);
        });
      });
    });

    const event = buildOperationalEvent({
      eventName: "export_background_failed",
      severity: "P1",
      sensitivity: "customer_sensitive",
      alert: true,
      organizationId: "org-1",
      requestId: "request-timeout",
      metadata: {
        export_request_id: "export-1"
      }
    });

    await expect(
      deliverAlertWebhookEvent(event, {
        url: "https://alerts.example.test/noticecontrol",
        signingSecret: null,
        timeoutMs: 1,
        deliveryMode: "await"
      })
    ).resolves.toBeUndefined();

    const logs = JSON.stringify(warnSpy.mock.calls);
    expect(logs).toContain("monitoring.alert_webhook_delivery_timeout");
    expect(logs).toContain("timeout_ms");
    expect(logs).not.toContain("raw contract text should never leak from timeout");
  });

  it("does not throw when webhook delivery fails and keeps structured logs as baseline", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("raw note text and provider payload should not leak")
    );

    const event = buildOperationalEvent({
      eventName: "billing_webhook_failed",
      severity: "P1",
      sensitivity: "restricted",
      alert: true,
      route: "/api/webhooks/billing/paddle",
      requestId: "request-webhook-failure",
      metadata: {
        provider: "paddle"
      }
    });

    await expect(
      structuredLogAndWebhookOperationalEventSink(event, {
        url: "https://alerts.example.test/noticecontrol",
        signingSecret: null,
        timeoutMs: 2500,
        deliveryMode: "await"
      })
    ).resolves.toBeUndefined();

    const logs = JSON.stringify(errorSpy.mock.calls);
    expect(logs).toContain("monitoring.operational_event");
    expect(logs).toContain("monitoring.alert_webhook_delivery_error");
    expect(logs).not.toContain("raw note text");
    expect(logs).not.toContain("provider payload should not leak");
  });

  it("can fire-and-forget webhook fanout without waiting on delivery", async () => {
    let fetchResolved = false;
    let resolveFetch!: (response: Response) => void;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = (response) => {
            fetchResolved = true;
            resolve(response);
          };
        })
    );

    const event = buildOperationalEvent({
      eventName: "reminder_dispatch_failed",
      severity: "P1",
      sensitivity: "customer_sensitive",
      alert: true,
      route: "/api/cron/send-reminders",
      requestId: "request-fire-and-forget"
    });

    await expect(
      alertWebhookOperationalEventSink(event, {
        url: "https://alerts.example.test/noticecontrol",
        signingSecret: null,
        timeoutMs: 2500,
        deliveryMode: "fire_and_forget"
      })
    ).resolves.toBeUndefined();
    expect(fetchResolved).toBe(false);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://alerts.example.test/noticecontrol",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal)
      })
    );

    resolveFetch(new Response(null, { status: 202 }));
    await Promise.resolve();
    await Promise.resolve();
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
      monitoringAlertWebhookUrl: null,
      monitoringAlertWebhookSigningSecret: null,
      monitoringAlertWebhookTimeoutMs: 2500,
      monitoringAlertWebhookDeliveryMode: "await",
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
    expect(() =>
      parseAppConfig(makeMonitoringConfig({ MONITORING_EVENT_SINK: "structured_log_and_webhook" }))
    ).toThrow(/MONITORING_ALERT_WEBHOOK_URL/i);
    expect(() =>
      parseAppConfig(makeMonitoringConfig({ MONITORING_ALERT_WEBHOOK_TIMEOUT_MS: "0" }))
    ).toThrow(/MONITORING_ALERT_WEBHOOK_TIMEOUT_MS/i);
    expect(() =>
      parseAppConfig(makeMonitoringConfig({ MONITORING_ALERT_WEBHOOK_DELIVERY_MODE: "forever" }))
    ).toThrow(/MONITORING_ALERT_WEBHOOK_DELIVERY_MODE/i);
    expect(
      parseAppConfig(
        makeMonitoringConfig({
          MONITORING_EVENT_SINK: "structured_log_and_webhook",
          MONITORING_ALERT_WEBHOOK_URL: "https://alerts.example.test/noticecontrol",
          MONITORING_ALERT_WEBHOOK_SIGNING_SECRET: "alert-signing-secret"
        })
      ).operations
    ).toMatchObject({
      monitoringEventSink: "structured_log_and_webhook",
      monitoringAlertWebhookUrl: "https://alerts.example.test/noticecontrol",
      monitoringAlertWebhookSigningSecret: "alert-signing-secret",
      monitoringAlertWebhookTimeoutMs: 2500,
      monitoringAlertWebhookDeliveryMode: "await"
    });
  });
});

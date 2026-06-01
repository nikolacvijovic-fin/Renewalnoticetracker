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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
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
      "export_too_large",
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
});


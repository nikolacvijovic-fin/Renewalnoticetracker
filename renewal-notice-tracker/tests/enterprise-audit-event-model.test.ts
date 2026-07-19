import { describe, expect, it } from "vitest";
import {
  normalizeEnterpriseAuditEvent,
  redactEnterpriseAuditMetadata,
  sanitizeEnterpriseAuditSummary
} from "@/lib/enterprise-audit/audit-event-model";

describe("enterprise audit event model", () => {
  it("normalizes audit_logs and redacts sensitive metadata", () => {
    const event = normalizeEnterpriseAuditEvent(
      {
        id: "audit-1",
        organization_id: "org-1",
        actor_user_id: "user-1",
        contract_id: "contract-1",
        action: "contracts.exported",
        entity_type: "contract",
        entity_id: "contract-1",
        details: {
          format: "csv",
          summary: "Contracts exported",
          raw_contract_text: "raw contract text: never expose",
          provider_payload: { token: "secret-token" },
          nested: {
            storage_path: "private/path",
            safe_count: 3
          }
        },
        created_at: "2026-07-01T00:00:00.000Z"
      },
      "audit_logs"
    );

    expect(event).toMatchObject({
      organizationId: "org-1",
      contractId: "contract-1",
      actorUserId: "user-1",
      eventType: "contracts.exported",
      eventCategory: "export",
      eventSource: "audit_logs",
      isSecuritySensitive: true
    });
    expect(JSON.stringify(event)).not.toMatch(/raw contract text|secret-token|private\/path/i);
    expect(event.metadata.nested).toEqual({ safe_count: 3 });
  });

  it("marks trusted reminder gate events with approvals as trust-sensitive", () => {
    const event = normalizeEnterpriseAuditEvent(
      {
        id: "gate-1",
        organization_id: "org-1",
        actor_user_id: null,
        contract_id: "contract-1",
        event_type: "trusted_reminder_gate.used_with_approval",
        event_source: "trusted_reminder_gate",
        metadata: {
          approval_id: "approval-1",
          status: "allowed",
          snippet: "Clause text should not export"
        },
        created_at: "2026-07-01T00:00:00.000Z"
      },
      "trusted_reminder_gate_events"
    );

    expect(event.eventCategory).toBe("trusted_reminder");
    expect(event.isTrustSensitive).toBe(true);
    expect(JSON.stringify(event)).not.toMatch(/Clause text/i);
  });

  it("marks trust exception lifecycle events as trust-sensitive", () => {
    const approved = normalizeEnterpriseAuditEvent(
      {
        id: "approval-1",
        organization_id: "org-1",
        actor_user_id: "admin-1",
        contract_id: "contract-1",
        event_type: "trust_exception_approval.created",
        event_source: "contract_trust_exception_approvals",
        metadata: { evidence_confidence: 0.42 },
        created_at: "2026-07-01T00:00:00.000Z"
      },
      "trust_exception_approval_events"
    );

    expect(approved.eventCategory).toBe("trust_exception");
    expect(approved.isTrustSensitive).toBe(true);
    expect(approved.severity).toBe("info");
  });

  it("redacts sensitive summaries", () => {
    expect(sanitizeEnterpriseAuditSummary("raw contract text leaked here")).toBe(
      "Sensitive event recorded"
    );
  });

  it("recursively redacts nested arrays and objects", () => {
    const sanitized = redactEnterpriseAuditMetadata({
      safe_id: "id-1",
      nested: {
        rows: [
          { count: 1, ocr_output: "OCR output should disappear" },
          { token: "secret", status: "failed" }
        ]
      }
    });

    expect(sanitized).toEqual({
      safe_id: "id-1",
      nested: {
        rows: [{ count: 1 }, { status: "failed" }]
      }
    });
  });
});

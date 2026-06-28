import { describe, expect, it, vi } from "vitest";
import {
  OPERATIONAL_FAILURE_CATEGORIES,
  buildBillingEntitlementMismatchDiagnostic,
  buildFailedExportDiagnostic,
  buildFailedOcrDiagnostic,
  buildFailedReminderDiagnostic,
  buildFailedScimProvisioningDiagnostic,
  buildFailedSsoDiagnostic,
  buildOperationalLogEnvelope,
  buildSupportDiagnosticSummary,
  isOperationalFailureCategory,
  writeOperationalLog
} from "@/lib/observability/operational-logging";

const forbiddenMarkers = [
  "RAW_CONTRACT_TEXT_SHOULD_NOT_SURVIVE",
  "RAW_OCR_TEXT_SHOULD_NOT_SURVIVE",
  "SAML_ASSERTION_SHOULD_NOT_SURVIVE",
  "OIDC_TOKEN_SHOULD_NOT_SURVIVE",
  "SCIM_BEARER_SHOULD_NOT_SURVIVE",
  "SCIM_PAYLOAD_SHOULD_NOT_SURVIVE",
  "PAYMENT_SECRET_SHOULD_NOT_SURVIVE",
  "PROVIDER_RESPONSE_SHOULD_NOT_SURVIVE",
  "PRIVATE_KEY_SHOULD_NOT_SURVIVE",
  "PASSWORD_SHOULD_NOT_SURVIVE"
];

function expectNoForbiddenMarkers(value: unknown) {
  const rendered = JSON.stringify(value);
  for (const marker of forbiddenMarkers) {
    expect(rendered).not.toContain(marker);
  }
}

describe("operational logging contract", () => {
  it("builds a structured operational log envelope with safe metadata only", () => {
    const envelope = buildOperationalLogEnvelope({
      level: "error",
      operation: "export_failed",
      subsystem: "exports",
      organizationId: "org-1",
      actorId: "user-1",
      contractId: "contract-1",
      jobId: "export-job-1",
      requestId: "request-1",
      status: "failed",
      durationMs: 1234,
      retryCount: 2,
      errorCategory: "background_job_failed",
      safeMetadata: {
        row_count: 5000,
        raw_contract_text: "RAW_CONTRACT_TEXT_SHOULD_NOT_SURVIVE",
        nested: {
          ocr_text: "RAW_OCR_TEXT_SHOULD_NOT_SURVIVE",
          status: "retryable"
        }
      },
      error: new Error("RAW_CONTRACT_TEXT_SHOULD_NOT_SURVIVE")
    });

    expect(envelope).toMatchObject({
      level: "error",
      operation: "export_failed",
      subsystem: "exports",
      organizationId: "org-1",
      actorId: "user-1",
      contractId: "contract-1",
      jobId: "export-job-1",
      requestId: "request-1",
      status: "failed",
      durationMs: 1234,
      retryCount: 2,
      errorCategory: "background_job_failed",
      signalType: "operational_log",
      safeMetadata: {
        row_count: 5000,
        raw_contract_text: "[REDACTED]",
        nested: {
          ocr_text: "[REDACTED]",
          status: "retryable"
        }
      },
      error: {
        name: "Error",
        message: "[REDACTED]"
      }
    });
    expectNoForbiddenMarkers(envelope);
  });

  it("recursively strips identity, billing, provider, note, OCR, and password secrets", () => {
    const envelope = buildOperationalLogEnvelope({
      level: "warn",
      operation: "sso_callback_failed",
      subsystem: "enterprise_identity",
      status: "failed",
      errorCategory: "permission_denied",
      safeMetadata: {
        saml_assertion: "SAML_ASSERTION_SHOULD_NOT_SURVIVE",
        oidc_access_token: "OIDC_TOKEN_SHOULD_NOT_SURVIVE",
        scim_bearer_token: "SCIM_BEARER_SHOULD_NOT_SURVIVE",
        scim_payload: {
          body: "SCIM_PAYLOAD_SHOULD_NOT_SURVIVE"
        },
        payment_provider_response: "PROVIDER_RESPONSE_SHOULD_NOT_SURVIVE",
        payment_secret: "PAYMENT_SECRET_SHOULD_NOT_SURVIVE",
        private_key: "PRIVATE_KEY_SHOULD_NOT_SURVIVE",
        password: "PASSWORD_SHOULD_NOT_SURVIVE",
        safe_failure_code: "sso_provider_scope_mismatch"
      }
    });

    expect(envelope.safeMetadata).toMatchObject({
      saml_assertion: "[REDACTED]",
      oidc_access_token: "[REDACTED]",
      scim_bearer_token: "[REDACTED]",
      scim_payload: "[REDACTED]",
      payment_provider_response: "[REDACTED]",
      payment_secret: "[REDACTED]",
      private_key: "[REDACTED]",
      password: "[REDACTED]",
      safe_failure_code: "sso_provider_scope_mismatch"
    });
    expectNoForbiddenMarkers(envelope);
  });

  it("keeps audit, operational logs, and analytics modeled as separate signal types", () => {
    const envelope = buildOperationalLogEnvelope({
      level: "info",
      operation: "reminder_retry_scheduled",
      subsystem: "reminders",
      status: "retrying",
      errorCategory: "retry_scheduled"
    });

    expect(envelope.signalType).toBe("operational_log");
    expect(envelope).not.toHaveProperty("action");
    expect(envelope).not.toHaveProperty("analyticsEvent");
    expect(envelope).not.toHaveProperty("auditEvent");
  });

  it("keeps failure categories stable and documented in code", () => {
    expect(OPERATIONAL_FAILURE_CATEGORIES).toEqual([
      "validation_failed",
      "permission_denied",
      "entitlement_denied",
      "tenant_scope_mismatch",
      "upstream_provider_failed",
      "timeout",
      "retry_scheduled",
      "retry_exhausted",
      "background_job_failed",
      "partial_success",
      "cancelled",
      "unknown"
    ]);
    expect(isOperationalFailureCategory("timeout")).toBe(true);
    expect(isOperationalFailureCategory("raw_contract_error")).toBe(false);
  });

  it("builds support diagnostics with useful IDs and no sensitive payloads", () => {
    const diagnostics = [
      buildFailedExportDiagnostic({
        organizationId: "org-1",
        actorId: "user-1",
        jobId: "export-job-1",
        requestId: "request-1",
        status: "failed",
        failureCategory: "background_job_failed",
        failureCode: "EXPORT_ARTIFACT_TOO_LARGE",
        retryCount: 0,
        safeMetadata: {
          export_preset: "notes_and_decisions_export",
          note_body: "RAW_CONTRACT_TEXT_SHOULD_NOT_SURVIVE"
        }
      }),
      buildFailedReminderDiagnostic({
        organizationId: "org-1",
        contractId: "contract-1",
        jobId: "reminder-1",
        status: "retrying",
        failureCategory: "retry_scheduled",
        failureCode: "REMINDER_PROVIDER_RETRY"
      }),
      buildFailedOcrDiagnostic({
        organizationId: "org-1",
        jobId: "ocr-job-1",
        status: "failed",
        failureCategory: "upstream_provider_failed",
        safeMetadata: { ocr_output: "RAW_OCR_TEXT_SHOULD_NOT_SURVIVE" }
      }),
      buildFailedScimProvisioningDiagnostic({
        organizationId: "org-1",
        jobId: "scim-user-1",
        status: "denied",
        failureCategory: "permission_denied",
        safeMetadata: { scim_payload: "SCIM_PAYLOAD_SHOULD_NOT_SURVIVE" }
      }),
      buildFailedSsoDiagnostic({
        organizationId: "org-1",
        requestId: "sso-request-1",
        status: "denied",
        failureCategory: "permission_denied",
        safeMetadata: { saml_response: "SAML_ASSERTION_SHOULD_NOT_SURVIVE" }
      }),
      buildBillingEntitlementMismatchDiagnostic({
        organizationId: "org-1",
        requestId: "billing-request-1",
        status: "failed",
        failureCategory: "entitlement_denied",
        safeMetadata: { provider_payload: "PROVIDER_RESPONSE_SHOULD_NOT_SURVIVE" }
      })
    ];

    expect(diagnostics[0]).toMatchObject({
      subsystem: "exports",
      operation: "export_failed",
      organizationId: "org-1",
      jobId: "export-job-1",
      failureCode: "EXPORT_ARTIFACT_TOO_LARGE",
      signalType: "support_diagnostic"
    });
    expect(diagnostics[1]).toMatchObject({
      subsystem: "reminders",
      operation: "reminder_failed"
    });
    expect(diagnostics[2]).toMatchObject({ subsystem: "ocr", operation: "ocr_job_failed" });
    expect(diagnostics[3]).toMatchObject({
      subsystem: "enterprise_identity",
      operation: "scim_provisioning_failed"
    });
    expect(diagnostics[4]).toMatchObject({
      subsystem: "enterprise_identity",
      operation: "sso_callback_failed"
    });
    expect(diagnostics[5]).toMatchObject({
      subsystem: "billing",
      operation: "billing_entitlement_mismatch"
    });
    expectNoForbiddenMarkers(diagnostics);
  });

  it("writes operational logs through structured server logging without changing audit truth", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const envelope = writeOperationalLog({
      level: "warn",
      operation: "billing_entitlement_mismatch",
      subsystem: "billing",
      organizationId: "org-1",
      requestId: "request-1",
      status: "failed",
      errorCategory: "entitlement_denied",
      safeMetadata: {
        provider_payload: "PROVIDER_RESPONSE_SHOULD_NOT_SURVIVE"
      }
    });

    expect(envelope.signalType).toBe("operational_log");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("ops.billing.billing_entitlement_mismatch"));
    expect(spy.mock.calls.join("\n")).not.toContain("PROVIDER_RESPONSE_SHOULD_NOT_SURVIVE");
    spy.mockRestore();
  });
});

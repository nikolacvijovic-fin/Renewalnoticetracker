import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALERT_RULES,
  buildIncidentSnapshot
} from "@/lib/observability/alert-rules";
import {
  FORBIDDEN_METRIC_DIMENSIONS,
  METRIC_CONTRACTS,
  SAFE_METRIC_DIMENSIONS,
  isForbiddenMetricDimension,
  isSafeMetricDimension
} from "@/lib/observability/metrics";

const projectRoot = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(join(projectRoot, path), "utf8");
}

const forbiddenMarkers = [
  "RAW_CONTRACT_TEXT_SHOULD_NOT_SURVIVE",
  "NOTE_BODY_SHOULD_NOT_SURVIVE",
  "OCR_OUTPUT_SHOULD_NOT_SURVIVE",
  "SAML_ASSERTION_SHOULD_NOT_SURVIVE",
  "OIDC_TOKEN_SHOULD_NOT_SURVIVE",
  "SCIM_BEARER_SHOULD_NOT_SURVIVE",
  "SCIM_PAYLOAD_SHOULD_NOT_SURVIVE",
  "BILLING_PROVIDER_PAYLOAD_SHOULD_NOT_SURVIVE",
  "STORAGE_PATH_SHOULD_NOT_SURVIVE",
  "PROVIDER_RESPONSE_SHOULD_NOT_SURVIVE",
  "SECRET_SHOULD_NOT_SURVIVE"
];

function expectNoForbiddenMarkers(value: unknown) {
  const rendered = JSON.stringify(value);
  for (const marker of forbiddenMarkers) {
    expect(rendered).not.toContain(marker);
  }
}

describe("metrics and alert rules as code", () => {
  it("defines metric contracts with bounded safe dimensions", () => {
    expect(Object.keys(METRIC_CONTRACTS).length).toBeGreaterThanOrEqual(20);

    for (const [metricName, contract] of Object.entries(METRIC_CONTRACTS)) {
      expect(contract.name).toBe(metricName);
      expect(["counter", "gauge", "histogram"]).toContain(contract.type);
      expect(contract.description.length, metricName).toBeGreaterThan(20);
      expect(contract.allowedDimensions.length, metricName).toBeGreaterThan(0);
      expect(contract.ownerRunbookArea.length, metricName).toBeGreaterThan(0);

      for (const dimension of contract.allowedDimensions) {
        expect(SAFE_METRIC_DIMENSIONS, `${metricName}:${dimension}`).toContain(dimension);
        expect(FORBIDDEN_METRIC_DIMENSIONS, `${metricName}:${dimension}`).not.toContain(dimension);
      }

      for (const forbidden of FORBIDDEN_METRIC_DIMENSIONS) {
        expect(contract.forbiddenDimensions, `${metricName}:${forbidden}`).toContain(forbidden);
        expect(contract.allowedDimensions, `${metricName}:${forbidden}`).not.toContain(forbidden);
      }
    }

    expect(isSafeMetricDimension("errorCategory")).toBe(true);
    expect(isForbiddenMetricDimension("contractText")).toBe(true);
    expect(isSafeMetricDimension("contractText")).toBe(false);
  });

  it("keeps alert rules linked to known metric contracts and valid runbooks", () => {
    const runbooks = readProjectFile("docs/OPERATIONAL_RUNBOOKS.md");

    expect(Object.keys(ALERT_RULES).length).toBeGreaterThanOrEqual(10);
    for (const [ruleId, rule] of Object.entries(ALERT_RULES)) {
      expect(rule.id).toBe(ruleId);
      expect(METRIC_CONTRACTS[rule.metricName], `${ruleId}:${rule.metricName}`).toBeDefined();
      expect(rule.threshold, ruleId).toBeGreaterThan(0);
      expect(rule.timeWindowMinutes, ruleId).toBeGreaterThan(0);
      expect(runbooks, rule.runbookId).toContain(`Runbook ID: \`${rule.runbookId}\``);
      expect(rule.safeDiagnosticFields.length, ruleId).toBeGreaterThan(0);

      for (const field of rule.safeDiagnosticFields) {
        expect(SAFE_METRIC_DIMENSIONS, `${ruleId}:${field}`).toContain(field);
        expect(rule.forbiddenDiagnosticFields, `${ruleId}:${field}`).not.toContain(field);
      }

      for (const forbidden of FORBIDDEN_METRIC_DIMENSIONS) {
        expect(rule.forbiddenDiagnosticFields, `${ruleId}:${forbidden}`).toContain(forbidden);
        expect(rule.safeDiagnosticFields, `${ruleId}:${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("sanitizes incident snapshots and keeps them separate from audit, logs, analytics, and events", () => {
    const snapshot = buildIncidentSnapshot({
      subsystem: "exports",
      alertRuleId: "tenant_isolation_export_authorization_anomaly",
      severity: "P0",
      affectedOrganizationCount: 1,
      affectedJobCount: 2,
      oldestFailedOrStuckAgeMinutes: 18,
      retryExhaustedCount: 1,
      recentSafeEventIds: Array.from({ length: 30 }, (_, index) => `event-${index}`),
      failureCategory: "tenant_scope_mismatch",
      runbookId: "runbook_tenant_isolation_export_authorization",
      safeMetadata: {
        raw_contract_text: "RAW_CONTRACT_TEXT_SHOULD_NOT_SURVIVE",
        note_body: "NOTE_BODY_SHOULD_NOT_SURVIVE",
        nested: {
          ocr_text: "OCR_OUTPUT_SHOULD_NOT_SURVIVE",
          saml_assertion: "SAML_ASSERTION_SHOULD_NOT_SURVIVE",
          oidc_token: "OIDC_TOKEN_SHOULD_NOT_SURVIVE",
          scim_bearer_token: "SCIM_BEARER_SHOULD_NOT_SURVIVE",
          scim_payload: "SCIM_PAYLOAD_SHOULD_NOT_SURVIVE",
          billing_provider_payload: "BILLING_PROVIDER_PAYLOAD_SHOULD_NOT_SURVIVE",
          storage_object_path: "STORAGE_PATH_SHOULD_NOT_SURVIVE",
          provider_response: "PROVIDER_RESPONSE_SHOULD_NOT_SURVIVE",
          secret: "SECRET_SHOULD_NOT_SURVIVE"
        }
      }
    });

    expect(snapshot).toMatchObject({
      signalType: "incident_snapshot",
      subsystem: "exports",
      alertRuleId: "tenant_isolation_export_authorization_anomaly",
      severity: "P0",
      affectedOrganizationCount: 1,
      affectedJobCount: 2,
      oldestFailedOrStuckAgeMinutes: 18,
      retryExhaustedCount: 1,
      failureCategory: "tenant_scope_mismatch",
      runbookId: "runbook_tenant_isolation_export_authorization"
    });
    expect(snapshot.recentSafeEventIds).toHaveLength(25);
    expect(snapshot).not.toHaveProperty("auditEvent");
    expect(snapshot).not.toHaveProperty("analyticsEvent");
    expect(snapshot).not.toHaveProperty("operationalLog");
    expectNoForbiddenMarkers(snapshot);
  });

  it("documents metrics, alert rules, and future backend boundaries", () => {
    const maturity = readProjectFile("docs/OPERATIONAL_MATURITY.md");
    const inventory = readProjectFile("docs/OPERATIONAL_EVENT_INVENTORY.md");

    for (const required of [
      "metric contracts",
      "alert rules as code",
      "incident snapshots",
      "operational events are not metrics",
      "alert webhook delivery is not alert-rule evaluation",
      "Datadog",
      "Grafana",
      "Sentry",
      "OpenTelemetry"
    ]) {
      expect(`${maturity}\n${inventory}`).toContain(required);
    }
  });

  it("wires metrics alert-rule tests into monitoring readiness", () => {
    const packageJson = JSON.parse(readProjectFile("package.json")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["test:monitoring-readiness"]).toContain(
      "tests/metrics-alert-rules.test.ts"
    );
  });
});

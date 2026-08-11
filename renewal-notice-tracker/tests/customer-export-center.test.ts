import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  CUSTOMER_EXPORT_CENTER_OPTIONS,
  buildAuditSafeHistoryRows,
  buildCustomerExportJson,
  buildCustomerExportSummary,
  buildCustomerExportWorkbookBuffer,
  buildLeadershipSummaryPdfBuffer,
  buildOwnerActionRows,
  buildRenewalDeadlineRegisterRows,
  buildRenewalDecisionRows,
  buildRiskFindingRows,
  buildUrgentDeadlineRows
} from "@/lib/exports/customer-export-center";

const generatedAt = "2026-08-09T00:00:00.000Z";

const renewalRows = [
  {
    contract_title: "Acme MSA",
    counterparty_name: "Acme",
    notice_deadline_date: "2026-08-15",
    renewal_date: "2026-09-15",
    expiration_date: "2026-09-15",
    auto_renewal: "Yes",
    owner_name: "Finance Owner",
    department: "Finance",
    contract_value_amount: 12000,
    contract_value_currency: "USD",
    needs_review: "No",
    renewal_decision_status: "pending",
    next_reminder_date: "2026-08-10",
    latest_reminder_status: "sent",
    raw_contract_text: "raw contract text must not export",
    provider_payload: "provider payload must not export",
    private_note: "private note must not export"
  },
  {
    contract_title: "Beta Subscription",
    counterparty_name: "Beta",
    notice_deadline_date: "",
    renewal_date: "2026-12-01",
    expiration_date: "2026-12-01",
    auto_renewal: "No",
    owner_name: "Unassigned",
    department: "",
    contract_value_amount: 3000,
    contract_value_currency: "USD",
    needs_review: "Yes",
    renewal_decision_status: "",
    next_reminder_date: "",
    latest_reminder_status: ""
  }
];

describe("customer export center", () => {
  it("defines customer-friendly exports without public API or integration destinations", () => {
    expect(CUSTOMER_EXPORT_CENTER_OPTIONS.map((option) => option.id)).toEqual([
      "renewal_deadline_register",
      "urgent_deadlines",
      "saas_opt_out_clock",
      "owner_action_list",
      "renewal_decisions",
      "risk_findings",
      "audit_safe_activity_history",
      "full_mvp_export_bundle"
    ]);
    expect(CUSTOMER_EXPORT_CENTER_OPTIONS.flatMap((option) => option.formats)).toEqual(
      expect.arrayContaining(["csv", "xlsx", "pdf", "json", "ics"])
    );
    expect(JSON.stringify(CUSTOMER_EXPORT_CENTER_OPTIONS)).not.toMatch(/slack|teams|google drive|public api|crm sync/i);
  });

  it("labels partial export datasets instead of advertising unavailable JSON or spreadsheet contents", () => {
    const saasOption = CUSTOMER_EXPORT_CENTER_OPTIONS.find((option) => option.id === "saas_opt_out_clock");
    const riskOption = CUSTOMER_EXPORT_CENTER_OPTIONS.find((option) => option.id === "risk_findings");
    const bundleOption = CUSTOMER_EXPORT_CENTER_OPTIONS.find((option) => option.id === "full_mvp_export_bundle");

    expect(saasOption).toMatchObject({
      availability: "partial",
      formats: ["ics"]
    });
    expect(saasOption?.availabilityNote).toMatch(/Spreadsheet and JSON SaaS opt-out datasets are intentionally deferred/i);
    expect(riskOption?.availability).toBe("partial");
    expect(bundleOption?.availability).toBe("partial");
  });

  it("routes multi-dataset workbook links to the customer export workbook route", () => {
    const workbookBackedIds = new Set([
      "urgent_deadlines",
      "owner_action_list",
      "renewal_decisions",
      "risk_findings",
      "full_mvp_export_bundle"
    ]);

    for (const option of CUSTOMER_EXPORT_CENTER_OPTIONS) {
      if (!workbookBackedIds.has(option.id) || !option.formats.includes("xlsx")) continue;
      expect(option.hrefs.xlsx).toBe("/dashboard/exports/customer-data.xlsx");
    }
  });

  it("builds renewal deadline register rows with safe expected fields only", () => {
    const rows = buildRenewalDeadlineRegisterRows(renewalRows);

    expect(rows[0]).toMatchObject({
      contract_title: "Acme MSA",
      counterparty_name: "Acme",
      notice_deadline_date: "2026-08-15",
      owner_name: "Finance Owner",
      contract_value_amount: 12000
    });
    expect(Object.keys(rows[0] ?? {})).not.toContain("raw_contract_text");
    expect(Object.keys(rows[0] ?? {})).not.toContain("provider_payload");
    expect(Object.keys(rows[0] ?? {})).not.toContain("private_note");
  });

  it("filters urgent deadlines to due-soon, missing, or needs-review rows", () => {
    const urgent = buildUrgentDeadlineRows(renewalRows, generatedAt);

    expect(urgent.map((row) => row.contract_title)).toEqual(["Acme MSA", "Beta Subscription"]);
  });

  it("exports safe JSON with schema version and no unsafe payload markers", () => {
    const json = buildCustomerExportJson({
      organizationId: "org-1",
      generatedAt,
      renewalRows,
      auditHistory: [
        {
          timestamp: generatedAt,
          actorUserId: "user-1",
          entityType: "contract",
          entityId: "contract-1",
          action: "contract.reviewed",
          metadata: {
            fromStatus: "needs_review",
            toStatus: "trusted",
            rawContractText: "raw contract text",
            provider_payload: "provider payload",
            privateNote: "private note"
          }
        }
      ]
    });

    const serialized = JSON.stringify(json);
    expect(json.schemaVersion).toBe("noticecontrol.customer_export.v1");
    expect(json.datasets.renewalDeadlineRegister).toHaveLength(2);
    expect(json.datasets.ownerActionList).toEqual(buildOwnerActionRows(renewalRows));
    expect(json.datasets.renewalDecisions).toEqual(buildRenewalDecisionRows(renewalRows));
    expect(json.datasets.riskFindings).toEqual(buildRiskFindingRows(renewalRows, generatedAt));
    expect(json.datasets.auditSafeHistory[0]?.safe_metadata).toContain("fromStatus");
    expect(serialized).not.toContain("raw contract text");
    expect(serialized).not.toContain("provider payload");
    expect(serialized).not.toContain("private note");
  });

  it("keeps advertised JSON export links aligned with populated JSON datasets", () => {
    const json = buildCustomerExportJson({
      organizationId: "org-1",
      generatedAt,
      renewalRows,
      auditHistory: []
    });
    const datasetByExportId: Record<string, keyof typeof json.datasets> = {
      renewal_deadline_register: "renewalDeadlineRegister",
      urgent_deadlines: "urgentDeadlines",
      owner_action_list: "ownerActionList",
      renewal_decisions: "renewalDecisions",
      risk_findings: "riskFindings",
      audit_safe_activity_history: "auditSafeHistory"
    };

    for (const option of CUSTOMER_EXPORT_CENTER_OPTIONS) {
      if (!option.formats.includes("json") || option.id === "full_mvp_export_bundle") continue;
      const datasetKey = datasetByExportId[option.id];
      expect(datasetKey, `${option.id} must map to a generated JSON dataset`).toBeDefined();
      if (!datasetKey) throw new Error(`${option.id} must map to a generated JSON dataset`);
      expect(json.datasets[datasetKey]).toBeDefined();
    }
  });

  it("creates an XLSX workbook with expected leadership and reporting sheets", () => {
    const workbook = XLSX.read(
      buildCustomerExportWorkbookBuffer({
        organizationId: "org-1",
        generatedAt,
        renewalRows,
        auditHistory: []
      }),
      { type: "buffer" }
    );

    expect(workbook.SheetNames).toEqual([
      "Summary",
      "Renewal Deadlines",
      "Urgent Deadlines",
      "Decisions",
      "Owners",
      "Risk Findings",
      "Dataset Notes",
      "Audit History"
    ]);
  });

  it("builds a leadership PDF buffer with summary metrics", () => {
    const pdf = buildLeadershipSummaryPdfBuffer({
      organizationId: "org-1",
      generatedAt,
      renewalRows,
      auditHistory: []
    });

    const content = pdf.toString("utf8");
    expect(content.startsWith("%PDF-1.4")).toBe(true);
    expect(content).toContain("NoticeControl Leadership Renewal Summary");
    expect(content).toContain("Contracts: 2");
    expect(content).toContain("Urgent deadlines: 2");
  });

  it("strips audit-safe history metadata down to safe fields", () => {
    const rows = buildAuditSafeHistoryRows([
      {
        timestamp: generatedAt,
        actorUserId: "user-1",
        entityType: "export",
        entityId: "export-1",
        action: "export.created",
        metadata: {
          fromStatus: "queued",
          toStatus: "completed",
          emailBody: "email body",
          token: "secret_token",
          storagePath: "storage/private/file.pdf"
        }
      }
    ]);

    const serialized = JSON.stringify(rows);
    expect(serialized).toContain("fromStatus");
    expect(serialized).toContain("toStatus");
    expect(serialized).not.toContain("email body");
    expect(serialized).not.toContain("secret_token");
    expect(serialized).not.toContain("storage/private");
  });

  it("summarizes contract count, urgent items, decisions, review items, and spend at risk", () => {
    expect(
      buildCustomerExportSummary({
        organizationId: "org-1",
        generatedAt,
        renewalRows,
        auditHistory: []
      })
    ).toMatchObject({
      contractCount: 2,
      urgentDeadlineCount: 2,
      needsReviewCount: 1,
      decisionRecordedCount: 1,
      spendAtRiskAmount: 15000
    });
  });
});

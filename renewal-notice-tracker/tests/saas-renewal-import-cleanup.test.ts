import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  assessSaasRenewalImportRows,
  buildSaasRenewalActivationPlan,
  parseSaasRenewalImportFile,
  SAAS_RENEWAL_IMPORT_TEMPLATE_HEADERS,
  SaasRenewalImportTemplateError,
  type SaasRenewalImportRow
} from "@/lib/saas/import-cleanup";
import { buildRenewalCommandCenter } from "@/lib/dashboard/renewal-command-center";

const owners = new Map([
  ["owner@example.com", { userId: "user-1", label: "Ava Owner" }],
  ["finance@example.com", { userId: "user-2", label: "Finance Lead" }]
]);

function row(overrides: Partial<SaasRenewalImportRow> = {}): SaasRenewalImportRow {
  return {
    vendor_name: "Acme Inc.",
    product_name: "Acme Cloud",
    renewal_date: "2026-10-01",
    notice_deadline_date: "2026-08-15",
    notice_period: "",
    contract_value_amount: "50000",
    contract_value_currency: "usd",
    owner_email: "owner@example.com",
    department_category: "Finance",
    source_notes: "Imported source: signed order form",
    ...overrides
  };
}

function csv(rows: string[]) {
  return Buffer.from([SAAS_RENEWAL_IMPORT_TEMPLATE_HEADERS.join(","), ...rows].join("\n"), "utf8");
}

describe("SaaS renewal import cleanup", () => {
  it("enforces the SaaS renewal import template", () => {
    expect(() =>
      parseSaasRenewalImportFile("saas.csv", Buffer.from("vendor_name,product_name\nAcme,Cloud", "utf8"))
    ).toThrow(SaasRenewalImportTemplateError);
  });

  it("parses valid CSV rows and quoted vendor names", () => {
    const rows = parseSaasRenewalImportFile(
      "saas.csv",
      csv([
        '"Acme, Inc.",Acme Cloud,2026-10-01,2026-08-15,,50000,USD,owner@example.com,Finance,"Imported source: order form"'
      ])
    );

    expect(rows).toEqual([
      expect.objectContaining({
        vendor_name: "Acme, Inc.",
        product_name: "Acme Cloud",
        owner_email: "owner@example.com"
      })
    ]);
  });

  it("parses valid XLSX rows", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      [...SAAS_RENEWAL_IMPORT_TEMPLATE_HEADERS],
      ["Globex", "Globex Suite", "2026-12-01", "2026-10-15", "", 12000, "EUR", "finance@example.com", "Ops", "Imported source: invoice"]
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "SaaS renewals");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const rows = parseSaasRenewalImportFile("saas.xlsx", buffer);

    expect(rows[0]).toEqual(expect.objectContaining({
      vendor_name: "Globex",
      product_name: "Globex Suite",
      contract_value_currency: "EUR"
    }));
  });

  it("classifies clean rows as ready and maps owner emails to organization members", () => {
    const assessment = assessSaasRenewalImportRows([row()], { ownersByEmail: owners });

    expect(assessment.results[0]).toMatchObject({
      status: "ready",
      normalized: {
        ownerUserId: "user-1",
        ownerLabel: "Ava Owner",
        contractValueCurrency: "USD",
        calculatedNoticeDeadline: "2026-08-15"
      }
    });
    expect(assessment.summary).toMatchObject({
      readyCount: 1,
      spendAtRiskAmount: 50000,
      spendAtRiskCurrency: "USD"
    });
  });

  it("rejects invalid dates, currencies, and amounts", () => {
    const assessment = assessSaasRenewalImportRows([
      row({
        renewal_date: "01/02/2026",
        notice_deadline_date: "not a date",
        contract_value_amount: "-20",
        contract_value_currency: "US dollars"
      })
    ], { ownersByEmail: owners });

    expect(assessment.results[0]?.status).toBe("rejected");
    expect(assessment.results[0]?.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "invalid_renewal_date",
        "invalid_notice_deadline_date",
        "invalid_contract_value_amount",
        "invalid_contract_value_currency"
      ])
    );
  });

  it("flags missing notice deadlines, unmapped owners, weak evidence, and duplicates for review", () => {
    const assessment = assessSaasRenewalImportRows([
      row({
        vendor_name: "Acme, Inc.",
        notice_deadline_date: "",
        notice_period: "",
        owner_email: "unknown@example.com",
        source_notes: "Manual spreadsheet only"
      }),
      row({
        vendor_name: "Acme LLC",
        notice_deadline_date: "",
        notice_period: "",
        owner_email: "unknown@example.com",
        source_notes: "Manual spreadsheet only"
      })
    ], { ownersByEmail: owners });

    expect(assessment.results.map((result) => result.status)).toEqual(["needs_review", "needs_review"]);
    expect(assessment.summary).toMatchObject({
      missingNoticeDeadlineCount: 2,
      missingOwnerCount: 2,
      duplicateSuspectedCount: 2,
      weakEvidenceCount: 2
    });
    expect(assessment.results[0]?.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "missing_notice_deadline",
        "owner_email_unmapped",
        "duplicate_suspected",
        "weak_evidence"
      ])
    );
  });

  it("calculates notice deadlines from notice periods when explicit deadlines are missing", () => {
    const assessment = assessSaasRenewalImportRows([
      row({
        notice_deadline_date: "",
        notice_period: "45 days"
      })
    ], { ownersByEmail: owners });

    expect(assessment.results[0]).toMatchObject({
      status: "ready",
      normalized: {
        calculatedNoticeDeadline: "2026-08-17",
        noticePeriodValue: 45,
        noticePeriodUnit: "days"
      }
    });
  });

  it("does not activate opt-out clock payloads for rows that still need review", () => {
    const assessment = assessSaasRenewalImportRows([
      row(),
      row({
        product_name: "Acme Cloud Pro",
        notice_deadline_date: "",
        notice_period: "",
        source_notes: "Manual estimate"
      })
    ], { ownersByEmail: owners });

    const plan = buildSaasRenewalActivationPlan(assessment);

    expect(plan.readyRows).toHaveLength(1);
    expect(plan.readyRows[0]).toMatchObject({
      software: {
        name: "Acme Cloud",
        vendorName: "Acme Inc.",
        ownerUserId: "user-1"
      },
      optOutWindow: {
        optOutDeadline: "2026-08-15",
        source: "explicit",
        workflowStatus: "ready"
      }
    });
    expect(plan.blockedRows).toEqual([
      expect.objectContaining({
        rowNumber: 3,
        status: "needs_review",
        issueCodes: expect.arrayContaining(["missing_notice_deadline", "weak_evidence"])
      })
    ]);
  });

  it("requires explicit weak evidence acceptance before manual-only evidence can become ready", () => {
    const withoutAcceptance = assessSaasRenewalImportRows([
      row({ source_notes: "Manual spreadsheet only" })
    ], { ownersByEmail: owners });
    const withAcceptance = assessSaasRenewalImportRows([
      row({ source_notes: "Manual spreadsheet only" })
    ], {
      ownersByEmail: owners,
      acceptedWeakEvidenceRowNumbers: new Set([2])
    });

    expect(withoutAcceptance.results[0]).toMatchObject({
      status: "needs_review",
      issues: expect.arrayContaining([expect.objectContaining({ code: "weak_evidence" })])
    });
    expect(withAcceptance.results[0]).toMatchObject({
      status: "ready",
      issues: []
    });
  });

  it("requires explicit duplicate confirmation before duplicate rows can become ready", () => {
    const withoutConfirmation = assessSaasRenewalImportRows([
      row(),
      row({ vendor_name: "Acme LLC" })
    ], { ownersByEmail: owners });
    const withConfirmation = assessSaasRenewalImportRows([
      row(),
      row({ vendor_name: "Acme LLC" })
    ], {
      ownersByEmail: owners,
      acceptedDuplicateRowNumbers: new Set([2, 3])
    });

    expect(withoutConfirmation.results.map((result) => result.status)).toEqual(["needs_review", "needs_review"]);
    expect(withoutConfirmation.results.flatMap((result) => result.issues.map((issue) => issue.code))).toContain("duplicate_suspected");
    expect(withConfirmation.results.map((result) => result.status)).toEqual(["ready", "ready"]);
    expect(withConfirmation.results.flatMap((result) => result.issues.map((issue) => issue.code))).not.toContain("duplicate_suspected");
  });

  it("keeps review queue migration scoped and free of notice-sending behavior", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const migration = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/202607300004_saas_renewal_import_review_queue.sql"),
      "utf8"
    );

    expect(migration).toContain("saas_renewal_import_batches");
    expect(migration).toContain("saas_renewal_import_rows");
    expect(migration).toContain("uploaded_by_user_id");
    expect(migration).toContain("original_filename");
    expect(migration).toContain("total_rows");
    expect(migration).toContain("activated_count");
    expect(migration).toContain("dismissed_count");
    expect(migration).toContain("review_note");
    expect(migration).toContain("original_row_json");
    expect(migration).toContain("normalized_row_json");
    expect(migration).toContain("issue_codes");
    expect(migration).toContain("correction_json");
    expect(migration).toContain("weak_evidence_accepted");
    expect(migration).toContain("duplicate_confirmed");
    expect(migration).toContain("reviewed_by_user_id");
    expect(migration).toContain("activated_at");
    expect(migration).toContain("dismissed_at");
    expect(migration).toContain("'corrected'");
    expect(migration).toContain("'dismissed'");
    expect(migration).toContain("memberships.organization_id = saas_renewal_import_rows.organization_id");
    expect(migration).not.toMatch(/send|email provider|slack|teams|crm/i);
  });

  it("feeds imported ready records into command-center SaaS opt-out metrics", () => {
    const assessment = assessSaasRenewalImportRows([row()], { ownersByEmail: owners });
    const plan = buildSaasRenewalActivationPlan(assessment);
    const commandCenter = buildRenewalCommandCenter({
      organizationId: "org-1",
      now: new Date("2026-07-30T00:00:00Z"),
      contracts: [],
      saasOptOutItems: plan.readyRows.map((readyRow) => ({
        contractId: null,
        deadlineWindow: "due_30_days",
        workflowStatus: readyRow.optOutWindow.workflowStatus,
        ownerUserId: readyRow.optOutWindow.ownerUserId,
        spendAtRiskAmount: readyRow.term.contractValueAmount ?? 0
      }))
    });

    expect(commandCenter.saasOptOutSummary).toMatchObject({
      totalRiskItems: 1,
      dueIn30DaysCount: 1,
      assignedOwnerCount: 1,
      spendAtRiskAmount: 50000
    });
  });

  it("surfaces blocked SaaS import review rows in command-center actions without trusting them", () => {
    const commandCenter = buildRenewalCommandCenter({
      organizationId: "org-1",
      now: new Date("2026-07-30T00:00:00Z"),
      contracts: [],
      saasImportReview: {
        latestBatchId: "batch-1",
        blockedBatchCount: 1,
        readyCount: 1,
        correctedCount: 1,
        needsReviewCount: 2,
        rejectedCount: 1
      }
    });

    expect(commandCenter.saasImportReviewSummary).toMatchObject({
      blockedBatchCount: 1,
      blockedRowCount: 3,
      needsReviewCount: 2,
      rejectedCount: 1
    });
    expect(commandCenter.saasOptOutSummary.totalRiskItems).toBe(0);
    expect(commandCenter.recommendedActions[0]).toEqual(expect.objectContaining({
      id: "review_saas_renewal_imports",
      affectedCount: 3,
      targetHref: "/dashboard/saas-opt-out-clock#import-review"
    }));
  });
});

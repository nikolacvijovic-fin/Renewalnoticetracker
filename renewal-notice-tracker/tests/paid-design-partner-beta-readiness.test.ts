import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { evaluateDesignPartnerBetaMutation, type DesignPartnerBetaControl } from "@/lib/billing/design-partner-beta";
import { buildStableSubscriptionUsageFindingIdentity, deriveVersionFamily } from "@/lib/subscription-usage/finding-identity";
import { buildExecutiveValuePdf, buildExecutiveValueSummary, buildExecutiveValueWorkbook } from "@/lib/subscription-usage/executive-value-report";

const read = (...segments: string[]) => fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");
const migration = () => read("supabase", "migrations", "202608240001_paid_design_partner_beta_readiness.sql");
const pgcryptoSearchPathFix = () =>
  read("supabase", "migrations", "202608290003_subscription_usage_pgcrypto_search_path_fix.sql");

const activeControl: DesignPartnerBetaControl = {
  organizationId: "org-1",
  status: "active",
  maximumContracts: 5,
  maximumProviderConnections: 2,
  maximumUserSeats: 5,
  allowedProviders: ["microsoft_365", "google_workspace"],
  expiresAt: "2026-09-30T00:00:00.000Z",
  graceEndsAt: "2026-10-07T00:00:00.000Z",
  founderApprovedAt: "2026-08-20T00:00:00.000Z"
};

function reportInput() {
  return {
    organizationId: "org-1",
    organizationName: "Northstar Design Partner",
    periodStart: "2026-07-01",
    periodEnd: "2026-09-30",
    generatedAt: "2026-08-24T00:00:00.000Z",
    contractsMonitored: 4,
    protectedDeadlineCount: 3,
    providerFreshness: [{ provider: "microsoft_365", lastSuccessfulSyncAt: "2026-08-23T00:00:00.000Z" }],
    upcomingActions: [{ contractId: "contract-1", title: "=Formula Vendor", deadline: "2026-09-01" }],
    findings: [
      { id: "active-usd", findingType: "unused_seats", reviewStatus: "accepted", estimatedSavings: 100, realizedSavings: 80, currency: "USD", confidence: 0.9 },
      { id: "active-eur", findingType: "unused_seats", reviewStatus: "open", estimatedSavings: 50, realizedSavings: null, currency: "EUR", confidence: 0.8 },
      { id: "resolved", findingType: "unused_seats", reviewStatus: "accepted", estimatedSavings: 900, realizedSavings: 900, currency: "USD", confidence: 0.9, resolvedAt: "2026-08-20T00:00:00Z" },
      { id: "rejected", findingType: "unused_seats", reviewStatus: "rejected", estimatedSavings: 700, realizedSavings: null, currency: "USD", confidence: 0.9, feedbackClassification: "incorrect" },
      { id: "sample", findingType: "unused_seats", reviewStatus: "open", estimatedSavings: 500, realizedSavings: null, currency: "USD", confidence: 0.9, isSample: true }
    ],
    confirmedOutcomes: [
      { id: "outcome-1", realizedSavings: 80, currency: "USD", renewalCompletedAt: "2026-08-22T00:00:00Z" }
    ]
  };
}

describe("paid design-partner beta readiness", () => {
  it("resolves pgcrypto only through an explicit trusted function search path", () => {
    const sql = pgcryptoSearchPathFix();

    expect(sql).toContain(
      "alter function public.create_subscription_usage_analysis_scope(uuid, uuid, boolean)"
    );
    expect(sql).toContain(
      "alter function public.begin_manual_subscription_usage_sync_attempt(uuid, uuid, text, text, boolean)"
    );
    expect(sql.match(/set search_path = pg_catalog, public, extensions, pg_temp/g)).toHaveLength(2);
  });

  it("excludes resolved findings from active queries and blocks historical review requests", () => {
    const page = read("app", "dashboard", "subscription-optimization", "page.tsx");
    const action = read("lib", "actions", "subscription-usage-optimization.ts");
    expect(page).toContain('.is("superseded_at", null).is("resolved_at", null)');
    expect(page).toContain("Recommendation history");
    expect(action).toContain("finding.resolved_at || finding.superseded_at");
    expect(action).toContain("historical and can no longer be reviewed");
  });

  it("uses one transactional, bounded, resumable sync state machine for both providers", () => {
    const sql = migration();
    const action = read("lib", "actions", "subscription-usage-optimization.ts");
    expect(sql).toContain("transition_manual_subscription_usage_sync_attempt");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("stale_manual_sync_recovered");
    expect(sql).toContain("v_existing.usage_import_batch_id");
    expect(sql).toContain("v_existing.attempt_number >= v_existing.maximum_attempts");
    expect(sql).toContain("Invalid synchronization stage transition");
    expect(action.match(/resumeManualSyncFromPersistedSnapshot/g)?.length).toBeGreaterThanOrEqual(3);
    expect(action).toContain('nextStage: "snapshot_persisted"');
    expect(action).toContain('nextStage: "findings_persisted"');
  });

  it("keeps logical identity stable across calculation and taxonomy upgrades", () => {
    expect(deriveVersionFamily("subscription_usage_v2")).toBe("subscription_usage");
    expect(deriveVersionFamily("subscription_capability_taxonomy_v3")).toBe("subscription_capability_taxonomy");
    const finding = (calculationVersion: string, taxonomyVersion: string) => ({
      finding_type: "possible_functional_overlap" as const,
      reason_code: "cross_provider_email_calendar_uneven_adoption",
      calculation_version: calculationVersion,
      calculation_family: "cross_provider_overlap",
      taxonomy_version: taxonomyVersion,
      taxonomy_family: "subscription_capability_taxonomy",
      source_row_ids: ["row-1"], matched_contract_ids: ["contract-1"], utilization: 0.2,
      unused_seats: null, confidence: 0.8, warnings: [], estimated_savings: 100,
      currency: "USD", recommended_action: "investigate" as const,
      involved_providers: ["microsoft_365", "google_workspace"], involved_products: ["A", "B"],
      capability_category: "email_calendar", evidence: {}, fingerprint_key: "same"
    });
    const identity = (current: ReturnType<typeof finding>) => buildStableSubscriptionUsageFindingIdentity({ organizationId: "org-1", finding: current, analysisScopeId: "scope-1", snapshotBatchIds: ["batch-1"], providerSet: current.involved_providers, scopeFamilyKey: "scope-family" });
    const first = identity(finding("cross_provider_overlap_v1", "subscription_capability_taxonomy_v1"));
    const upgraded = identity(finding("cross_provider_overlap_v2", "subscription_capability_taxonomy_v2"));
    expect(upgraded.logicalOpportunityKey).toBe(first.logicalOpportunityKey);
    expect(upgraded.materialEvidenceHash).not.toBe(first.materialEvidenceHash);
  });

  it("preserves reconnect lineage and prior decisions unless material evidence changes", () => {
    const sql = migration();
    expect(sql).toContain("reactivated_from_finding_id");
    expect(sql).toContain("provider_reconnected");
    expect(sql).toContain("previousProviderConnectionId");
    expect(sql).toContain("currentProviderConnectionId");
    expect(sql).toContain("v_resolved.material_evidence_hash is distinct from new.material_evidence_hash");
    expect(sql).toContain("new.review_status := v_resolved.review_status");
  });

  it("enforces founder activation, limits, expiry, and read-only grace without hiding evidence", () => {
    expect(evaluateDesignPartnerBetaMutation({ control: { ...activeControl, founderApprovedAt: null, status: "pending" }, action: "sync_provider", now: new Date("2026-08-24") })).toMatchObject({ allowed: false, reason: "founder_activation_required" });
    expect(evaluateDesignPartnerBetaMutation({ control: activeControl, action: "upload_contract", currentContracts: 5, now: new Date("2026-08-24") })).toMatchObject({ allowed: false, reason: "contract_limit_reached" });
    expect(evaluateDesignPartnerBetaMutation({ control: activeControl, action: "sync_provider", now: new Date("2026-10-02") })).toMatchObject({ allowed: false, reason: "beta_grace_read_only" });
    expect(evaluateDesignPartnerBetaMutation({ control: activeControl, action: "sync_provider", now: new Date("2026-10-08") })).toMatchObject({ allowed: false, reason: "beta_read_only" });
    expect(evaluateDesignPartnerBetaMutation({ control: activeControl, action: "sync_provider", now: new Date("2026-08-24") })).toMatchObject({ allowed: true });
    expect(evaluateDesignPartnerBetaMutation({ control: activeControl, action: "invite_member", currentUserSeats: 5, now: new Date("2026-08-24") })).toMatchObject({ allowed: false, reason: "user_seat_limit_reached" });
    for (const action of ["create_decision", "create_scenario", "create_task", "upload_quote", "approve_decision", "create_negotiation_draft", "confirm_outcome"] as const) {
      expect(evaluateDesignPartnerBetaMutation({ control: { ...activeControl, status: "read_only" }, action, now: new Date("2026-08-24") })).toMatchObject({ allowed: false, reason: "beta_read_only" });
    }
  });

  it("builds currency-separated PDF/XLSX value evidence and excludes inactive findings", async () => {
    const input = {
      ...reportInput(),
      upcomingActions: Array.from({ length: 8 }, (_, index) => ({
        contractId: `contract-${index + 1}`,
        title: `${index === 0 ? "=Formula Vendor" : "Renewal action"} with a deliberately bounded but descriptive executive label ${index + 1}`,
        deadline: `2026-09-${String(index + 1).padStart(2, "0")}`
      }))
    };
    const summary = buildExecutiveValueSummary(input);
    expect(summary.estimatedSavingsByCurrency).toEqual({ USD: 100, EUR: 50 });
    expect(summary.realizedSavingsByCurrency).toEqual({ USD: 80 });
    expect(summary.recommendationsReviewed).toBe(1);
    const pdfBuffer = await buildExecutiveValuePdf(input);
    const pdf = await PDFDocument.load(Uint8Array.from(pdfBuffer));
    expect(pdf.getTitle()).toBe("NoticeControl Executive Value Summary");
    expect(pdf.getSubject()).toContain("Northstar Design Partner");
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
    for (const page of pdf.getPages()) {
      expect(page.getWidth()).toBe(612);
      expect(page.getHeight()).toBe(792);
    }
    expect(pdfBuffer.toString("utf8")).not.toMatch(/raw contract|ocr output|provider payload|private note/i);
    const workbook = XLSX.read(buildExecutiveValueWorkbook(input), { type: "buffer", cellStyles: true, cellNF: true });
    expect(workbook.SheetNames).toEqual(expect.arrayContaining([
      "Executive Summary",
      "Estimated Savings",
      "Realized Savings",
      "Provider Freshness",
      "Upcoming Actions",
      "Evidence Limitations",
      "Active Evidence",
      "Historical Evidence",
      "Confirmed Outcomes"
    ]));
    const evidence = XLSX.utils.sheet_to_json(workbook.Sheets["Active Evidence"]!);
    const upcoming = XLSX.utils.sheet_to_json<{ title: string }>(workbook.Sheets["Upcoming Actions"]!);
    expect(evidence).toHaveLength(2);
    expect(JSON.stringify(evidence)).not.toContain("resolved");
    expect(upcoming[0]?.title).toMatch(/^'=Formula Vendor/);
    expect(workbook.Sheets["Upcoming Actions"]?.["!autofilter"]).toBeDefined();
    expect(workbook.Sheets["Estimated Savings"]?.B2?.z).toContain("#,##0.00");
  });

  it("does not report accepted recommendation estimates as realized customer value", () => {
    const input = { ...reportInput(), confirmedOutcomes: [] };
    expect(input.findings.some((finding) => finding.reviewStatus === "accepted" && finding.realizedSavings)).toBe(true);
    expect(buildExecutiveValueSummary(input).realizedSavingsByCurrency).toEqual({});
  });
});

import { describe, expect, it } from "vitest";
import { evaluateSaasRenewalRules } from "@/lib/rules/saas-renewal-rules";

describe("renewal defense rules engine", () => {
  it("emits expected findings, recommendations, blockers, and no-send boundary", () => {
    const outcomes = evaluateSaasRenewalRules({
      noticeDeadline: "2026-08-05",
      today: "2026-08-02",
      autoRenewal: true,
      ownerUserId: null,
      evidenceConfidence: 0.5,
      contractValueAmount: 50000,
      contractValueCurrency: "USD",
      metadataConflictCount: 2,
      duplicateImportSuspected: true,
      untrustedAiCriticalFactCount: 1
    });

    expect(outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "critical_opt_out_window", outcomeType: "finding", severity: "critical" }),
      expect.objectContaining({ code: "weak_evidence", outcomeType: "blocker", severity: "high" }),
      expect.objectContaining({ code: "missing_owner", outcomeType: "blocker" }),
      expect.objectContaining({ code: "high_spend_at_risk", outcomeType: "finding" }),
      expect.objectContaining({ code: "metadata_conflict", outcomeType: "blocker" }),
      expect.objectContaining({ code: "duplicate_import_suspected", outcomeType: "blocker" }),
      expect.objectContaining({ code: "untrusted_ai_extraction", outcomeType: "blocker" }),
      expect.objectContaining({ code: "no_send_boundary", outcomeType: "blocker", severity: "info" })
    ]));
    expect(JSON.stringify(outcomes)).not.toMatch(/raw contract|private note|provider payload|email body/i);
  });

  it("keeps actions recommended or blocked rather than executable", () => {
    const outcomes = evaluateSaasRenewalRules({
      noticeDeadline: null,
      autoRenewal: true
    });

    expect(outcomes.some((outcome) => outcome.code === "missing_notice_deadline")).toBe(true);
    expect(JSON.stringify(outcomes)).not.toMatch(/send_email|deliver_notice|provider/i);
  });
});

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { calculateRiskScore } from "@/lib/intelligence/risk/risk-score";
import type { RiskScoreInput } from "@/lib/intelligence/risk/risk-factors";

function makeInput(overrides: Partial<RiskScoreInput> = {}): RiskScoreInput {
  return {
    contractId: "contract-1",
    contractTitle: "Master Services Agreement",
    noticeDeadlineDate: "2026-06-01",
    renewalDate: "2026-07-15",
    expirationDate: null,
    autoRenewalConfirmed: true,
    contractValueAmount: 120000,
    ownerAssigned: true,
    decisionStatus: "undecided",
    reminderAcknowledged: true,
    weakEvidence: false,
    reviewCompleted: true,
    acceptedRiskOverride: false,
    priceChangeTrigger: null,
    previousDeferWatchlist: false,
    reminderDeliveryFailures: 0,
    duplicateCounterpartyUncertainty: false,
    ...overrides
  };
}

describe("risk score engine", () => {
  it("returns critical risk for near notice deadline plus auto-renewal plus high value plus no decision", () => {
    const result = calculateRiskScore(
      makeInput({
        noticeDeadlineDate: "2026-05-20",
        autoRenewalConfirmed: true,
        contractValueAmount: 300000,
        decisionStatus: "undecided"
      }),
      { now: new Date("2026-05-17T09:00:00.000Z") }
    );

    expect(result.risk_band).toBe("critical");
    expect(result.score_points).toBeGreaterThanOrEqual(85);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ factor: "notice_deadline_proximity" }),
        expect.objectContaining({ factor: "auto_renewal_confirmed" }),
        expect.objectContaining({ factor: "contract_value" }),
        expect.objectContaining({ factor: "missing_decision" })
      ])
    );
  });

  it("raises risk when owner is missing", () => {
    const withOwner = calculateRiskScore(makeInput(), {
      now: new Date("2026-05-17T09:00:00.000Z")
    });
    const withoutOwner = calculateRiskScore(
      makeInput({
        ownerAssigned: false
      }),
      { now: new Date("2026-05-17T09:00:00.000Z") }
    );

    expect(withoutOwner.score_points).toBeGreaterThan(withOwner.score_points);
    expect(withoutOwner.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ factor: "missing_owner" })])
    );
  });

  it("lowers confidence when P0 is unreviewed", () => {
    const result = calculateRiskScore(
      makeInput({
        reviewCompleted: false
      }),
      { now: new Date("2026-05-17T09:00:00.000Z") }
    );

    expect(result.confidence_level).toBe("low");
    expect(result.missing_data_warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "review_pending" })
      ])
    );
  });

  it("lowers confidence when evidence is weak", () => {
    const result = calculateRiskScore(
      makeInput({
        weakEvidence: true
      }),
      { now: new Date("2026-05-17T09:00:00.000Z") }
    );

    expect(result.confidence_level).toBe("low");
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ factor: "weak_evidence" })])
    );
  });

  it("raises confidence when reviewed core data is present", () => {
    const result = calculateRiskScore(
      makeInput({
        autoRenewalConfirmed: true,
        contractValueAmount: 180000,
        reviewCompleted: true,
        weakEvidence: false,
        reminderDeliveryFailures: 0
      }),
      { now: new Date("2026-05-17T09:00:00.000Z") }
    );

    expect(result.confidence_level).toBe("high");
    expect(result.evidence_basis.length).toBeGreaterThan(0);
  });

  it("stays read-only and does not import workflow mutation code", () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const filePath = path.join(repoRoot, "lib", "intelligence", "risk", "risk-score.ts");
    const content = fs.readFileSync(filePath, "utf8");

    expect(content).not.toMatch(/@\/lib\/actions\//);
    expect(content).not.toMatch(/@\/lib\/notifications\/reminders/);
    expect(content).not.toMatch(/createServerSupabaseClient/);
    expect(content).not.toMatch(/\.insert\(/);
    expect(content).not.toMatch(/\.update\(/);
  });
});

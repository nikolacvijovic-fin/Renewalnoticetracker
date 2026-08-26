import { describe, expect, it } from "vitest";

import {
  buildDeterministicNegotiationBrief,
  compareCommercialTerms,
  evaluateScenarioApproval,
  normalizeCommercialTerms,
  type CommercialEvidenceReference,
  type CommercialTermsInput
} from "@/lib/quote-comparison/commercial-comparison-engine";

const accepted = (id: string): CommercialEvidenceReference => ({
  evidenceId: id,
  sourceFileId: "contract-file-1",
  extractionRunId: "run-1",
  state: "accepted",
  page: 4,
  label: "Fees"
});

const proposed = (id: string): CommercialEvidenceReference => ({
  evidenceId: id,
  sourceFileId: "quote-file-1",
  extractionRunId: "quote-run-1",
  state: "proposed",
  page: 2,
  label: "Renewal pricing"
});

function requiredScenario() {
  const baseline: CommercialTermsInput = {
    statedAnnualTotal: 120_000,
    currency: "EUR",
    paymentTerms: "Net 30",
    renewalTermMonths: 12,
    noticePeriodDays: 90,
    autoRenewal: true,
    lineItems: [{
      lineKey: "platform-seats",
      productName: "Platform seats",
      sku: "PLATFORM-SEAT",
      chargeType: "recurring",
      pricingModel: "per_seat",
      billingPeriod: "monthly",
      quantity: 100,
      unitPrice: 100,
      totalAmount: 10_000,
      discountAmount: 2_160 / 12,
      currency: "EUR",
      evidence: [accepted("baseline-price")]
    }],
    evidence: [accepted("baseline-price")]
  };
  const proposal: CommercialTermsInput = {
    statedAnnualTotal: 150_000,
    currency: "EUR",
    paymentTerms: "Net 30",
    renewalTermMonths: 12,
    noticePeriodDays: 90,
    autoRenewal: true,
    lineItems: [{
      lineKey: "platform-seats",
      productName: "Platform seats",
      sku: "PLATFORM-SEAT",
      chargeType: "recurring",
      pricingModel: "per_seat",
      billingPeriod: "monthly",
      quantity: 110,
      unitPrice: 112,
      totalAmount: 12_320,
      currency: "EUR",
      evidence: [proposed("proposal-price")]
    }],
    evidence: [proposed("proposal-price")]
  };
  return { baseline, proposal };
}

describe("commercial comparison engine", () => {
  it("reconciles the required EUR 120k to EUR 150k scenario and separates rate, quantity, and discount", () => {
    const { baseline, proposal } = requiredScenario();
    const result = compareCommercialTerms({
      contractId: "contract-1",
      baseline,
      proposal,
      usageEvidence: [{
        contractId: "contract-1",
        lineKey: "platform-seats",
        purchasedQuantity: 100,
        assignedQuantity: 90,
        activeQuantity: 82.5,
        observedAt: "2026-08-25T00:00:00.000Z",
        matchedContractId: "contract-1",
        providerConnectionId: "provider-1",
        status: "trusted",
        evidenceId: "usage-1"
      }],
      actionDeadline: "2026-09-30"
    });

    expect(result.status).toBe("completed");
    expect(result.costBridge.status).toBe("reconciled");
    expect(result.costBridge.currentAnnualCost).toBe(120_000);
    expect(result.costBridge.proposedAnnualCost).toBe(150_000);
    expect(result.costBridge.residualAmount).toBe(0);
    expect(result.costBridge.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "unit_price_change", amount: 14_400 }),
      expect.objectContaining({ type: "quantity_change", amount: 13_440 }),
      expect.objectContaining({ type: "removed_discount", amount: 2_160 })
    ]));
    expect(result.findings.map((item) => item.reasonCode)).toEqual(expect.arrayContaining([
      "proposed_annual_cost_increased",
      "effective_unit_price_increased",
      "proposed_quantity_increased",
      "existing_discount_removed"
    ]));
    const quantityOpportunity = result.opportunities.find((item) => item.type === "reduce_quantity");
    expect(quantityOpportunity).toMatchObject({
      evidenceCompleteness: "complete",
      currency: "EUR",
      lowSavingsAmount: 18_480,
      highSavingsAmount: 36_960,
      actionDeadline: "2026-09-30"
    });
    expect(result.scenarios.find((item) => item.type === "reduce_quantity")?.status).toBe("draft");

    const brief = buildDeterministicNegotiationBrief({
      contractTitle: "Platform agreement",
      vendorName: "Example vendor",
      comparison: result,
      actionOwnerLabel: "Finance owner",
      actionDeadline: "2026-09-30"
    });
    expect(brief.evidenceTrace.baselineEvidenceIds).toContain("baseline-price");
    expect(brief.evidenceTrace.proposalEvidenceIds).toContain("proposal-price");
    expect(brief.labels.opportunities).toBe("estimate_not_realized");
    expect(JSON.stringify(brief)).not.toContain("realizedSavings");
  });

  it("rejects multi-currency comparisons without a reviewed exchange rate", () => {
    const { baseline, proposal } = requiredScenario();
    proposal.lineItems.push({
      lineKey: "support",
      productName: "Support fee",
      chargeType: "one_time",
      pricingModel: "flat",
      billingPeriod: "annual",
      totalAmount: 1_000,
      currency: "USD",
      evidence: [proposed("support-price")]
    });
    const result = compareCommercialTerms({ contractId: "contract-1", baseline, proposal });
    expect(result.status).toBe("insufficient_evidence");
    expect(result.warnings).toContain("multi_currency_requires_reviewed_exchange_rate");
  });

  it.each(["stale", "partial", "sample", "unmatched", "conflicting"] as const)(
    "does not use %s usage for a high-confidence opportunity",
    (status) => {
      const { baseline, proposal } = requiredScenario();
      const result = compareCommercialTerms({
        contractId: "contract-1",
        baseline,
        proposal,
        usageEvidence: [{
          contractId: "contract-1", lineKey: "platform-seats", purchasedQuantity: 100,
          activeQuantity: 10, observedAt: "2026-08-25T00:00:00.000Z", matchedContractId: "contract-1",
          providerConnectionId: "provider-1", status, evidenceId: "usage-unsafe"
        }]
      });
      expect(result.opportunities.some((item) => item.type === "reduce_quantity")).toBe(false);
    }
  );

  it("requires accepted, non-superseded evidence for a trusted baseline", () => {
    const { baseline } = requiredScenario();
    baseline.lineItems[0]!.evidence = [{ ...accepted("superseded"), state: "superseded" }];
    expect(() => normalizeCommercialTerms(baseline, { requireAcceptedEvidence: true }))
      .toThrow("accepted_evidence_required");
  });

  it("invalidates scenario approval when material evidence changes", () => {
    expect(evaluateScenarioApproval({ approvedEvidenceFingerprint: "v1", currentEvidenceFingerprint: "v1" }))
      .toEqual({ valid: true, status: "approved", reasonCode: null });
    expect(evaluateScenarioApproval({ approvedEvidenceFingerprint: "v1", currentEvidenceFingerprint: "v2" }))
      .toEqual({ valid: false, status: "reapproval_required", reasonCode: "material_evidence_changed" });
  });

  it("shows an unreconciled residual instead of inventing a driver", () => {
    const { baseline, proposal } = requiredScenario();
    baseline.lineItems[0]!.discountAmount = null;
    const result = compareCommercialTerms({ contractId: "contract-1", baseline, proposal });
    expect(result.costBridge.status).toBe("unreconciled");
    expect(result.costBridge.residualAmount).toBe(2_160);
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ reasonCode: "quote_total_not_reconciled", severity: "critical" })
    ]));
  });
});

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
  it.each([
    { name: "monthly", billingPeriod: "monthly", totalAmount: 100, termMonths: 12, expectedAnnual: 1_200, expectedCommitment: 1_200 },
    { name: "quarterly", billingPeriod: "quarterly", totalAmount: 300, termMonths: 12, expectedAnnual: 1_200, expectedCommitment: 1_200 },
    { name: "annual", billingPeriod: "annual", totalAmount: 1_200, termMonths: 12, expectedAnnual: 1_200, expectedCommitment: 1_200 },
    { name: "multi-year", billingPeriod: "multi_year", totalAmount: 2_400, termMonths: 24, expectedAnnual: 1_200, expectedCommitment: 2_400 },
    { name: "partial service period", billingPeriod: "partial", totalAmount: 600, termMonths: 12, servicePeriodMonths: 6, expectedAnnual: 1_200, expectedCommitment: 1_200 }
  ] as const)("normalizes $name recurring pricing without transition cost", (testCase) => {
    const terms = normalizeCommercialTerms({
      renewalTermMonths: testCase.termMonths,
      currency: "EUR",
      lineItems: [{
        productName: "Subscription",
        chargeType: "recurring",
        pricingModel: "flat",
        billingPeriod: testCase.billingPeriod,
        totalAmount: testCase.totalAmount,
        currency: "EUR",
        termMonths: testCase.termMonths,
        servicePeriodMonths: "servicePeriodMonths" in testCase ? testCase.servicePeriodMonths : undefined,
        evidence: [accepted(`baseline-${testCase.name}`)]
      }],
      evidence: []
    }, { requireAcceptedEvidence: true });

    expect(terms.calculatedAnnualTotal).toBe(testCase.expectedAnnual);
    expect(terms.calculatedOneTimeTotal).toBe(0);
    expect(terms.calculatedCommitmentTotal).toBe(testCase.expectedCommitment);
  });

  it("counts a discounted one-time fee exactly once on a three-year agreement", () => {
    const terms = normalizeCommercialTerms({
      renewalTermMonths: 36,
      currency: "EUR",
      lineItems: [{
        productName: "Implementation fee",
        chargeType: "one_time",
        pricingModel: "flat",
        billingPeriod: "annual",
        totalAmount: 12_500,
        discountAmount: 1_500,
        discountPercent: 8,
        currency: "EUR",
        termMonths: 36,
        evidence: [proposed("implementation-fee")]
      }],
      evidence: []
    }, { requireAcceptedEvidence: false });

    expect(terms.calculatedAnnualTotal).toBe(0);
    expect(terms.calculatedOneTimeTotal).toBe(10_000);
    expect(terms.calculatedFirstYearTotal).toBe(10_000);
    expect(terms.calculatedCommitmentTotal).toBe(10_000);
    expect(terms.lineItems[0]).toMatchObject({ annualizedAmount: 0, oneTimeAmount: 10_000, totalCommitmentAmount: 10_000 });
  });

  it("separates recurring and one-time bridge deltas and scenario totals", () => {
    const baseline: CommercialTermsInput = {
      renewalTermMonths: 36,
      currency: "EUR",
      lineItems: [{
        lineKey: "subscription", productName: "Subscription", chargeType: "recurring", pricingModel: "flat",
        billingPeriod: "annual", totalAmount: 10_000, currency: "EUR", termMonths: 36,
        evidence: [accepted("baseline-subscription")]
      }],
      evidence: []
    };
    const proposal: CommercialTermsInput = {
      renewalTermMonths: 36,
      currency: "EUR",
      lineItems: [
        { lineKey: "subscription", productName: "Subscription", chargeType: "recurring", pricingModel: "flat",
          billingPeriod: "annual", totalAmount: 12_000, currency: "EUR", termMonths: 36,
          evidence: [proposed("proposal-subscription")] },
        { lineKey: "implementation", productName: "Implementation", chargeType: "one_time", pricingModel: "flat",
          billingPeriod: "annual", totalAmount: 10_000, currency: "EUR", termMonths: 36,
          evidence: [proposed("proposal-implementation")] }
      ],
      evidence: []
    };

    const result = compareCommercialTerms({ contractId: "contract-1", baseline, proposal });
    expect(result.costBridge).toMatchObject({
      currentAnnualCost: 10_000,
      proposedAnnualCost: 12_000,
      currentOneTimeCost: 0,
      proposedOneTimeCost: 10_000,
      recurringDelta: 2_000,
      oneTimeDelta: 10_000
    });
    expect(result.costBridge.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "new_fee", costCategory: "one_time", amount: 10_000 })
    ]));
    expect(result.scenarios.find((item) => item.type === "accept_proposal")).toMatchObject({
      annualCost: 12_000,
      transitionCost: 10_000,
      firstYearEffect: 12_000,
      multiYearCommitment: 46_000
    });
    expect(result.scenarios.find((item) => item.type === "renegotiate_price")).toMatchObject({
      transitionCost: 10_000,
      multiYearCommitment: 40_000
    });
    expect(result.scenarios.find((item) => item.type === "reduce_quantity")?.transitionCost).toBe(10_000);
  });

  it("keeps stated annual and stated commitment totals in their explicit semantic lanes", () => {
    const normalized = normalizeCommercialTerms({
      statedAnnualTotal: 12_000,
      statedCommitmentTotal: 44_000,
      renewalTermMonths: 36,
      currency: "EUR",
      lineItems: [
        { productName: "Subscription", chargeType: "recurring", pricingModel: "flat", billingPeriod: "annual",
          totalAmount: 12_000, currency: "EUR", termMonths: 36, evidence: [proposed("stated-recurring")] },
        { productName: "Setup", chargeType: "one_time", pricingModel: "flat", billingPeriod: "annual",
          totalAmount: 10_000, currency: "EUR", termMonths: 36, evidence: [proposed("stated-setup")] }
      ],
      evidence: []
    }, { requireAcceptedEvidence: false });

    expect(normalized.statedAnnualTotal).toBe(12_000);
    expect(normalized.calculatedAnnualTotal).toBe(12_000);
    expect(normalized.statedCommitmentTotal).toBe(44_000);
    expect(normalized.calculatedCommitmentTotal).toBe(46_000);
  });

  it("requires an explicit term before treating a stated total as a commitment total", () => {
    expect(() => normalizeCommercialTerms({
      statedCommitmentTotal: 30_000,
      currency: "EUR",
      lineItems: [{ productName: "Subscription", chargeType: "recurring", pricingModel: "flat",
        billingPeriod: "annual", totalAmount: 10_000, currency: "EUR", evidence: [proposed("ambiguous-total")] }],
      evidence: []
    }, { requireAcceptedEvidence: false })).toThrow("commitment_term_required_for_stated_commitment_total");
  });

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

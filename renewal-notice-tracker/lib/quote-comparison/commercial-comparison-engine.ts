import { createHash } from "node:crypto";

export const COMMERCIAL_CALCULATION_VERSION = "commercial-comparison-v1";
export const COMMERCIAL_TAXONOMY_VERSION = "commercial-findings-v1";

export type CommercialEvidenceState = "accepted" | "proposed" | "rejected" | "superseded";
export type BillingPeriod = "monthly" | "quarterly" | "annual" | "multi_year" | "partial";
export type PricingModel = "per_user" | "per_seat" | "per_unit" | "flat" | "tiered";
export type ChargeType = "recurring" | "one_time";

export type CommercialEvidenceReference = {
  evidenceId: string;
  sourceFileId: string;
  extractionRunId: string;
  state: CommercialEvidenceState;
  page?: number | null;
  cell?: string | null;
  label?: string | null;
};

export type CommercialLineItemInput = {
  lineKey?: string | null;
  productName: string;
  sku?: string | null;
  chargeType: ChargeType;
  pricingModel: PricingModel;
  billingPeriod: BillingPeriod;
  quantity?: number | null;
  unitPrice?: number | null;
  totalAmount?: number | null;
  currency: string;
  termMonths?: number | null;
  servicePeriodMonths?: number | null;
  discountAmount?: number | null;
  discountPercent?: number | null;
  evidence: CommercialEvidenceReference[];
};

export type NormalizedCommercialLineItem = CommercialLineItemInput & {
  lineKey: string;
  currency: string;
  oneTimeAmount: number;
  annualizedAmount: number;
  totalCommitmentAmount: number;
  warnings: string[];
};

export type CommercialTermsInput = {
  lineItems: CommercialLineItemInput[];
  statedAnnualTotal?: number | null;
  statedCommitmentTotal?: number | null;
  currency?: string | null;
  paymentTerms?: string | null;
  renewalTermMonths?: number | null;
  noticePeriodDays?: number | null;
  autoRenewal?: boolean | null;
  minimumSpend?: number | null;
  terminationCharge?: number | null;
  upliftPercent?: number | null;
  upliftCapped?: boolean | null;
  serviceCreditPercent?: number | null;
  evidence: CommercialEvidenceReference[];
};

export type TrustedUsageEvidence = {
  contractId: string;
  lineKey: string;
  purchasedQuantity: number;
  assignedQuantity?: number | null;
  activeQuantity: number;
  observedAt: string;
  matchedContractId: string | null;
  providerConnectionId: string | null;
  status: "trusted" | "stale" | "partial" | "sample" | "unmatched" | "conflicting";
  evidenceId: string;
};

export type CostBridgeComponent = {
  type:
    | "unit_price_change"
    | "quantity_change"
    | "new_product"
    | "removed_product"
    | "removed_discount"
    | "new_fee"
    | "one_time_charge_change"
    | "negotiated_credit";
  costCategory: "recurring" | "one_time";
  lineKey: string;
  amount: number;
  explanation: string;
  currentEvidenceIds: string[];
  proposedEvidenceIds: string[];
};

export type CostBridge = {
  status: "reconciled" | "unreconciled" | "insufficient_evidence";
  currency: string | null;
  currentAnnualCost: number | null;
  proposedAnnualCost: number | null;
  currentOneTimeCost: number | null;
  proposedOneTimeCost: number | null;
  currentCommitmentCost: number | null;
  proposedCommitmentCost: number | null;
  components: CostBridgeComponent[];
  attributedDelta: number | null;
  residualAmount: number | null;
  recurringDelta: number | null;
  oneTimeDelta: number | null;
  attributedRecurringDelta: number | null;
  attributedOneTimeDelta: number | null;
  residualRecurringAmount: number | null;
  residualOneTimeAmount: number | null;
  explanation: string;
  limitations: string[];
};

export type CommercialFinding = {
  findingType: string;
  reasonCode: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  confidence: number;
  title: string;
  description: string;
  currentValue: unknown;
  proposedValue: unknown;
  absoluteDelta: number | null;
  percentageDelta: number | null;
  annualizedImpact: number | null;
  totalCommitmentImpact: number | null;
  currentEvidenceIds: string[];
  proposedEvidenceIds: string[];
  limitations: string[];
  calculationVersion: string;
  taxonomyVersion: string;
};

export type NegotiationOpportunity = {
  type:
    | "reduce_quantity"
    | "preserve_discount"
    | "cap_uplift"
    | "remove_unused_sku"
    | "shorter_commitment"
    | "improve_payment_terms"
    | "transition_credit"
    | "consolidate_products"
    | "additional_decision_time"
    | "investigate_before_renewal";
  recommendedAction: string;
  lowSavingsAmount: number | null;
  highSavingsAmount: number | null;
  currency: string | null;
  evidenceCompleteness: "complete" | "partial" | "insufficient";
  rationale: string;
  supportingFindingReasonCodes: string[];
  assumptions: string[];
  missingEvidence: string[];
  actionDeadline: string | null;
};

export type CommercialScenario = {
  type:
    | "accept_proposal"
    | "renew_unchanged"
    | "renegotiate_price"
    | "reduce_quantity"
    | "consolidate"
    | "terminate"
    | "replace"
    | "custom";
  annualCost: number | null;
  firstYearEffect: number | null;
  multiYearCommitment: number | null;
  transitionCost: number;
  estimatedSavingsLow: number | null;
  estimatedSavingsHigh: number | null;
  majorRisks: string[];
  evidenceFingerprint: string;
  status: "draft" | "approved" | "reapproval_required";
};

export type CommercialComparisonResult = {
  status: "completed" | "insufficient_evidence";
  baseline: NormalizedCommercialLineItem[];
  proposal: NormalizedCommercialLineItem[];
  costBridge: CostBridge;
  findings: CommercialFinding[];
  opportunities: NegotiationOpportunity[];
  scenarios: CommercialScenario[];
  evidenceFingerprint: string;
  warnings: string[];
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const keyPart = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function assertFiniteNonNegative(value: number | null | undefined, field: string) {
  if (value == null) return;
  if (!Number.isFinite(value) || value < 0) throw new Error(`invalid_${field}`);
}

function acceptedEvidenceIds(references: CommercialEvidenceReference[]) {
  return references.filter((item) => item.state === "accepted").map((item) => item.evidenceId);
}

function evidenceIds(references: CommercialEvidenceReference[]) {
  return references.filter((item) => item.state !== "rejected" && item.state !== "superseded").map((item) => item.evidenceId);
}

function withoutEvidence(item: NormalizedCommercialLineItem) {
  return Object.fromEntries(Object.entries(item).filter(([key]) => key !== "evidence"));
}

function annualFactor(item: CommercialLineItemInput) {
  if (item.chargeType === "one_time") return 1;
  switch (item.billingPeriod) {
    case "monthly": return 12;
    case "quarterly": return 4;
    case "annual": return 1;
    case "multi_year": {
      if (!item.termMonths || item.termMonths <= 0) throw new Error("multi_year_term_required");
      return 12 / item.termMonths;
    }
    case "partial": {
      if (!item.servicePeriodMonths || item.servicePeriodMonths <= 0) throw new Error("partial_service_period_required");
      return 12 / item.servicePeriodMonths;
    }
  }
}

export function normalizeCommercialLineItem(
  input: CommercialLineItemInput,
  options: { requireAcceptedEvidence: boolean }
): NormalizedCommercialLineItem {
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("invalid_currency");
  if (!input.productName.trim()) throw new Error("product_name_required");
  assertFiniteNonNegative(input.quantity, "quantity");
  assertFiniteNonNegative(input.unitPrice, "unit_price");
  assertFiniteNonNegative(input.totalAmount, "total_amount");
  assertFiniteNonNegative(input.discountAmount, "discount_amount");
  assertFiniteNonNegative(input.discountPercent, "discount_percent");
  if (input.discountPercent != null && input.discountPercent > 100) throw new Error("invalid_discount_percent");
  if (options.requireAcceptedEvidence && acceptedEvidenceIds(input.evidence).length === 0) {
    throw new Error("accepted_evidence_required");
  }

  const factor = annualFactor(input);
  const gross = input.totalAmount ??
    (input.quantity != null && input.unitPrice != null ? input.quantity * input.unitPrice : null);
  if (gross == null) throw new Error("comparable_amount_required");
  const discounted = Math.max(
    0,
    gross - (input.discountAmount ?? 0) - (gross * (input.discountPercent ?? 0)) / 100
  );
  const oneTimeAmount = input.chargeType === "one_time" ? roundMoney(discounted) : 0;
  const annualizedAmount = input.chargeType === "recurring" ? roundMoney(discounted * factor) : 0;
  const commitmentMonths = input.termMonths ?? 12;
  const totalCommitmentAmount = roundMoney(
    input.chargeType === "one_time" ? discounted : annualizedAmount * (commitmentMonths / 12)
  );
  const lineKey = input.lineKey?.trim() || keyPart(input.sku || input.productName);
  if (!lineKey) throw new Error("line_key_required");

  return {
    ...input,
    lineKey,
    currency,
    oneTimeAmount,
    annualizedAmount,
    totalCommitmentAmount,
    warnings: []
  };
}

export function normalizeCommercialTerms(
  input: CommercialTermsInput,
  options: { requireAcceptedEvidence: boolean }
) {
  const lineItems = input.lineItems.map((item) => normalizeCommercialLineItem(item, options));
  const currencies = new Set(lineItems.map((item) => item.currency));
  if (input.currency) currencies.add(input.currency.trim().toUpperCase());
  if (currencies.size > 1) throw new Error("multi_currency_requires_reviewed_exchange_rate");
  assertFiniteNonNegative(input.statedAnnualTotal, "stated_annual_total");
  assertFiniteNonNegative(input.statedCommitmentTotal, "stated_commitment_total");
  if (input.statedCommitmentTotal != null && (!input.renewalTermMonths || input.renewalTermMonths <= 0)) {
    throw new Error("commitment_term_required_for_stated_commitment_total");
  }
  const calculatedAnnualTotal = roundMoney(lineItems.reduce((sum, item) => sum + item.annualizedAmount, 0));
  const calculatedOneTimeTotal = roundMoney(lineItems.reduce((sum, item) => sum + item.oneTimeAmount, 0));
  return {
    ...input,
    currency: [...currencies][0] ?? null,
    lineItems,
    calculatedAnnualTotal,
    calculatedOneTimeTotal,
    calculatedFirstYearTotal: roundMoney(calculatedAnnualTotal + calculatedOneTimeTotal),
    calculatedCommitmentTotal: roundMoney(lineItems.reduce((sum, item) => sum + item.totalCommitmentAmount, 0))
  };
}

function stableFingerprint(input: unknown) {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, nested]) => [key, stable(nested)])
      );
    }
    return value;
  };
  return createHash("sha256").update(JSON.stringify(stable(input))).digest("hex");
}

export function buildCommercialEvidenceFingerprint(input: unknown) {
  return stableFingerprint(input);
}

function buildCostBridge(
  current: ReturnType<typeof normalizeCommercialTerms>,
  proposed: ReturnType<typeof normalizeCommercialTerms>
): CostBridge {
  if (!current.currency || current.currency !== proposed.currency) {
    return {
      status: "insufficient_evidence", currency: null, currentAnnualCost: null, proposedAnnualCost: null,
      currentOneTimeCost: null, proposedOneTimeCost: null,
      currentCommitmentCost: null, proposedCommitmentCost: null,
      components: [], attributedDelta: null, residualAmount: null,
      recurringDelta: null, oneTimeDelta: null,
      attributedRecurringDelta: null, attributedOneTimeDelta: null,
      residualRecurringAmount: null, residualOneTimeAmount: null,
      explanation: "The commercial terms cannot be compared without one reviewed currency.",
      limitations: ["multi_currency_requires_reviewed_exchange_rate"]
    };
  }

  const components: CostBridgeComponent[] = [];
  const currentByKey = new Map(current.lineItems.map((item) => [item.lineKey, item]));
  const proposedByKey = new Map(proposed.lineItems.map((item) => [item.lineKey, item]));
  for (const lineKey of new Set([...currentByKey.keys(), ...proposedByKey.keys()])) {
    const before = currentByKey.get(lineKey);
    const after = proposedByKey.get(lineKey);
    if (!before && after) {
      const oneTime = after.chargeType === "one_time";
      components.push({
        type: oneTime ? "new_fee" : "new_product",
        costCategory: oneTime ? "one_time" : "recurring",
        lineKey, amount: oneTime ? after.oneTimeAmount : after.annualizedAmount,
        explanation: oneTime
          ? `${after.productName} adds a one-time ${after.currency} ${after.oneTimeAmount.toFixed(2)} charge.`
          : `${after.productName} adds ${after.currency} ${after.annualizedAmount.toFixed(2)} annually.`,
        currentEvidenceIds: [], proposedEvidenceIds: evidenceIds(after.evidence)
      });
      continue;
    }
    if (before && !after) {
      const oneTime = before.chargeType === "one_time";
      components.push({
        type: oneTime ? "one_time_charge_change" : "removed_product",
        costCategory: oneTime ? "one_time" : "recurring",
        lineKey, amount: -(oneTime ? before.oneTimeAmount : before.annualizedAmount),
        explanation: oneTime
          ? `${before.productName} removes a one-time ${before.currency} ${before.oneTimeAmount.toFixed(2)} charge.`
          : `${before.productName} removes ${before.currency} ${before.annualizedAmount.toFixed(2)} annually.`,
        currentEvidenceIds: acceptedEvidenceIds(before.evidence), proposedEvidenceIds: []
      });
      continue;
    }
    if (!before || !after) continue;
    if (before.chargeType === "one_time" || after.chargeType === "one_time") {
      const amount = roundMoney(after.oneTimeAmount - before.oneTimeAmount);
      if (amount) components.push({
        type: "one_time_charge_change", costCategory: "one_time", lineKey, amount,
        explanation: `${after.productName} changes one-time cost by ${after.currency} ${amount.toFixed(2)}.`,
        currentEvidenceIds: acceptedEvidenceIds(before.evidence), proposedEvidenceIds: evidenceIds(after.evidence)
      });
      continue;
    }
    const factor = annualFactor(after);
    if (before.unitPrice != null && after.unitPrice != null && before.quantity != null) {
      const rate = roundMoney((after.unitPrice - before.unitPrice) * before.quantity * factor);
      if (rate) components.push({
        type: "unit_price_change", costCategory: "recurring", lineKey, amount: rate,
        explanation: `${after.productName} unit pricing changes annual cost by ${after.currency} ${rate.toFixed(2)}.`,
        currentEvidenceIds: acceptedEvidenceIds(before.evidence), proposedEvidenceIds: evidenceIds(after.evidence)
      });
    }
    if (before.quantity != null && after.quantity != null && after.unitPrice != null) {
      const quantity = roundMoney((after.quantity - before.quantity) * after.unitPrice * factor);
      if (quantity) components.push({
        type: "quantity_change", costCategory: "recurring", lineKey, amount: quantity,
        explanation: `${after.productName} quantity changes annual cost by ${after.currency} ${quantity.toFixed(2)}.`,
        currentEvidenceIds: acceptedEvidenceIds(before.evidence), proposedEvidenceIds: evidenceIds(after.evidence)
      });
    }
  }

  const currentAnnualCost = current.statedAnnualTotal ?? current.calculatedAnnualTotal;
  const proposedAnnualCost = proposed.statedAnnualTotal ?? proposed.calculatedAnnualTotal;
  const currentOneTimeCost = current.calculatedOneTimeTotal;
  const proposedOneTimeCost = proposed.calculatedOneTimeTotal;
  const currentCommitmentCost = current.statedCommitmentTotal ?? current.calculatedCommitmentTotal;
  const proposedCommitmentCost = proposed.statedCommitmentTotal ?? proposed.calculatedCommitmentTotal;
  const recurringDelta = roundMoney(proposedAnnualCost - currentAnnualCost);
  const oneTimeDelta = roundMoney(proposedOneTimeCost - currentOneTimeCost);
  let attributedRecurringDelta = roundMoney(components
    .filter((component) => component.costCategory === "recurring")
    .reduce((sum, component) => sum + component.amount, 0));
  const attributedOneTimeDelta = roundMoney(components
    .filter((component) => component.costCategory === "one_time")
    .reduce((sum, component) => sum + component.amount, 0));
  let residualRecurringAmount = roundMoney(recurringDelta - attributedRecurringDelta);
  const residualOneTimeAmount = roundMoney(oneTimeDelta - attributedOneTimeDelta);
  const currentDiscount = current.lineItems.reduce((sum, item) => sum + (item.discountAmount ?? 0), 0);
  const proposedDiscount = proposed.lineItems.reduce((sum, item) => sum + (item.discountAmount ?? 0), 0);
  if (residualRecurringAmount > 0 && currentDiscount > proposedDiscount) {
    components.push({
      type: "removed_discount", costCategory: "recurring", lineKey: "commercial-total", amount: residualRecurringAmount,
      explanation: `Removed or reduced discounts add ${current.currency} ${residualRecurringAmount.toFixed(2)} annually.`,
      currentEvidenceIds: current.lineItems.flatMap((item) => acceptedEvidenceIds(item.evidence)),
      proposedEvidenceIds: proposed.lineItems.flatMap((item) => evidenceIds(item.evidence))
    });
    attributedRecurringDelta = roundMoney(attributedRecurringDelta + residualRecurringAmount);
    residualRecurringAmount = 0;
  }
  const attributedDelta = roundMoney(attributedRecurringDelta + attributedOneTimeDelta);
  const residualAmount = roundMoney(residualRecurringAmount + residualOneTimeAmount);
  const commitmentResidual = roundMoney(
    proposedCommitmentCost - currentCommitmentCost -
    (proposed.calculatedCommitmentTotal - current.calculatedCommitmentTotal)
  );
  const reconciled = Math.abs(residualRecurringAmount) <= 0.01 &&
    Math.abs(residualOneTimeAmount) <= 0.01 && Math.abs(commitmentResidual) <= 0.01;
  const positive = recurringDelta >= 0 ? "higher" : "lower";
  const drivers = components
    .filter((item) => Math.abs(item.amount) > 0.01)
    .map((item) => `${current.currency} ${Math.abs(item.amount).toFixed(2)} from ${item.type.replaceAll("_", " ")}`)
    .join(", ");
  return {
    status: reconciled ? "reconciled" : "unreconciled",
    currency: current.currency,
    currentAnnualCost,
    proposedAnnualCost,
    currentOneTimeCost,
    proposedOneTimeCost,
    currentCommitmentCost,
    proposedCommitmentCost,
    components,
    attributedDelta,
    residualAmount,
    recurringDelta,
    oneTimeDelta,
    attributedRecurringDelta,
    attributedOneTimeDelta,
    residualRecurringAmount,
    residualOneTimeAmount,
    explanation: `The proposal recurring cost is ${current.currency} ${Math.abs(recurringDelta).toFixed(2)} ${positive} annually and one-time cost changes by ${current.currency} ${oneTimeDelta.toFixed(2)}${drivers ? `. The bridge attributes ${drivers}.` : "."}`,
    limitations: reconciled ? [] : [
      ...(Math.abs(residualRecurringAmount) > 0.01 || Math.abs(residualOneTimeAmount) > 0.01
        ? ["quote_total_not_fully_reconciled"] : []),
      ...(Math.abs(commitmentResidual) > 0.01 ? ["stated_commitment_total_not_reconciled"] : [])
    ]
  };
}

function finding(input: Omit<CommercialFinding, "calculationVersion" | "taxonomyVersion">): CommercialFinding {
  return { ...input, calculationVersion: COMMERCIAL_CALCULATION_VERSION, taxonomyVersion: COMMERCIAL_TAXONOMY_VERSION };
}

function percentDelta(current: number | null, proposed: number | null) {
  if (current == null || proposed == null || current === 0) return null;
  return roundMoney(((proposed - current) / current) * 100);
}

function detectFindings(
  current: ReturnType<typeof normalizeCommercialTerms>,
  proposed: ReturnType<typeof normalizeCommercialTerms>,
  bridge: CostBridge
) {
  const findings: CommercialFinding[] = [];
  const currentEvidence = current.lineItems.flatMap((item) => acceptedEvidenceIds(item.evidence));
  const proposedEvidence = proposed.lineItems.flatMap((item) => evidenceIds(item.evidence));
  if (bridge.currentAnnualCost != null && bridge.proposedAnnualCost != null && bridge.proposedAnnualCost !== bridge.currentAnnualCost) {
    const delta = roundMoney(bridge.proposedAnnualCost - bridge.currentAnnualCost);
    findings.push(finding({
      findingType: delta > 0 ? "total_price_increase" : "total_price_decrease",
      reasonCode: delta > 0 ? "proposed_annual_cost_increased" : "proposed_annual_cost_decreased",
      severity: delta > 0 ? "high" : "info", confidence: bridge.status === "reconciled" ? 1 : 0.7,
      title: delta > 0 ? "Annual cost increased" : "Annual cost decreased",
      description: bridge.explanation,
      currentValue: bridge.currentAnnualCost, proposedValue: bridge.proposedAnnualCost,
      absoluteDelta: delta, percentageDelta: percentDelta(bridge.currentAnnualCost, bridge.proposedAnnualCost),
      annualizedImpact: delta,
      totalCommitmentImpact: proposed.calculatedCommitmentTotal - current.calculatedCommitmentTotal,
      currentEvidenceIds: currentEvidence, proposedEvidenceIds: proposedEvidence,
      limitations: bridge.limitations
    }));
  }
  for (const component of bridge.components) {
    if (component.type === "unit_price_change" && component.amount > 0) {
      findings.push(finding({ findingType: "unit_price_increase", reasonCode: "effective_unit_price_increased", severity: "high", confidence: 1,
        title: "Effective unit price increased", description: component.explanation, currentValue: null, proposedValue: null,
        absoluteDelta: component.amount, percentageDelta: null, annualizedImpact: component.amount, totalCommitmentImpact: component.amount,
        currentEvidenceIds: component.currentEvidenceIds, proposedEvidenceIds: component.proposedEvidenceIds, limitations: [] }));
    } else if (component.type === "quantity_change" && component.amount > 0) {
      findings.push(finding({ findingType: "quantity_increase", reasonCode: "proposed_quantity_increased", severity: "medium", confidence: 1,
        title: "Quantity increased", description: component.explanation, currentValue: null, proposedValue: null,
        absoluteDelta: component.amount, percentageDelta: null, annualizedImpact: component.amount, totalCommitmentImpact: component.amount,
        currentEvidenceIds: component.currentEvidenceIds, proposedEvidenceIds: component.proposedEvidenceIds, limitations: [] }));
    } else if (component.type === "removed_discount") {
      findings.push(finding({ findingType: "discount_removed", reasonCode: "existing_discount_removed", severity: "high", confidence: 0.95,
        title: "Existing discount removed", description: component.explanation, currentValue: "discounted", proposedValue: "reduced_or_removed",
        absoluteDelta: component.amount, percentageDelta: null, annualizedImpact: component.amount, totalCommitmentImpact: component.amount,
        currentEvidenceIds: component.currentEvidenceIds, proposedEvidenceIds: component.proposedEvidenceIds,
        limitations: ["discount_attribution_uses_reconciled_residual"] }));
    } else if (component.type === "new_product" || component.type === "new_fee") {
      findings.push(finding({ findingType: component.type, reasonCode: component.type === "new_fee" ? "new_fee_added" : "new_product_added", severity: "medium", confidence: 1,
        title: component.type === "new_fee" ? "New fee added" : "New product added", description: component.explanation,
        currentValue: null, proposedValue: component.lineKey, absoluteDelta: component.amount, percentageDelta: null,
        annualizedImpact: component.costCategory === "recurring" ? component.amount : null,
        totalCommitmentImpact: component.costCategory === "one_time" ? component.amount : null,
        currentEvidenceIds: component.currentEvidenceIds, proposedEvidenceIds: component.proposedEvidenceIds, limitations: [] }));
    } else if (component.type === "one_time_charge_change" && component.amount > 0) {
      findings.push(finding({ findingType: "one_time_charge_increase", reasonCode: "one_time_charge_increased", severity: "medium", confidence: 1,
        title: "One-time charges increased", description: component.explanation,
        currentValue: null, proposedValue: component.lineKey, absoluteDelta: component.amount, percentageDelta: null,
        annualizedImpact: null, totalCommitmentImpact: component.amount,
        currentEvidenceIds: component.currentEvidenceIds, proposedEvidenceIds: component.proposedEvidenceIds, limitations: [] }));
    }
  }
  const termRules: Array<[boolean, string, string, string]> = [
    [Boolean(current.paymentTerms && proposed.paymentTerms && current.paymentTerms !== proposed.paymentTerms), "payment_terms_changed", "payment_terms_changed", "Payment terms changed"],
    [Boolean(current.renewalTermMonths && proposed.renewalTermMonths && proposed.renewalTermMonths > current.renewalTermMonths), "longer_commitment", "renewal_term_lengthened", "Commitment became longer"],
    [Boolean(current.noticePeriodDays && proposed.noticePeriodDays && proposed.noticePeriodDays < current.noticePeriodDays), "shorter_notice_period", "notice_period_shortened", "Notice period became shorter"],
    [current.autoRenewal !== true && proposed.autoRenewal === true, "auto_renewal_added", "automatic_renewal_added", "Automatic renewal added"],
    [Boolean((proposed.minimumSpend ?? 0) > (current.minimumSpend ?? 0)), "minimum_spend_increased", "minimum_spend_increased", "Minimum spend increased"],
    [Boolean((proposed.terminationCharge ?? 0) > (current.terminationCharge ?? 0)), "termination_charge_increased", "termination_charge_increased", "Termination charge increased"],
    [Boolean((proposed.upliftPercent ?? 0) > (current.upliftPercent ?? 0) || (current.upliftCapped === true && proposed.upliftCapped === false)), "uplift_worsened", "uplift_increased_or_uncapped", "Price uplift became less favorable"],
    [Boolean((proposed.serviceCreditPercent ?? 0) < (current.serviceCreditPercent ?? 0)), "service_credit_reduced", "service_credit_reduced", "Service credits reduced"]
  ];
  for (const [active, findingType, reasonCode, title] of termRules) {
    if (!active) continue;
    findings.push(finding({ findingType, reasonCode, severity: "medium", confidence: 0.9, title,
      description: `${title} in the proposed commercial terms.`, currentValue: null, proposedValue: null,
      absoluteDelta: null, percentageDelta: null, annualizedImpact: null, totalCommitmentImpact: null,
      currentEvidenceIds: currentEvidence, proposedEvidenceIds: proposedEvidence, limitations: [] }));
  }
  if (bridge.status === "unreconciled") {
    findings.push(finding({ findingType: "conflicting_total", reasonCode: "quote_total_not_reconciled", severity: "critical", confidence: 1,
      title: "Quote total does not reconcile", description: `The stated proposal total differs from attributed line-item changes by ${bridge.currency} ${Math.abs(bridge.residualAmount ?? 0).toFixed(2)}.`,
      currentValue: bridge.attributedDelta, proposedValue: bridge.proposedAnnualCost, absoluteDelta: bridge.residualAmount,
      percentageDelta: null, annualizedImpact: null, totalCommitmentImpact: null,
      currentEvidenceIds: currentEvidence, proposedEvidenceIds: proposedEvidence, limitations: bridge.limitations }));
  }
  return findings;
}

function buildUsageOpportunities(input: {
  contractId: string;
  proposal: ReturnType<typeof normalizeCommercialTerms>;
  usage: TrustedUsageEvidence[];
  findings: CommercialFinding[];
  actionDeadline: string | null;
}) {
  const opportunities: NegotiationOpportunity[] = [];
  for (const line of input.proposal.lineItems) {
    const usage = input.usage.find((item) => item.lineKey === line.lineKey && item.matchedContractId === input.contractId);
    const usable = usage?.status === "trusted" && usage.providerConnectionId && usage.activeQuantity >= 0;
    if (!usage || !usable || line.unitPrice == null || line.quantity == null) continue;
    const unused = Math.max(0, line.quantity - usage.activeQuantity);
    if (unused <= 0) continue;
    const avoidable = roundMoney(unused * line.unitPrice * annualFactor(line));
    opportunities.push({
      type: "reduce_quantity",
      recommendedAction: `Request a quantity reduction for ${line.productName} based on reviewed active usage.`,
      lowSavingsAmount: roundMoney(avoidable * 0.5), highSavingsAmount: avoidable,
      currency: line.currency, evidenceCompleteness: "complete",
      rationale: `${unused} proposed units exceed trusted active usage.`,
      supportingFindingReasonCodes: input.findings.map((item) => item.reasonCode).filter((code) => code.includes("quantity") || code.includes("cost")),
      assumptions: ["Active usage remains representative through the renewal term.", "The vendor permits quantity reduction at renewal."],
      missingEvidence: [], actionDeadline: input.actionDeadline
    });
  }
  return opportunities;
}

function buildScenarios(input: {
  current: ReturnType<typeof normalizeCommercialTerms>;
  proposed: ReturnType<typeof normalizeCommercialTerms>;
  opportunities: NegotiationOpportunity[];
  fingerprint: string;
}) {
  const currentRecurring = input.current.statedAnnualTotal ?? input.current.calculatedAnnualTotal;
  const proposedRecurring = input.proposed.statedAnnualTotal ?? input.proposed.calculatedAnnualTotal;
  const currentOneTime = input.current.calculatedOneTimeTotal;
  const proposedOneTime = input.proposed.calculatedOneTimeTotal;
  const commitmentYears = Math.max(1, (input.proposed.renewalTermMonths ?? 12) / 12);
  const usageLow = input.opportunities.reduce((sum, item) => sum + (item.lowSavingsAmount ?? 0), 0);
  const usageHigh = input.opportunities.reduce((sum, item) => sum + (item.highSavingsAmount ?? 0), 0);
  const currentFirstYearCost = roundMoney(currentRecurring + currentOneTime);
  const make = (inputScenario: {
    type: CommercialScenario["type"];
    annualCost: number | null;
    transitionCost: number;
    low: number | null;
    high: number | null;
    risks: string[];
    statedCommitmentTotal?: number | null;
  }): CommercialScenario => ({
    type: inputScenario.type,
    annualCost: inputScenario.annualCost,
    firstYearEffect: inputScenario.annualCost == null
      ? null
      : roundMoney(inputScenario.annualCost + inputScenario.transitionCost - currentFirstYearCost),
    multiYearCommitment: inputScenario.statedCommitmentTotal ?? (inputScenario.annualCost == null
      ? null
      : roundMoney(inputScenario.annualCost * commitmentYears + inputScenario.transitionCost)),
    transitionCost: inputScenario.transitionCost,
    estimatedSavingsLow: inputScenario.low, estimatedSavingsHigh: inputScenario.high, majorRisks: inputScenario.risks,
    evidenceFingerprint: input.fingerprint, status: "draft"
  });
  const proposalFirstYearCost = roundMoney(proposedRecurring + proposedOneTime);
  const currentFirstYearRenewalCost = roundMoney(currentRecurring + currentOneTime);
  return [
    make({ type: "accept_proposal", annualCost: proposedRecurring, transitionCost: proposedOneTime,
      statedCommitmentTotal: input.proposed.statedCommitmentTotal, low: 0, high: 0,
      risks: ["Accepts all proposed commercial and contractual changes."] }),
    make({ type: "renew_unchanged", annualCost: currentRecurring, transitionCost: currentOneTime,
      low: Math.max(0, proposalFirstYearCost - currentFirstYearRenewalCost),
      high: Math.max(0, proposalFirstYearCost - currentFirstYearRenewalCost),
      risks: ["Requires vendor acceptance of current economics."] }),
    make({ type: "renegotiate_price", annualCost: currentRecurring, transitionCost: proposedOneTime,
      low: Math.max(0, proposedRecurring - currentRecurring) * 0.5,
      high: Math.max(0, proposedRecurring - currentRecurring),
      risks: ["Savings remain estimated until vendor agreement is reviewed."] }),
    make({ type: "reduce_quantity", annualCost: roundMoney(Math.max(0, proposedRecurring - usageHigh)), transitionCost: proposedOneTime,
      low: usageLow, high: usageHigh, risks: ["Depends on trusted usage and vendor quantity flexibility."] }),
    make({ type: "terminate", annualCost: 0, transitionCost: input.current.terminationCharge ?? 0,
      low: proposalFirstYearCost, high: proposalFirstYearCost,
      risks: input.current.terminationCharge == null
        ? ["Transition, replacement, and termination costs are not included without reviewed evidence."]
        : ["Reviewed termination charges are included; replacement costs still require evidence."] })
  ];
}

export function compareCommercialTerms(input: {
  contractId: string;
  baseline: CommercialTermsInput;
  proposal: CommercialTermsInput;
  usageEvidence?: TrustedUsageEvidence[];
  actionDeadline?: string | null;
}): CommercialComparisonResult {
  try {
    const current = normalizeCommercialTerms(input.baseline, { requireAcceptedEvidence: true });
    const proposed = normalizeCommercialTerms(input.proposal, { requireAcceptedEvidence: false });
    const bridge = buildCostBridge(current, proposed);
    if (bridge.status === "insufficient_evidence") {
      return { status: "insufficient_evidence", baseline: current.lineItems, proposal: proposed.lineItems,
        costBridge: bridge, findings: [], opportunities: [], scenarios: [],
        evidenceFingerprint: stableFingerprint({ baseline: current, proposal: proposed }), warnings: bridge.limitations };
    }
    const findings = detectFindings(current, proposed, bridge);
    const fingerprint = stableFingerprint({
      baselineEvidence: current.lineItems.flatMap((item) => acceptedEvidenceIds(item.evidence)).sort(),
      proposalEvidence: proposed.lineItems.flatMap((item) => evidenceIds(item.evidence)).sort(),
      baseline: current.lineItems.map(withoutEvidence),
      proposal: proposed.lineItems.map(withoutEvidence)
    });
    const opportunities = buildUsageOpportunities({ contractId: input.contractId, proposal: proposed,
      usage: input.usageEvidence ?? [], findings, actionDeadline: input.actionDeadline ?? null });
    if (findings.some((item) => item.reasonCode === "existing_discount_removed")) {
      const impact = findings.find((item) => item.reasonCode === "existing_discount_removed")?.annualizedImpact ?? null;
      opportunities.push({ type: "preserve_discount", recommendedAction: "Request preservation of the reviewed existing discount.",
        lowSavingsAmount: impact == null ? null : roundMoney(impact * 0.5), highSavingsAmount: impact,
        currency: bridge.currency, evidenceCompleteness: impact == null ? "partial" : "complete",
        rationale: "The proposal removes or reduces a discount present in the reviewed baseline.",
        supportingFindingReasonCodes: ["existing_discount_removed"], assumptions: ["The vendor can extend the existing discount."],
        missingEvidence: impact == null ? ["Reviewed discount value"] : [], actionDeadline: input.actionDeadline ?? null });
    }
    const scenarios = buildScenarios({ current, proposed, opportunities, fingerprint });
    return { status: "completed", baseline: current.lineItems, proposal: proposed.lineItems, costBridge: bridge,
      findings, opportunities, scenarios, evidenceFingerprint: fingerprint, warnings: bridge.limitations };
  } catch (error) {
    const code = error instanceof Error ? error.message : "commercial_comparison_failed";
    const bridge: CostBridge = { status: "insufficient_evidence", currency: null, currentAnnualCost: null,
      proposedAnnualCost: null, currentOneTimeCost: null, proposedOneTimeCost: null,
      currentCommitmentCost: null, proposedCommitmentCost: null,
      components: [], attributedDelta: null, residualAmount: null,
      recurringDelta: null, oneTimeDelta: null, attributedRecurringDelta: null, attributedOneTimeDelta: null,
      residualRecurringAmount: null, residualOneTimeAmount: null,
      explanation: "The commercial terms cannot be compared safely with the available reviewed evidence.", limitations: [code] };
    return { status: "insufficient_evidence", baseline: [], proposal: [], costBridge: bridge, findings: [], opportunities: [],
      scenarios: [], evidenceFingerprint: stableFingerprint({ limitation: code }), warnings: [code] };
  }
}

export function evaluateScenarioApproval(input: {
  approvedEvidenceFingerprint: string;
  currentEvidenceFingerprint: string;
}) {
  return input.approvedEvidenceFingerprint === input.currentEvidenceFingerprint
    ? { valid: true as const, status: "approved" as const, reasonCode: null }
    : { valid: false as const, status: "reapproval_required" as const, reasonCode: "material_evidence_changed" as const };
}

export function buildDeterministicNegotiationBrief(input: {
  contractTitle: string;
  vendorName: string | null;
  comparison: CommercialComparisonResult;
  actionOwnerLabel?: string | null;
  actionDeadline?: string | null;
}) {
  const currency = input.comparison.costBridge.currency;
  const opportunities = input.comparison.opportunities;
  return {
    executiveSummary: input.comparison.costBridge.explanation,
    currentAnnualCost: input.comparison.costBridge.currentAnnualCost,
    proposedAnnualCost: input.comparison.costBridge.proposedAnnualCost,
    currency,
    costBridge: input.comparison.costBridge.components,
    unfavorableChanges: input.comparison.findings.filter((item) => item.severity === "high" || item.severity === "critical"),
    negotiationPriorities: opportunities.map((item) => item.recommendedAction),
    targetPosition: opportunities.reduce((sum, item) => sum + (item.highSavingsAmount ?? 0), 0),
    acceptablePosition: opportunities.reduce((sum, item) => sum + (item.lowSavingsAmount ?? 0), 0),
    walkAwayPosition: null,
    questionsForVendor: input.comparison.costBridge.status === "unreconciled"
      ? ["Please reconcile the stated total to the quoted line items and discounts."] : [],
    actionOwnerLabel: input.actionOwnerLabel ?? null,
    actionDeadline: input.actionDeadline ?? null,
    evidenceTrace: {
      fingerprint: input.comparison.evidenceFingerprint,
      baselineEvidenceIds: input.comparison.baseline.flatMap((item) => acceptedEvidenceIds(item.evidence)),
      proposalEvidenceIds: input.comparison.proposal.flatMap((item) => evidenceIds(item.evidence)),
      calculationVersion: COMMERCIAL_CALCULATION_VERSION,
      taxonomyVersion: COMMERCIAL_TAXONOMY_VERSION
    },
    labels: {
      numericalClaims: "deterministic_calculation",
      opportunities: "estimate_not_realized",
      communications: "review_and_manual_action_only"
    }
  };
}

import {
  COMMERCIAL_CALCULATION_VERSION,
  COMMERCIAL_FINDING_TAXONOMY_VERSION
} from "@/lib/contract-intelligence/commercial-schema";
import {
  findCommercialFieldConflicts,
  selectEffectiveAcceptedField
} from "@/lib/contract-intelligence/document-precedence";
import type {
  ContractDocumentRelationship,
  ContractExtractedField
} from "@/lib/contract-intelligence/extraction-types";
import {
  isValidIanaTimezone,
  localDateInTimezone
} from "@/lib/evidence-readiness/deadline-timezone";

export type CommercialCalculation = {
  calculationType: string;
  calculationVersion: string;
  status: "confirmed" | "estimate" | "insufficient_evidence" | "conflict";
  amount: number | null;
  currency: string | null;
  percentage: number | null;
  dateValue: string | null;
  explanation: string;
  sourceFieldIds: string[];
  warningCodes: string[];
};

export type CommercialFinding = {
  reasonCode: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  confidence: number;
  explanation: string;
  financialImpactMin: number | null;
  financialImpactMax: number | null;
  currency: string | null;
  evidenceFieldIds: string[];
  limitations: string[];
  recommendedHumanAction: string;
  calculationVersion: string;
  taxonomyVersion: string;
};

function value(field: ContractExtractedField | undefined) {
  return field?.edited_value ?? field?.normalized_value ?? field?.extracted_value ?? null;
}

function stringValue(field: ContractExtractedField | undefined) {
  const candidate = value(field);
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function numberValue(field: ContractExtractedField | undefined) {
  const candidate = value(field);
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}

function booleanValue(field: ContractExtractedField | undefined) {
  const candidate = value(field);
  return typeof candidate === "boolean" ? candidate : null;
}

function effectiveAccepted(
  fields: ContractExtractedField[],
  key: string,
  relationships: ContractDocumentRelationship[]
) {
  return selectEffectiveAcceptedField({ fields, fieldKey: key, relationships });
}

function currency(fields: ContractExtractedField[], relationships: ContractDocumentRelationship[]) {
  return stringValue(effectiveAccepted(fields, "contract_value_currency", relationships))?.toUpperCase() ?? null;
}

function dateOrdinal(date: string | null) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const ordinal = Date.UTC(year!, month! - 1, day!);
  const normalized = new Date(ordinal).toISOString().slice(0, 10);
  return normalized === date ? ordinal : null;
}

function durationMonths(value: string | null) {
  if (!value) return null;
  const match = value.toLowerCase().match(/(\d+(?:\.\d+)?)\s*(month|months|year|years)/);
  if (!match) return null;
  const quantity = Number(match[1]);
  return Number.isFinite(quantity) && quantity > 0
    ? quantity * (match[2]!.startsWith("year") ? 12 : 1)
    : null;
}

export function calculateCommercialExposure(input: {
  fields: ContractExtractedField[];
  now?: Date;
  organizationTimezone?: string | null;
  relationships?: ContractDocumentRelationship[];
}): CommercialCalculation[] {
  const fields = input.fields;
  const relationships = input.relationships ?? [];
  const conflicts = findCommercialFieldConflicts(fields, relationships).filter((conflict) => conflict.status === "unresolved");
  const calculations: CommercialCalculation[] = [];
  const acceptedField = (key: string) => effectiveAccepted(fields, key, relationships);
  const annual = acceptedField("committed_annual_cost");
  const total = acceptedField("total_committed_cost");
  const baseAmount = acceptedField("contract_value_amount");
  const billing = stringValue(acceptedField("billing_frequency"))?.toLowerCase() ?? null;
  const currencyCode = currency(fields, relationships);

  if (conflicts.some((conflict) => ["committed_annual_cost", "contract_value_amount", "billing_frequency"].includes(conflict.fieldKey))) {
    calculations.push({
      calculationType: "normalized_annual_cost",
      calculationVersion: COMMERCIAL_CALCULATION_VERSION,
      status: "conflict",
      amount: null,
      currency: currencyCode,
      percentage: null,
      dateValue: null,
      explanation: "Annual cost is blocked because reviewed source values conflict.",
      sourceFieldIds: [],
      warningCodes: ["conflicting_annual_cost_inputs"]
    });
  } else if (numberValue(annual) !== null && currencyCode) {
    calculations.push({
      calculationType: "normalized_annual_cost",
      calculationVersion: COMMERCIAL_CALCULATION_VERSION,
      status: "confirmed",
      amount: numberValue(annual),
      currency: currencyCode,
      percentage: null,
      dateValue: null,
      explanation: "Uses the reviewed committed annual cost stated by the contract.",
      sourceFieldIds: [annual!.id, acceptedField("contract_value_currency")!.id],
      warningCodes: []
    });
  } else if (numberValue(baseAmount) !== null && currencyCode && ["monthly", "month"].includes(billing ?? "")) {
    calculations.push({
      calculationType: "normalized_annual_cost",
      calculationVersion: COMMERCIAL_CALCULATION_VERSION,
      status: "confirmed",
      amount: Number((numberValue(baseAmount)! * 12).toFixed(2)),
      currency: currencyCode,
      percentage: null,
      dateValue: null,
      explanation: "Multiplies the reviewed monthly contract amount by 12.",
      sourceFieldIds: [baseAmount!.id, acceptedField("billing_frequency")!.id],
      warningCodes: []
    });
  } else if (numberValue(baseAmount) !== null && currencyCode && ["annual", "annually", "yearly", "year"].includes(billing ?? "")) {
    calculations.push({
      calculationType: "normalized_annual_cost",
      calculationVersion: COMMERCIAL_CALCULATION_VERSION,
      status: "confirmed",
      amount: numberValue(baseAmount),
      currency: currencyCode,
      percentage: null,
      dateValue: null,
      explanation: "Uses the reviewed annual contract amount without conversion.",
      sourceFieldIds: [baseAmount!.id, acceptedField("billing_frequency")!.id],
      warningCodes: []
    });
  } else {
    calculations.push({
      calculationType: "normalized_annual_cost",
      calculationVersion: COMMERCIAL_CALCULATION_VERSION,
      status: "insufficient_evidence",
      amount: null,
      currency: currencyCode,
      percentage: null,
      dateValue: null,
      explanation: "A reviewed amount, currency, and unambiguous billing period are required.",
      sourceFieldIds: [],
      warningCodes: ["annual_cost_inputs_incomplete"]
    });
  }

  calculations.push({
    calculationType: "total_committed_cost",
    calculationVersion: COMMERCIAL_CALCULATION_VERSION,
    status: numberValue(total) !== null && currencyCode ? "confirmed" : "insufficient_evidence",
    amount: numberValue(total),
    currency: currencyCode,
    percentage: null,
    dateValue: null,
    explanation: numberValue(total) !== null
      ? "Uses the reviewed total committed cost stated by the contract."
      : "No reviewed total committed cost is available; no estimate was invented.",
    sourceFieldIds: total ? [total.id] : [],
    warningCodes: total ? [] : ["total_committed_cost_missing"]
  });

  const deadline = acceptedField("notice_deadline_date");
  const deadlineValue = stringValue(deadline);
  const now = input.now ?? new Date();
  const timezone = isValidIanaTimezone(input.organizationTimezone)
    ? input.organizationTimezone!
    : "UTC";
  const localToday = localDateInTimezone(now, timezone);
  const deadlineOrdinal = dateOrdinal(deadlineValue);
  const todayOrdinal = dateOrdinal(localToday);
  const daysRemaining = deadlineOrdinal === null || todayOrdinal === null
    ? null
    : Math.round((deadlineOrdinal - todayOrdinal) / 86_400_000);
  calculations.push({
    calculationType: "days_until_last_safe_action",
    calculationVersion: COMMERCIAL_CALCULATION_VERSION,
    status: daysRemaining === null ? "insufficient_evidence" : "confirmed",
    amount: daysRemaining,
    currency: null,
    percentage: null,
    dateValue: deadlineValue,
    explanation: daysRemaining === null
      ? "A reviewed notice deadline is required."
      : `Calendar-day difference from the reviewed notice deadline in ${timezone}.`,
    sourceFieldIds: deadline ? [deadline.id] : [],
    warningCodes: [
      ...(daysRemaining === null ? ["reviewed_notice_deadline_missing"] : []),
      ...(!isValidIanaTimezone(input.organizationTimezone) ? ["organization_timezone_defaulted_to_utc"] : [])
    ]
  });

  const uplift = acceptedField("fixed_uplift_percentage");
  const upliftPercent = numberValue(uplift);
  const annualCalculation = calculations.find((entry) => entry.calculationType === "normalized_annual_cost");
  calculations.push({
    calculationType: "price_increase_exposure",
    calculationVersion: COMMERCIAL_CALCULATION_VERSION,
    status: upliftPercent !== null && annualCalculation?.status === "confirmed" ? "confirmed" : "insufficient_evidence",
    amount: upliftPercent !== null && annualCalculation?.amount != null
      ? Number((annualCalculation.amount * upliftPercent / 100).toFixed(2))
      : null,
    currency: annualCalculation?.currency ?? null,
    percentage: upliftPercent,
    dateValue: null,
    explanation: upliftPercent !== null && annualCalculation?.status === "confirmed"
      ? "Applies the reviewed fixed uplift percentage to reviewed annual cost."
      : "Reviewed annual cost and fixed uplift percentage are both required.",
    sourceFieldIds: uplift ? [uplift.id, ...(annualCalculation?.sourceFieldIds ?? [])] : [],
    warningCodes: upliftPercent === null ? ["fixed_uplift_missing"] : []
  });

  const expiration = acceptedField("expiration_date");
  const effectiveDate = acceptedField("effective_date");
  const expirationValue = stringValue(expiration);
  const effectiveDateValue = stringValue(effectiveDate);
  const expirationOrdinal = dateOrdinal(expirationValue);
  const effectiveOrdinal = dateOrdinal(effectiveDateValue);
  const remainingDays = expirationOrdinal === null || todayOrdinal === null
    ? null
    : Math.max(0, Math.ceil((expirationOrdinal - todayOrdinal) / 86_400_000));
  const statedTotal = numberValue(total);
  const annualAmount = annualCalculation?.status === "confirmed" ? annualCalculation.amount : null;
  let remainingAmount: number | null = null;
  let remainingSources: string[] = [];
  let remainingExplanation = "Reviewed cost and expiration evidence are required.";
  const remainingWarnings: string[] = [];
  if (remainingDays !== null && statedTotal !== null && effectiveOrdinal !== null && expirationOrdinal! > effectiveOrdinal) {
    const totalTermDays = Math.ceil((expirationOrdinal! - effectiveOrdinal) / 86_400_000);
    remainingAmount = Number((statedTotal * Math.min(remainingDays, totalTermDays) / totalTermDays).toFixed(2));
    remainingSources = [total!.id, effectiveDate!.id, expiration!.id];
    remainingExplanation = "Prorates reviewed total committed cost over the reviewed effective-to-expiration term.";
    remainingWarnings.push("straight_line_commitment_estimate");
  } else if (remainingDays !== null && annualAmount !== null) {
    remainingAmount = Number((annualAmount * remainingDays / 365.25).toFixed(2));
    remainingSources = [...(annualCalculation?.sourceFieldIds ?? []), expiration!.id];
    remainingExplanation = "Estimates remaining commitment from reviewed annual cost and expiration date.";
    remainingWarnings.push("annualized_remaining_cost_estimate");
  } else {
    remainingWarnings.push("remaining_cost_inputs_incomplete");
  }
  calculations.push({
    calculationType: "remaining_committed_cost",
    calculationVersion: COMMERCIAL_CALCULATION_VERSION,
    status: remainingAmount === null ? "insufficient_evidence" : "estimate",
    amount: remainingAmount,
    currency: currencyCode,
    percentage: null,
    dateValue: expirationValue,
    explanation: remainingExplanation,
    sourceFieldIds: remainingSources,
    warningCodes: remainingWarnings
  });

  const quantity = acceptedField("quantities");
  const quantityValue = numberValue(quantity);
  calculations.push({
    calculationType: "effective_unit_price",
    calculationVersion: COMMERCIAL_CALCULATION_VERSION,
    status: annualAmount !== null && quantityValue !== null && quantityValue > 0 ? "confirmed" : "insufficient_evidence",
    amount: annualAmount !== null && quantityValue !== null && quantityValue > 0
      ? Number((annualAmount / quantityValue).toFixed(4))
      : null,
    currency: currencyCode,
    percentage: null,
    dateValue: null,
    explanation: annualAmount !== null && quantityValue !== null && quantityValue > 0
      ? "Divides reviewed annual committed cost by the reviewed committed quantity."
      : "Reviewed annual cost and a positive, unambiguous quantity are required.",
    sourceFieldIds: quantity && annualAmount !== null ? [...(annualCalculation?.sourceFieldIds ?? []), quantity.id] : [],
    warningCodes: annualAmount !== null && quantityValue !== null && quantityValue > 0 ? [] : ["unit_price_inputs_incomplete"]
  });

  const renewalTerm = acceptedField("renewal_term");
  const renewalMonths = durationMonths(stringValue(renewalTerm));
  calculations.push({
    calculationType: "renewal_term_exposure",
    calculationVersion: COMMERCIAL_CALCULATION_VERSION,
    status: annualAmount !== null && renewalMonths !== null ? "estimate" : "insufficient_evidence",
    amount: annualAmount !== null && renewalMonths !== null
      ? Number((annualAmount * renewalMonths / 12).toFixed(2))
      : null,
    currency: currencyCode,
    percentage: null,
    dateValue: null,
    explanation: annualAmount !== null && renewalMonths !== null
      ? "Estimates one renewal term using reviewed annual cost and the explicit reviewed renewal duration."
      : "Reviewed annual cost and an explicit renewal duration are required.",
    sourceFieldIds: renewalTerm && annualAmount !== null ? [...(annualCalculation?.sourceFieldIds ?? []), renewalTerm.id] : [],
    warningCodes: annualAmount !== null && renewalMonths !== null ? ["renewal_term_exposure_estimate"] : ["renewal_term_inputs_incomplete"]
  });

  const terminationFee = acceptedField("early_termination_fees");
  const terminationFeeAmount = numberValue(terminationFee);
  calculations.push({
    calculationType: "termination_cost_exposure",
    calculationVersion: COMMERCIAL_CALCULATION_VERSION,
    status: terminationFeeAmount !== null && currencyCode ? "confirmed" : "insufficient_evidence",
    amount: terminationFeeAmount,
    currency: currencyCode,
    percentage: null,
    dateValue: null,
    explanation: terminationFeeAmount !== null
      ? "Uses the reviewed stated early-termination fee; it does not infer other damages or obligations."
      : "No reviewed numeric early-termination fee is available.",
    sourceFieldIds: terminationFee ? [terminationFee.id] : [],
    warningCodes: terminationFeeAmount === null ? ["termination_fee_not_quantified"] : []
  });

  return calculations;
}

export function generateCommercialFindings(input: {
  fields: ContractExtractedField[];
  calculations: CommercialCalculation[];
  relationships?: ContractDocumentRelationship[];
}): CommercialFinding[] {
  const findings: CommercialFinding[] = [];
  const fields = input.fields;
  const relationships = input.relationships ?? [];
  const acceptedField = (key: string) => effectiveAccepted(fields, key, relationships);
  const autoRenewal = acceptedField("auto_renewal");
  const annual = input.calculations.find((entry) => entry.calculationType === "normalized_annual_cost");
  const days = input.calculations.find((entry) => entry.calculationType === "days_until_last_safe_action");
  const uplift = acceptedField("automatic_price_increase");

  if (booleanValue(autoRenewal) === true) {
    findings.push({
      reasonCode: "automatic_renewal_exposure",
      severity: "high",
      confidence: autoRenewal!.confidence,
      explanation: "The reviewed contract evidence states that the agreement renews automatically.",
      financialImpactMin: annual?.amount ?? null,
      financialImpactMax: annual?.amount ?? null,
      currency: annual?.currency ?? null,
      evidenceFieldIds: [autoRenewal!.id],
      limitations: annual?.status === "confirmed" ? [] : ["Annual exposure is not confirmed."],
      recommendedHumanAction: "Review the notice method and decide whether to renew before the verified deadline.",
      calculationVersion: COMMERCIAL_CALCULATION_VERSION,
      taxonomyVersion: COMMERCIAL_FINDING_TAXONOMY_VERSION
    });
  }

  if (days?.status === "confirmed" && days.amount !== null && days.amount <= 30) {
    findings.push({
      reasonCode: days.amount < 0 ? "notice_deadline_expired" : "notice_deadline_approaching",
      severity: days.amount < 0 ? "critical" : days.amount <= 7 ? "critical" : "high",
      confidence: 1,
      explanation: days.amount < 0
        ? `The reviewed notice deadline passed ${Math.abs(days.amount)} day(s) ago.`
        : `The reviewed notice deadline is ${days.amount} day(s) away.`,
      financialImpactMin: annual?.amount ?? null,
      financialImpactMax: annual?.amount ?? null,
      currency: annual?.currency ?? null,
      evidenceFieldIds: days.sourceFieldIds,
      limitations: ["This is operational deadline analysis, not legal advice."],
      recommendedHumanAction: "Confirm the contractual delivery requirements and take an approved manual action.",
      calculationVersion: COMMERCIAL_CALCULATION_VERSION,
      taxonomyVersion: COMMERCIAL_FINDING_TAXONOMY_VERSION
    });
  }

  if (annual?.status === "confirmed" && (annual.amount ?? 0) >= 100_000) {
    findings.push({
      reasonCode: "high_committed_spend",
      severity: "high",
      confidence: 1,
      explanation: "Reviewed annual committed cost meets the high-spend review threshold.",
      financialImpactMin: annual.amount,
      financialImpactMax: annual.amount,
      currency: annual.currency,
      evidenceFieldIds: annual.sourceFieldIds,
      limitations: ["Threshold-based finding; it does not imply waste or realized savings."],
      recommendedHumanAction: "Validate usage, pricing, and renewal alternatives before approval.",
      calculationVersion: COMMERCIAL_CALCULATION_VERSION,
      taxonomyVersion: COMMERCIAL_FINDING_TAXONOMY_VERSION
    });
  }

  if (booleanValue(uplift) === true) {
    const cap = acceptedField("uplift_cap_percentage");
    findings.push({
      reasonCode: cap ? "automatic_price_uplift" : "uncapped_or_unclear_price_uplift",
      severity: cap ? "medium" : "high",
      confidence: uplift!.confidence,
      explanation: cap
        ? "Reviewed evidence includes an automatic price increase and a stated uplift cap."
        : "Reviewed evidence includes an automatic price increase but no reviewed cap.",
      financialImpactMin: null,
      financialImpactMax: null,
      currency: annual?.currency ?? null,
      evidenceFieldIds: [uplift!.id, ...(cap ? [cap.id] : [])],
      limitations: ["No increase amount is reported unless a reviewed percentage and annual cost exist."],
      recommendedHumanAction: "Confirm the renewal pricing basis and negotiate or cap the uplift where appropriate.",
      calculationVersion: COMMERCIAL_CALCULATION_VERSION,
      taxonomyVersion: COMMERCIAL_FINDING_TAXONOMY_VERSION
    });
  }

  const earlyTerminationFee = acceptedField("early_termination_fees");
  if (numberValue(earlyTerminationFee) !== null) {
    findings.push({
      reasonCode: "early_termination_cost_exposure",
      severity: "high",
      confidence: earlyTerminationFee!.confidence,
      explanation: "Reviewed evidence states a quantified early-termination fee.",
      financialImpactMin: numberValue(earlyTerminationFee),
      financialImpactMax: numberValue(earlyTerminationFee),
      currency: annual?.currency ?? null,
      evidenceFieldIds: [earlyTerminationFee!.id],
      limitations: ["Other termination obligations may exist and are not inferred."],
      recommendedHumanAction: "Review the termination path and validate the stated fee before acting.",
      calculationVersion: COMMERCIAL_CALCULATION_VERSION,
      taxonomyVersion: COMMERCIAL_FINDING_TAXONOMY_VERSION
    });
  }

  const minimumSpend = acceptedField("minimum_spend");
  if (numberValue(minimumSpend) !== null) {
    findings.push({
      reasonCode: "minimum_spend_commitment",
      severity: "medium",
      confidence: minimumSpend!.confidence,
      explanation: "Reviewed evidence states a minimum-spend commitment.",
      financialImpactMin: numberValue(minimumSpend),
      financialImpactMax: numberValue(minimumSpend),
      currency: annual?.currency ?? null,
      evidenceFieldIds: [minimumSpend!.id],
      limitations: ["This does not determine actual usage or avoidable spend."],
      recommendedHumanAction: "Compare committed minimums with approved usage evidence before renewal.",
      calculationVersion: COMMERCIAL_CALCULATION_VERSION,
      taxonomyVersion: COMMERCIAL_FINDING_TAXONOMY_VERSION
    });
  }

  const terminationForConvenience = acceptedField("termination_for_convenience");
  const terminationForCause = acceptedField("termination_for_cause");
  if (!terminationForConvenience && !terminationForCause) {
    findings.push({
      reasonCode: "termination_right_not_confirmed",
      severity: "medium",
      confidence: 1,
      explanation: "No termination right has been confirmed from reviewed evidence.",
      financialImpactMin: null,
      financialImpactMax: null,
      currency: null,
      evidenceFieldIds: [],
      limitations: ["Absence of reviewed evidence does not prove that no termination right exists."],
      recommendedHumanAction: "Review the governing agreement and amendments for termination rights and conditions.",
      calculationVersion: COMMERCIAL_CALCULATION_VERSION,
      taxonomyVersion: COMMERCIAL_FINDING_TAXONOMY_VERSION
    });
  }

  const discountExpiration = acceptedField("discount_expiration");
  const discountExpirationValue = stringValue(discountExpiration);
  if (discountExpiration && dateOrdinal(discountExpirationValue) !== null) {
    findings.push({
      reasonCode: "discount_expiration_exposure",
      severity: "medium",
      confidence: discountExpiration.confidence,
      explanation: `Reviewed discount evidence expires on ${discountExpirationValue}.`,
      financialImpactMin: null,
      financialImpactMax: null,
      currency: annual?.currency ?? null,
      evidenceFieldIds: [discountExpiration.id],
      limitations: ["No financial impact is calculated without reviewed discount economics."],
      recommendedHumanAction: "Confirm post-discount pricing before the renewal decision.",
      calculationVersion: COMMERCIAL_CALCULATION_VERSION,
      taxonomyVersion: COMMERCIAL_FINDING_TAXONOMY_VERSION
    });
  }

  const renewalDate = acceptedField("renewal_date");
  const expirationDate = acceptedField("expiration_date");
  const noticeDeadline = acceptedField("notice_deadline_date");
  const renewalOrdinal = dateOrdinal(stringValue(renewalDate));
  const expirationOrdinal = dateOrdinal(stringValue(expirationDate));
  const noticeOrdinal = dateOrdinal(stringValue(noticeDeadline));
  const inconsistentDateIds = [
    ...(renewalOrdinal !== null && expirationOrdinal !== null && renewalOrdinal < expirationOrdinal ? [renewalDate!.id, expirationDate!.id] : []),
    ...(noticeOrdinal !== null && renewalOrdinal !== null && noticeOrdinal > renewalOrdinal ? [noticeDeadline!.id, renewalDate!.id] : [])
  ];
  if (inconsistentDateIds.length > 0) {
    findings.push({
      reasonCode: "inconsistent_commercial_dates",
      severity: "high",
      confidence: 1,
      explanation: "Reviewed renewal, expiration, or notice dates have an inconsistent chronological relationship.",
      financialImpactMin: null,
      financialImpactMax: null,
      currency: null,
      evidenceFieldIds: [...new Set(inconsistentDateIds)],
      limitations: ["The correct date relationship requires human contract review."],
      recommendedHumanAction: "Compare the cited clauses and correct or reject the inconsistent reviewed values.",
      calculationVersion: COMMERCIAL_CALCULATION_VERSION,
      taxonomyVersion: COMMERCIAL_FINDING_TAXONOMY_VERSION
    });
  }

  for (const conflict of findCommercialFieldConflicts(fields, relationships).filter((entry) => entry.status === "unresolved")) {
    findings.push({
      reasonCode: "contract_document_conflict",
      severity: "high",
      confidence: Math.max(...conflict.candidates.map((candidate) => candidate.confidence)),
      explanation: `Multiple documents contain conflicting values for ${conflict.fieldKey.replaceAll("_", " ")}.`,
      financialImpactMin: null,
      financialImpactMax: null,
      currency: null,
      evidenceFieldIds: conflict.candidates.map((candidate) => candidate.id),
      limitations: ["Document precedence is not sufficiently supported for automatic resolution."],
      recommendedHumanAction: "Review the governing agreement and amendment relationship, then accept one supported value.",
      calculationVersion: COMMERCIAL_CALCULATION_VERSION,
      taxonomyVersion: COMMERCIAL_FINDING_TAXONOMY_VERSION
    });
  }

  if (findings.length === 0 || input.calculations.some((entry) => entry.status === "insufficient_evidence")) {
    findings.push({
      reasonCode: "insufficient_evidence_for_commercial_decision",
      severity: "medium",
      confidence: 1,
      explanation: "One or more commercial calculations are blocked by missing or unreviewed evidence.",
      financialImpactMin: null,
      financialImpactMax: null,
      currency: null,
      evidenceFieldIds: [],
      limitations: ["No unsupported value or saving estimate was generated."],
      recommendedHumanAction: "Review the missing evidence fields before making a commercial decision.",
      calculationVersion: COMMERCIAL_CALCULATION_VERSION,
      taxonomyVersion: COMMERCIAL_FINDING_TAXONOMY_VERSION
    });
  }

  return findings;
}

export function buildCommercialAnalysis(
  fields: ContractExtractedField[],
  now?: Date,
  organizationTimezone?: string | null,
  relationships: ContractDocumentRelationship[] = []
) {
  const calculations = calculateCommercialExposure({ fields, now, organizationTimezone, relationships });
  return {
    calculations,
    findings: generateCommercialFindings({ fields, calculations, relationships }),
    conflicts: findCommercialFieldConflicts(fields, relationships),
    acceptedFieldCount: fields.filter((field) => field.evidence_status === "accepted").length,
    pendingFieldCount: fields.filter((field) => field.evidence_status === "pending_review").length
  };
}

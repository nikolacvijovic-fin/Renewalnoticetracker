import { RENEWAL_DECISION_STATUSES } from "@/lib/constants";
import {
  RENEWAL_MANUAL_TEMPLATE_TYPES,
  type RenewalManualTemplateType
} from "@/lib/contracts/renewal-action-templates";

export const RENEWAL_TEMPLATE_COMPATIBLE_DECISIONS = {
  cancellation_notice: ["terminate"],
  renegotiation_request: ["renegotiate"]
} satisfies Record<RenewalManualTemplateType, readonly string[]>;

export type RenewalManualTemplateGateResult = {
  allowed: boolean;
  templateType: RenewalManualTemplateType;
  renewalDecisionStatus: string | null;
  reasonCode:
    | "template_decision_compatible"
    | "template_decision_missing"
    | "template_decision_incompatible"
    | "template_type_unknown";
  customerSafeMessage: string;
};

function isKnownTemplateType(value: string): value is RenewalManualTemplateType {
  return RENEWAL_MANUAL_TEMPLATE_TYPES.includes(value as RenewalManualTemplateType);
}

function normalizeDecisionStatus(value: string | null | undefined) {
  const normalized = value?.trim() || null;
  return normalized && (RENEWAL_DECISION_STATUSES as readonly string[]).includes(normalized)
    ? normalized
    : null;
}

export function getAllowedRenewalManualTemplateTypes(
  renewalDecisionStatus: string | null | undefined
): RenewalManualTemplateType[] {
  const normalized = normalizeDecisionStatus(renewalDecisionStatus);
  if (!normalized) return [];
  return RENEWAL_MANUAL_TEMPLATE_TYPES.filter((templateType) =>
    RENEWAL_TEMPLATE_COMPATIBLE_DECISIONS[templateType].includes(normalized)
  );
}

export function getPreferredRenewalManualTemplateType(
  renewalDecisionStatus: string | null | undefined
): RenewalManualTemplateType | null {
  return getAllowedRenewalManualTemplateTypes(renewalDecisionStatus)[0] ?? null;
}

export function evaluateRenewalManualTemplateGate(input: {
  templateType: RenewalManualTemplateType | string;
  renewalDecisionStatus: string | null | undefined;
}): RenewalManualTemplateGateResult {
  if (!isKnownTemplateType(input.templateType)) {
    return {
      allowed: false,
      templateType: "cancellation_notice",
      renewalDecisionStatus: normalizeDecisionStatus(input.renewalDecisionStatus),
      reasonCode: "template_type_unknown",
      customerSafeMessage: "Unsupported renewal manual template type."
    };
  }

  const normalizedDecision = normalizeDecisionStatus(input.renewalDecisionStatus);
  if (!normalizedDecision) {
    return {
      allowed: false,
      templateType: input.templateType,
      renewalDecisionStatus: null,
      reasonCode: "template_decision_missing",
      customerSafeMessage: "Record a renewal decision before copying a vendor-facing template."
    };
  }

  const allowed = RENEWAL_TEMPLATE_COMPATIBLE_DECISIONS[input.templateType].includes(normalizedDecision);
  return {
    allowed,
    templateType: input.templateType,
    renewalDecisionStatus: normalizedDecision,
    reasonCode: allowed ? "template_decision_compatible" : "template_decision_incompatible",
    customerSafeMessage: allowed
      ? "Template can be copied manually."
      : input.templateType === "cancellation_notice"
        ? "Cancellation templates require a terminate decision."
        : "Renegotiation templates require a renegotiate decision."
  };
}

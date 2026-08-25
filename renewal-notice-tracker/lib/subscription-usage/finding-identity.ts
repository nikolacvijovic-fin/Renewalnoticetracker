import crypto from "node:crypto";
import type { ReconcileUsageResponse } from "@/lib/add-ons/python-intelligence-client";

type ReconciliationFinding = NonNullable<ReconcileUsageResponse["findings"]>[number];

const OPERATIONAL_WARNING_CODES = new Set([
  "provider_retry_scheduled",
  "provider_retry_exhausted",
  "provider_request_failed"
]);

export function buildStableSubscriptionUsageFindingIdentity(input: {
  organizationId: string;
  finding: ReconciliationFinding;
  analysisScopeId: string;
  snapshotBatchIds: string[];
  providerSet: string[];
  scopeFamilyKey: string;
  syncRunId?: string | null;
  providerConnectionId?: string | null;
}) {
  const finding = input.finding;
  const providers = [...(finding.involved_providers ?? input.providerSet)].sort();
  const products = [...(finding.involved_products ?? [])].map(normalizeBusinessKey).sort();
  const contracts = [...finding.matched_contract_ids].sort();
  const materialWarnings = [...finding.warnings]
    .filter((warning) => !OPERATIONAL_WARNING_CODES.has(warning))
    .sort();
  const logicalOpportunity = {
    organizationId: input.organizationId,
    findingType: finding.finding_type,
    reasonCode: finding.reason_code,
    providers,
    products,
    capabilityCategory: finding.capability_category ?? null,
    matchedContractIds: contracts,
    calculationFamily: finding.calculation_family ?? deriveVersionFamily(finding.calculation_version),
    taxonomyFamily: finding.taxonomy_family ?? deriveVersionFamily(finding.taxonomy_version),
    stableFingerprint: finding.fingerprint_key ?? null
  };
  const materialEvidence = {
    utilization: finding.utilization,
    unusedSeats: finding.unused_seats,
    estimatedSavings: finding.estimated_savings,
    estimatedSavingsMin: finding.estimated_savings_min ?? null,
    estimatedSavingsMax: finding.estimated_savings_max ?? null,
    currency: finding.currency,
    confidence: finding.confidence,
    recommendedAction: finding.recommended_action,
    warnings: materialWarnings,
    matchedContractIds: contracts,
    calculationVersion: finding.calculation_version,
    taxonomyVersion: finding.taxonomy_version ?? null,
    decisionMetrics: sanitizeDecisionMetrics(finding.evidence)
  };
  const provenance = {
    analysisScopeId: input.analysisScopeId,
    snapshotBatchIds: [...input.snapshotBatchIds].sort(),
    sourceRowIds: [...finding.source_row_ids].sort(),
    syncRunId: input.syncRunId ?? null,
    providerConnectionId: input.providerConnectionId ?? null
  };
  const logicalOpportunityKey = stableHash(logicalOpportunity);
  const materialEvidenceHash = stableHash(materialEvidence);
  const provenanceHash = stableHash(provenance);
  return {
    logicalOpportunityKey,
    materialEvidenceHash,
    provenanceHash,
    findingFingerprint: stableHash({ logicalOpportunityKey, materialEvidenceHash }),
    materialWarnings,
    evidence: {
      decisionEvidence: materialEvidence,
      usageEvidence: sanitizeSupportingEvidence(finding.evidence),
      provenance,
      explanation: finding.explanation ?? null,
      recommendedHumanAction: finding.recommended_human_action ?? null
    }
  };
}

export function deriveVersionFamily(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.replace(/(?:[_-]v|@)\d+(?:\.\d+)*(?:[-_][a-z0-9.]+)?$/i, "") || normalized;
}

function sanitizeSupportingEvidence(value: unknown): Record<string, unknown> {
  const metrics = sanitizeDecisionMetrics(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return metrics;
  const deadlines = (value as Record<string, unknown>).contract_deadlines;
  if (!Array.isArray(deadlines)) return metrics;
  return {
    ...metrics,
    contract_deadlines: deadlines.slice(0, 25).flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      if (typeof record.contract_id !== "string") return [];
      return [{
        contract_id: record.contract_id,
        renewal_date: typeof record.renewal_date === "string" ? record.renewal_date : null,
        notice_deadline_date: typeof record.notice_deadline_date === "string" ? record.notice_deadline_date : null
      }];
    })
  };
}

function sanitizeDecisionMetrics(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const allowed = [
    "purchased_seats", "assigned_seats", "active_users_30d", "active_users_90d",
    "annual_reviewed_cost", "currency", "microsoft_utilization", "google_utilization",
    "lower_usage_provider", "renewal_contract_count"
  ];
  return Object.fromEntries(allowed.filter((key) => key in source).map((key) => [key, source[key]]));
}

function normalizeBusinessKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

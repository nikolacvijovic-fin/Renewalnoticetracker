import { describe, expect, it } from "vitest";
import { resolveContractUsageEvidence, type UsageEvidenceCandidate } from "@/lib/evidence-readiness/usage-provenance";
import { hasDateOnlyDeadlinePassed, localDateInTimezone } from "@/lib/evidence-readiness/deadline-timezone";
import {
  classifySubscriptionFindingLifecycle,
  contributesAcceptedEstimatedSavings,
  isReviewedSubscriptionFinding
} from "@/lib/subscription-usage/finding-lifecycle";
import { classifyEvidenceWarning, summarizeEvidenceWarnings } from "@/lib/subscription-usage/warning-classification";

function candidate(overrides: Partial<UsageEvidenceCandidate> = {}): UsageEvidenceCandidate {
  return {
    organizationId: "org-1", contractId: "contract-1", matchId: "match-1", matchConfidence: 0.95,
    matchStatus: "active", matchResolvedAt: null, matchSupersededAt: null,
    usageRowId: "row-1", usageRowOrganizationId: "org-1", batchId: "batch-1",
    batchOrganizationId: "org-1", batchStatus: "completed", provider: "microsoft_365",
    providerConnectionId: "microsoft-connection", syncRunId: "microsoft-run",
    syncRunOrganizationId: "org-1", syncRunStatus: "completed",
    syncCompletedAt: "2026-08-25T09:01:00Z", collectedAt: "2026-08-25T09:00:00Z",
    isSample: false, evidenceState: "verified", validationStatus: "ready",
    purchasedQuantityKnown: true, assignedQuantityKnown: true, warningCodes: [], lineageValid: true, ...overrides
  };
}

describe("evidence accuracy stabilization", () => {
  it("binds Microsoft and Google evidence to the exact matched snapshot", () => {
    const microsoft = resolveContractUsageEvidence({ organizationId: "org-1", contractId: "contract-1", candidates: [candidate()] });
    const google = resolveContractUsageEvidence({ organizationId: "org-1", contractId: "contract-2", candidates: [candidate({
      contractId: "contract-2", matchId: "match-google", usageRowId: "row-google", batchId: "batch-google",
      provider: "google_workspace", providerConnectionId: "google-connection", syncRunId: "google-run"
    })] });
    expect(microsoft).toMatchObject({ state: "verified", provenance: { provider: "microsoft_365", providerConnectionId: "microsoft-connection", batchId: "batch-1", syncRunId: "microsoft-run", usageRowId: "row-1", matchId: "match-1" } });
    expect(google).toMatchObject({ state: "verified", provenance: { provider: "google_workspace", providerConnectionId: "google-connection", syncRunId: "google-run" } });
  });

  it("never borrows an unrelated fresh provider and rejects ambiguity", () => {
    const staleMatched = candidate({ collectedAt: "2025-01-01T00:00:00Z" });
    const unrelated = candidate({ contractId: "contract-other", provider: "google_workspace", providerConnectionId: "fresh-google", collectedAt: "2026-08-25T00:00:00Z" });
    const selected = resolveContractUsageEvidence({ organizationId: "org-1", contractId: "contract-1", candidates: [staleMatched, unrelated] });
    expect(selected).toMatchObject({ state: "verified", provenance: { providerConnectionId: "microsoft-connection", collectedAt: "2025-01-01T00:00:00Z" } });

    const ambiguous = resolveContractUsageEvidence({ organizationId: "org-1", contractId: "contract-1", candidates: [candidate(), candidate({ matchId: "match-2", usageRowId: "row-2" })] });
    expect(ambiguous).toMatchObject({ state: "insufficient", provenance: null });
  });

  it("excludes failed, sample, rejected, historical, and cross-organization evidence", () => {
    for (const rejected of [
      candidate({ syncRunStatus: "failed" }), candidate({ isSample: true }), candidate({ validationStatus: "rejected" }),
      candidate({ matchResolvedAt: "2026-08-25T00:00:00Z" }), candidate({ matchSupersededAt: "2026-08-25T00:00:00Z" }),
      candidate({ usageRowOrganizationId: "org-2" }), candidate({ matchStatus: "resolved" }),
      candidate({ lineageValid: false })
    ]) {
      expect(resolveContractUsageEvidence({ organizationId: "org-1", contractId: "contract-1", candidates: [rejected] }).state).not.toBe("verified");
    }
  });

  it("uses the database lifecycle and accepted-savings semantics", () => {
    expect(classifySubscriptionFindingLifecycle({ reviewStatus: "open" })).toBe("requires_review");
    expect(classifySubscriptionFindingLifecycle({ reviewStatus: "accepted" })).toBe("reviewed_decided");
    expect(classifySubscriptionFindingLifecycle({ reviewStatus: "rejected" })).toBe("reviewed_decided");
    expect(classifySubscriptionFindingLifecycle({ reviewStatus: "deferred" })).toBe("reviewed_deferred");
    expect(classifySubscriptionFindingLifecycle({ reviewStatus: "action_planned" })).toBe("action_in_progress");
    expect(classifySubscriptionFindingLifecycle({ reviewStatus: "accepted", resolvedAt: "2026-08-25" })).toBe("resolved");
    expect(classifySubscriptionFindingLifecycle({ reviewStatus: "accepted", supersededAt: "2026-08-25" })).toBe("superseded");
    expect(isReviewedSubscriptionFinding({ reviewStatus: "rejected" })).toBe(true);
    expect(contributesAcceptedEstimatedSavings({ reviewStatus: "rejected" })).toBe(false);
    expect(contributesAcceptedEstimatedSavings({ reviewStatus: "action_planned" })).toBe(true);
  });

  it("classifies only material warning codes as conflicts", () => {
    expect(classifyEvidenceWarning("possible_overlap_not_proof_of_equivalence")).toBe("caution");
    expect(classifyEvidenceWarning("unmapped_microsoft_sku")).toBe("evidence_partial");
    expect(classifyEvidenceWarning("active_users_exceed_entitlement")).toBe("evidence_conflicting");
    expect(summarizeEvidenceWarnings(["possible_overlap_not_proof_of_equivalence"]).hasConflict).toBe(false);
    expect(summarizeEvidenceWarnings(["active_users_exceed_entitlement"]).hasConflict).toBe(true);
  });

  it("evaluates date-only deadlines in the organization timezone across UTC and DST boundaries", () => {
    const now = new Date("2026-03-29T22:30:00.000Z");
    expect(localDateInTimezone(now, "Europe/Belgrade")).toBe("2026-03-30");
    expect(hasDateOnlyDeadlinePassed({ deadline: "2026-03-29", timezone: "Europe/Belgrade", now })).toBe(true);
    expect(hasDateOnlyDeadlinePassed({ deadline: "2026-03-29", timezone: "America/New_York", now })).toBe(false);
    expect(hasDateOnlyDeadlinePassed({ deadline: "2026-03-29", timezone: "Invalid/Timezone", now })).toBe(null);
  });
});

import { describe, expect, it } from "vitest";
import { calculateActivationScore } from "@/lib/onboarding/activation-score";
import { buildOrganizationActivationState } from "@/lib/onboarding/activation-state";
import { deriveActivationNextBestAction } from "@/lib/onboarding/next-best-action";
import type { TrustExceptionApproval } from "@/lib/contracts/trust-exception-approvals";

const now = new Date("2026-05-25T00:00:00.000Z");

function approval(overrides: Partial<TrustExceptionApproval> = {}): TrustExceptionApproval {
  return {
    id: "approval-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    approved_by_user_id: "reviewer-1",
    approval_type: "low_confidence_evidence",
    approval_reason: "Finance approved weak date evidence.",
    source_field_keys: ["notice_deadline_date"],
    evidence_confidence_at_approval: 0.35,
    expires_at: null,
    revoked_at: null,
    revoked_by_user_id: null,
    revocation_reason: null,
    created_at: "2026-05-24T00:00:00.000Z",
    updated_at: "2026-05-24T00:00:00.000Z",
    ...overrides
  };
}

function contract(overrides: Record<string, unknown> = {}) {
  return {
    id: "contract-1",
    owner_user_id: "owner-1",
    contract_metadata: {
      contract_title: "Acme SaaS",
      renewal_date: "2026-06-30",
      notice_deadline_date: "2026-06-10",
      expiration_date: "2026-06-30",
      auto_renewal: true,
      needs_review: false,
      has_weak_evidence: false,
      accepted_unverified_risk_requested: false,
      field_confidence: {
        renewal_date: 0.9,
        notice_deadline_date: 0.9,
        auto_renewal: 0.9
      }
    },
    reminders: [],
    contract_trust_exception_approvals: [],
    ...overrides
  };
}

describe("organization activation state", () => {
  it("returns an import action for an empty organization", () => {
    const state = buildOrganizationActivationState({
      organizationId: "org-1",
      contracts: [],
      now
    });

    expect(state.currentState).toBe("empty_workspace");
    expect(state.percentComplete).toBe(0);
    expect(state.nextBestAction.id).toBe("import_contracts");
    expect(state.blockingReasons).toEqual(["Import or create the first renewal contract."]);
  });

  it("moves from imported contract to owner action when owner is missing", () => {
    const state = buildOrganizationActivationState({
      organizationId: "org-1",
      contracts: [contract({ owner_user_id: null })],
      now
    });

    expect(state.currentState).toBe("contracts_imported");
    expect(state.nextBestAction.id).toBe("assign_owner");
    expect(state.recommendedContractId).toBe("contract-1");
  });

  it("prioritizes reviewed renewal and notice dates before reminder activation", () => {
    const renewalState = buildOrganizationActivationState({
      organizationId: "org-1",
      contracts: [
        contract({
          contract_metadata: {
            ...contract().contract_metadata,
            renewal_date: null
          }
        })
      ],
      now
    });
    const deadlineState = buildOrganizationActivationState({
      organizationId: "org-1",
      contracts: [
        contract({
          contract_metadata: {
            ...contract().contract_metadata,
            notice_deadline_date: null
          }
        })
      ],
      now
    });

    expect(renewalState.nextBestAction.id).toBe("confirm_renewal_date");
    expect(deadlineState.nextBestAction.id).toBe("confirm_notice_deadline");
  });

  it("routes weak evidence to trust exception approval instead of fake completion", () => {
    const state = buildOrganizationActivationState({
      organizationId: "org-1",
      contracts: [
        contract({
          contract_metadata: {
            ...contract().contract_metadata,
            has_weak_evidence: true,
            accepted_unverified_risk_requested: false,
            field_confidence: {
              renewal_date: 0.4,
              notice_deadline_date: 0.4,
              auto_renewal: 0.4
            }
          }
        })
      ],
      now
    });

    expect(state.currentState).toBe("exception_approval_required");
    expect(state.nextBestAction.id).toBe("request_trust_exception_approval");
    expect(state.percentComplete).toBeLessThan(85);
    expect(state.hasActiveTrustExceptionApproval).toBe(false);
  });

  it("keeps approval-requested weak evidence pending until a durable approval exists", () => {
    const state = buildOrganizationActivationState({
      organizationId: "org-1",
      contracts: [
        contract({
          contract_metadata: {
            ...contract().contract_metadata,
            has_weak_evidence: true,
            accepted_unverified_risk_requested: true,
            field_confidence: {
              renewal_date: 0.4,
              notice_deadline_date: 0.4,
              auto_renewal: 0.4
            }
          }
        })
      ],
      now
    });

    expect(state.currentState).toBe("exception_approval_pending");
    expect(state.nextBestAction.id).toBe("approve_trust_exception");
    expect(state.hasActiveTrustExceptionApproval).toBe(false);
  });

  it("allows weak evidence with active durable approval to reach reminder-ready state", () => {
    const state = buildOrganizationActivationState({
      organizationId: "org-1",
      contracts: [
        contract({
          contract_metadata: {
            ...contract().contract_metadata,
            has_weak_evidence: true,
            accepted_unverified_risk_requested: true,
            field_confidence: {
              renewal_date: 0.4,
              notice_deadline_date: 0.4,
              auto_renewal: 0.4
            }
          },
          contract_trust_exception_approvals: [approval()]
        })
      ],
      now
    });

    expect(state.currentState).toBe("trusted_reminder_ready");
    expect(state.nextBestAction.id).toBe("activate_trusted_reminder");
    expect(state.hasActiveTrustExceptionApproval).toBe(true);
  });

  it("reaches 100 only when a trusted reminder is active and the gate is clear", () => {
    const ready = buildOrganizationActivationState({
      organizationId: "org-1",
      contracts: [contract()],
      now
    });
    const activated = buildOrganizationActivationState({
      organizationId: "org-1",
      contracts: [
        contract({
          reminders: [{ status: "scheduled", remind_at: "2026-06-01T00:00:00.000Z" }]
        })
      ],
      now
    });

    expect(ready.currentState).toBe("trusted_reminder_ready");
    expect(ready.percentComplete).toBeLessThan(100);
    expect(activated.currentState).toBe("activated");
    expect(activated.percentComplete).toBe(100);
    expect(activated.completedSteps).toContain("first_trusted_reminder_active");
  });
});

describe("activation score", () => {
  it("allocates points and applies caps for missing deadline, weak evidence, and missing active reminder", () => {
    expect(
      calculateActivationScore({
        hasContractImported: true,
        ownerAssigned: true,
        renewalDateReviewed: true,
        noticeDeadlineReviewed: false,
        autoRenewTermsReviewed: true,
        evidenceTrusted: true,
        trustedReminderActive: true
      })
    ).toEqual(expect.objectContaining({ score: 69 }));

    expect(
      calculateActivationScore({
        hasContractImported: true,
        ownerAssigned: true,
        renewalDateReviewed: true,
        noticeDeadlineReviewed: true,
        autoRenewTermsReviewed: true,
        evidenceTrusted: true,
        trustedReminderActive: false
      }).score
    ).toBeLessThan(100);
  });
});

describe("activation next-best action", () => {
  it("derives one primary action from actual blockers", () => {
    expect(
      deriveActivationNextBestAction({
        totalContracts: 0,
        recommendedContractId: null,
        contractTitle: null,
        ownerAssigned: false,
        renewalDateReviewed: false,
        noticeDeadlineReviewed: false,
        autoRenewTermsReviewed: false,
        evidenceAttached: false,
        evidenceReviewed: false,
        evidenceTrusted: false,
        trustExceptionApprovalRequested: false,
        hasActiveTrustExceptionApproval: false,
        trustedReminderGateBlocked: true,
        hasActiveTrustedReminder: false,
        daysToNoticeDeadline: null
      }).id
    ).toBe("import_contracts");
  });
});

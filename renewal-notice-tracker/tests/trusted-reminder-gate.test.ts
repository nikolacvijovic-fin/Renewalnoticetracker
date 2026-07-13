import { describe, expect, it } from "vitest";
import { evaluateTrustedReminderGate } from "@/lib/contracts/trusted-reminder-gate";

const baseInput = {
  contractId: "contract-1",
  ownerUserId: "owner-1",
  renewalDate: "2026-06-30",
  noticeDeadline: "2026-06-10",
  autoRenewReviewed: true,
  p0FieldsReviewed: true,
  evidenceConfidence: 0.9,
  leadDays: [90, 60, 30]
};

describe("trusted reminder gate", () => {
  it("allows trusted reminders when owner, P0 truth, evidence, and schedule are aligned", () => {
    const result = evaluateTrustedReminderGate(baseInput);

    expect(result.canActivate).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.auditMetadata).toEqual({
      contractId: "contract-1",
      failureCount: 0,
      evidenceConfidence: 0.9,
      approvedUnverifiedRiskOverride: false,
      unverifiedRiskApprovalRequested: false,
      lowConfidenceAllowedByApprovedOverride: false,
      trustExceptionApprovalId: null,
      approvalType: null,
      approvedByUserId: null,
      approvalReason: null,
      evidenceConfidenceAtApproval: null,
      sourceFieldKeys: [],
      approvalActiveAtEvaluation: false
    });
  });

  it("blocks missing owner, missing reviewed dates, and invalid schedule together", () => {
    const result = evaluateTrustedReminderGate({
      ...baseInput,
      ownerUserId: null,
      renewalDate: null,
      noticeDeadline: null,
      autoRenewReviewed: false,
      p0FieldsReviewed: false,
      leadDays: []
    });

    expect(result.canActivate).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toEqual(
      expect.arrayContaining([
        "missing_owner",
        "missing_renewal_date",
        "missing_notice_deadline",
        "auto_renew_unreviewed",
        "p0_unreviewed",
        "invalid_schedule"
      ])
    );
  });

  it("does not let a requested unverified-risk override bypass low-confidence evidence", () => {
    const result = evaluateTrustedReminderGate({
      ...baseInput,
      evidenceConfidence: 0.4,
      unverifiedRiskApprovalRequested: true
    });

    expect(result.canActivate).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toContain(
      "unverified_risk_approval_pending"
    );
    expect(result.auditMetadata).toEqual(
      expect.objectContaining({
        approvedUnverifiedRiskOverride: false,
        unverifiedRiskApprovalRequested: true
      })
    );
  });

  it("requires high-confidence evidence unless a durable active approval has approved the risk", () => {
    expect(
      evaluateTrustedReminderGate({
        ...baseInput,
        evidenceConfidence: 0.4
      }).failures.map((failure) => failure.code)
    ).toContain("low_confidence");

    const accepted = evaluateTrustedReminderGate({
      ...baseInput,
      evidenceConfidence: 0.4,
      trustExceptionApproval: {
        id: "approval-1",
        approvalType: "low_confidence_evidence",
        approvedByUserId: "reviewer-1",
        approvalReason: "Finance reviewer accepted weak notice evidence.",
        evidenceConfidenceAtApproval: 0.4,
        sourceFieldKeys: ["notice_deadline_date"],
        activeAtEvaluation: true
      }
    });

    expect(accepted.canActivate).toBe(true);
    expect(accepted.auditMetadata.approvedUnverifiedRiskOverride).toBe(true);
    expect(accepted.auditMetadata.evidenceConfidence).toBe(0.4);
    expect(accepted.auditMetadata.lowConfidenceAllowedByApprovedOverride).toBe(true);
    expect(accepted.auditMetadata).toEqual(
      expect.objectContaining({
        trustExceptionApprovalId: "approval-1",
        approvalType: "low_confidence_evidence",
        approvedByUserId: "reviewer-1",
        approvalReason: "Finance reviewer accepted weak notice evidence.",
        evidenceConfidenceAtApproval: 0.4,
        sourceFieldKeys: ["notice_deadline_date"],
        approvalActiveAtEvaluation: true
      })
    );
  });

  it("does not let inactive approval evidence bypass low-confidence evidence", () => {
    const result = evaluateTrustedReminderGate({
      ...baseInput,
      evidenceConfidence: 0.4,
      trustExceptionApproval: {
        id: "approval-revoked",
        approvalType: "low_confidence_evidence",
        approvedByUserId: "reviewer-1",
        approvalReason: "Was approved, now revoked.",
        evidenceConfidenceAtApproval: 0.4,
        sourceFieldKeys: ["notice_deadline_date"],
        activeAtEvaluation: false
      }
    });

    expect(result.canActivate).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toContain("low_confidence");
    expect(result.auditMetadata.trustExceptionApprovalId).toBeNull();
  });
});

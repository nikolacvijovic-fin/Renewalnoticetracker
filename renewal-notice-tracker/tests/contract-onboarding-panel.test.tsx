import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContractOnboardingPanel } from "@/components/contracts/contract-onboarding-panel";
import type { ContractDetailTrustExceptionApprovalState } from "@/lib/contracts/contract-detail-view";
import type { RenewalReadinessScore } from "@/lib/contracts/readiness-score";
import type { TrustedReminderGateResult } from "@/lib/contracts/trusted-reminder-gate";

const readinessScore: RenewalReadinessScore = {
  score: 65,
  label: "needs_review",
  components: [],
  blockers: ["Evidence confidence is below trusted threshold."],
  nextAction: "Resolve low-confidence extracted evidence before trusting the clock."
};

const approvalState: ContractDetailTrustExceptionApprovalState = {
  status: "requested",
  approval: null,
  legacyApproval: null,
  label: "Approval requested, not yet approved",
  help: "Trusted reminders stay blocked until a durable approval record is granted or evidence improves."
};

const gate: TrustedReminderGateResult = {
  canActivate: false,
  failures: [
    {
      code: "unverified_risk_approval_pending",
      message: "Unverified risk acceptance has been requested but not approved.",
      remediation: "Approve the unverified-risk override after human review, or resolve the evidence."
    }
  ],
  auditMetadata: {
    contractId: "contract-1",
    failureCount: 1,
    evidenceConfidence: 0.4,
    approvedUnverifiedRiskOverride: false,
    unverifiedRiskApprovalRequested: true,
    lowConfidenceAllowedByApprovedOverride: false,
    trustExceptionApprovalId: null,
    approvalType: null,
    approvedByUserId: null,
    approvalReason: null,
    evidenceConfidenceAtApproval: null,
    sourceFieldKeys: [],
    approvalActiveAtEvaluation: false
  }
};

describe("ContractOnboardingPanel", () => {
  it("shows the contract-level blocker and next fix without duplicating business rules", () => {
    render(
      <ContractOnboardingPanel
        contractId="contract-1"
        readinessScore={readinessScore}
        trustedReminderGate={gate}
        approvalState={approvalState}
      />
    );

    expect(screen.getByText("This contract is not activation-ready yet")).toBeInTheDocument();
    expect(screen.getByText("Unverified risk acceptance has been requested but not approved.")).toBeInTheDocument();
    expect(screen.getByText("Approval requested, not yet approved")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
  });
});

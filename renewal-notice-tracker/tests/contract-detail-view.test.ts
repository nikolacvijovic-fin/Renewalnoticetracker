import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationMember } from "@/lib/contracts/kernel-queries";
let contractDetailView: typeof import("@/lib/contracts/contract-detail-view");
const {
  getPhase1TrustState,
  getPhase1ReviewMode,
  listPhase1ActiveReviewDirtyFlags,
  buildRiskQueueRow,
  getIntelligenceSurfaceAccessMap
} = vi.hoisted(() => ({
  getPhase1TrustState: vi.fn(),
  getPhase1ReviewMode: vi.fn(),
  listPhase1ActiveReviewDirtyFlags: vi.fn(),
  buildRiskQueueRow: vi.fn(),
  getIntelligenceSurfaceAccessMap: vi.fn()
}));

vi.mock("@/lib/contracts/phase1-pilot", async () => {
  const actual = await vi.importActual<typeof import("@/lib/contracts/phase1-pilot")>(
    "@/lib/contracts/phase1-pilot"
  );

  return {
    ...actual,
    getPhase1TrustState,
    getPhase1ReviewMode,
    listPhase1ActiveReviewDirtyFlags
  };
});

vi.mock("@/lib/intelligence/risk/dashboard", () => ({
  buildRiskQueueRow
}));

vi.mock("@/lib/intelligence/access", () => ({
  getIntelligenceSurfaceAccessMap
}));

vi.mock("@/lib/utils", () => ({
  formatDate: () => "May 25, 2026"
}));

beforeAll(async () => {
  contractDetailView = await import("@/lib/contracts/contract-detail-view");
});

function makeMembers(): OrganizationMember[] {
  return [
    {
      user_id: "owner-1",
      role: "owner",
      user: {
        id: "owner-1",
        full_name: "Owner One",
        notification_email: "owner@example.com"
      }
    }
  ];
}

function makeContract(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "contract-1",
    updated_at: "2026-05-25T00:00:00.000Z",
    owner_user_id: "owner-1",
    owner_name: "Owner One",
    department: "Legal",
    status_tag: "active",
    renewal_decision_status: "undecided",
    renewal_decision_date: null,
    cycle_status: "open",
    counterparty_id: "counterparty-1",
    last_acknowledged_at: null,
    contract_files: [
      {
        id: "file-1",
        uploaded_at: "2026-05-24T00:00:00.000Z",
        extraction_source: "ocr"
      }
    ],
    contract_metadata: {
      id: "metadata-1",
      contract_title: "MSA",
      counterparty_name: "Acme",
      needs_review: false,
      notice_deadline_date: "2026-06-10",
      renewal_date: "2026-06-30",
      expiration_date: "2026-07-01",
      termination_window: "30 days",
      auto_renewal: true,
      field_confidence: {},
      field_source_snippets: {},
      has_weak_evidence: true,
      accepted_unverified_risk_requested: false,
      contract_value_amount: 100000,
      price_change_trigger: "price uplift"
    },
    reminders: [
      {
        remind_at: "2026-06-20T00:00:00.000Z",
        reminder_type: "renewal",
        status: "pending",
        source: "system"
      },
      {
        remind_at: "2026-06-01T00:00:00.000Z",
        reminder_type: "notice_deadline",
        status: "superseded",
        source: "system"
      },
      {
        remind_at: "2026-05-30T00:00:00.000Z",
        reminder_type: "decision_request",
        status: "retry_pending",
        source: "system"
      }
    ],
    notes: [],
    audit_logs: [],
    renewal_decisions: [],
    extracted_field_evidence: [],
    processing_errors: [],
    ...overrides
  };
}

function makeTrustExceptionApproval(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "approval-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    approved_by_user_id: "reviewer-1",
    approval_type: "manual_without_evidence",
    approval_reason: "Manual review accepted weak evidence risk.",
    source_field_keys: ["notice_deadline_date"],
    evidence_confidence_at_approval: 0,
    expires_at: null,
    revoked_at: null,
    revoked_by_user_id: null,
    revocation_reason: null,
    created_at: "2026-05-25T00:00:00.000Z",
    updated_at: "2026-05-25T00:00:00.000Z",
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getPhase1TrustState.mockReturnValue("Decision Needed");
  getPhase1ReviewMode.mockReturnValue("exception_review");
  listPhase1ActiveReviewDirtyFlags.mockReturnValue(["has_weak_evidence"]);
  buildRiskQueueRow.mockReturnValue({
    riskBand: "high",
    confidenceLevel: "low",
    explanationMetadata: {
      calculation_version: "risk_score.v1",
      input_data_version: "trusted_workflow_state.v1"
    }
  });
  getIntelligenceSurfaceAccessMap.mockResolvedValue({
    billingSnapshot: {
      organizationId: "org-1",
      planTier: "growth",
      subscriptionStatus: "active",
      billingProvider: "paddle"
    },
    accessBySurface: {
      risk_badge: { allowed: true },
      risk_explanation: { allowed: true }
    }
  });
});

describe("contract detail view helpers", () => {
  it("normalizes metadata and defaults missing fields safely", () => {
    const metadata = contractDetailView.normalizeContractDetailMetadata({
      contract_title: "MSA",
      field_confidence: null,
      field_source_snippets: null
    });

    expect(metadata.contract_title).toBe("MSA");
    expect(metadata.counterparty_name).toBeNull();
    expect(metadata.field_confidence).toEqual({});
    expect(metadata.field_source_snippets).toEqual({});
    expect(metadata.has_weak_evidence).toBe(false);
  });

  it("derives owner labels with safe unassigned fallback", () => {
    expect(contractDetailView.getContractDetailOwnerLabel("owner-1", makeMembers())).toBe("Owner One");
    expect(contractDetailView.getContractDetailOwnerLabel(null, makeMembers())).toBe("Unassigned");
  });

  it("selects the next active reminder and ignores superseded or cancelled rows", () => {
    const nextReminder = contractDetailView.getContractDetailNextReminder(
      makeContract().reminders as Array<{
        remind_at: string;
        reminder_type: string;
        status: string;
        source: string;
      }>
    );

    expect(nextReminder?.reminder_type).toBe("decision_request");
    expect(nextReminder?.status).toBe("retry_pending");
  });

  it.each([
    [
      "review blocked",
      {
        trustState: "Needs Review",
        reviewBlocked: true,
        ownerBlocked: false,
        cycleStatus: "open",
        renewalDecisionStatus: "undecided"
      },
      "Complete P0 review"
    ],
    [
      "owner blocked",
      {
        trustState: "Owner Missing",
        reviewBlocked: false,
        ownerBlocked: true,
        cycleStatus: "open",
        renewalDecisionStatus: "undecided"
      },
      "Assign the accountable owner"
    ],
    [
      "decision needed",
      {
        trustState: "Decision Needed",
        reviewBlocked: false,
        ownerBlocked: false,
        cycleStatus: "open",
        renewalDecisionStatus: "undecided"
      },
      "Record the renewal decision"
    ],
    [
      "awaiting acknowledgment",
      {
        trustState: "Awaiting Acknowledgment",
        reviewBlocked: false,
        ownerBlocked: false,
        cycleStatus: "awaiting_acknowledgment",
        renewalDecisionStatus: "renew"
      },
      "Record acknowledgment"
    ]
  ])("derives the next workflow action for %s", (_label, input, expected) => {
    expect(contractDetailView.deriveContractDetailNextAction(input).label).toBe(expected);
  });

  it("maps reminder activation states into user-facing blocked reasons", () => {
    expect(contractDetailView.getContractDetailReminderBlockedReason("blocked_by_review")).toBe(
      "blocked_by_review"
    );
    expect(contractDetailView.getContractDetailReminderBlockedReason("blocked_by_missing_owner")).toBe(
      "blocked_by_missing_owner"
    );
    expect(contractDetailView.getContractDetailReminderBlockedReason("scheduled")).toBeNull();
  });

  it("does not treat missing evidence confidence as fully trusted", () => {
    const metadata = contractDetailView.normalizeContractDetailMetadata({
      contract_title: "Manual MSA",
      needs_review: false,
      field_confidence: {},
      field_source_snippets: {}
    });

    expect(contractDetailView.getContractDetailEvidenceConfidence(metadata)).toBe(0.5);
  });

  it("keeps manual-without-evidence metadata low confidence unless risk is approved", () => {
    const manualMetadata = contractDetailView.normalizeContractDetailMetadata({
      contract_title: "Manual MSA",
      needs_review: false,
      is_manual_without_evidence: true,
      field_confidence: {},
      field_source_snippets: {}
    });
    const approvedMetadata = contractDetailView.normalizeContractDetailMetadata({
      ...manualMetadata,
      accepted_unverified_risk_requested: true,
      accepted_unverified_risk_approved_at: "2026-05-25T00:00:00.000Z",
      accepted_unverified_risk_approved_by: "reviewer-1"
    });

    expect(contractDetailView.hasApprovedUnverifiedRiskOverride(manualMetadata)).toBe(false);
    expect(contractDetailView.getContractDetailEvidenceConfidence(manualMetadata)).toBe(0);
    expect(contractDetailView.hasApprovedUnverifiedRiskOverride(approvedMetadata)).toBe(true);
    expect(contractDetailView.getContractDetailEvidenceConfidence(approvedMetadata)).toBe(0);
  });
});

describe("buildContractDetailViewModel", () => {
  it("moves contract workflow, reminder, intelligence, and risk composition into a shared view model", async () => {
    const viewModel = await contractDetailView.buildContractDetailViewModel({
      context: {
        user: { id: "reviewer-1" },
        organizationId: "org-1",
        role: "reviewer"
      } as never,
      contract: makeContract() as never,
      members: makeMembers(),
      trustExceptionApproval: null,
      counterparties: [
        {
          id: "counterparty-1",
          name: "Acme",
          raw_counterparty_name: "Acme",
          normalized_counterparty_name: "acme",
          contract_count: 2,
          alias_names: [],
          duplicate_suggestions: [{ id: "dupe-1", raw_counterparty_name: "Acme Inc.", score: 0.9 }]
        }
      ]
    });

    expect(viewModel.title).toBe("MSA");
    expect(viewModel.counterpartyName).toBe("Acme");
    expect(viewModel.ownerLabel).toBe("Owner One");
    expect(viewModel.ocrAssisted).toBe(true);
    expect(viewModel.reviewBlocked).toBe(false);
    expect(viewModel.ownerBlocked).toBe(false);
    expect(viewModel.reviewMode).toBe("exception_review");
    expect(viewModel.dirtyReviewFlags).toEqual(["has_weak_evidence"]);
    expect(viewModel.nextReminder?.reminder_type).toBe("decision_request");
    expect(viewModel.reminderBlockedReason).toBeNull();
    expect(viewModel.nextAction.label).toBe("Record the renewal decision");
    expect(viewModel.workflowItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Trust state", value: "Decision Needed" }),
        expect.objectContaining({ label: "Owner", value: "Owner One" }),
        expect.objectContaining({ label: "Due", value: "decision request | May 25, 2026" }),
        expect.objectContaining({ label: "Decision", value: "undecided" })
      ])
    );
    expect(viewModel.ownerReadiness).toEqual(
      expect.objectContaining({
        ownerStatus: "Owner One",
        reminderStatus: "Trusted schedule active"
      })
    );
    expect(viewModel.readinessScore).toEqual(
      expect.objectContaining({
        score: 65,
        label: "needs_review",
        nextAction: "Resolve low-confidence extracted evidence before trusting the clock."
      })
    );
    expect(viewModel.trustedReminderGate).toEqual(
      expect.objectContaining({
        canActivate: false
      })
    );
    expect(viewModel.trustedReminderGate.failures.map((failure) => failure.code)).toContain(
      "low_confidence"
    );
    expect(viewModel.decisionLoop).toEqual(
      expect.objectContaining({
        stage: "decision_needed",
        nextAction: "Record the renewal decision."
      })
    );
    expect(viewModel.memberLabels).toEqual([
      { user_id: "owner-1", label: "Owner One" }
    ]);
    expect(viewModel.actorLabels).toEqual({ "owner-1": "Owner One" });
    expect(viewModel.riskExplanation).toEqual(
      expect.objectContaining({
        riskBand: "high",
        confidenceLevel: "low"
      })
    );
    expect(getIntelligenceSurfaceAccessMap).toHaveBeenCalledWith({
      context: expect.objectContaining({
        organizationId: "org-1",
        role: "reviewer"
      }),
      surfaces: ["risk_badge", "risk_explanation"],
      contractOwnerUserId: "owner-1"
    });
    expect(buildRiskQueueRow).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerLabel: "Owner One",
        workflowTrustState: "Decision Needed",
        duplicateCounterpartyUncertainty: true,
        reminderDeliveryFailures: 1
      })
    );
  });

  it("does not let requested unverified-risk acceptance bypass the trusted gate", async () => {
    const viewModel = await contractDetailView.buildContractDetailViewModel({
      context: {
        user: { id: "reviewer-1" },
        organizationId: "org-1",
        role: "reviewer"
      } as never,
      contract: makeContract({
        contract_metadata: {
          ...makeContract().contract_metadata,
          has_weak_evidence: true,
          accepted_unverified_risk_requested: true
        }
      }) as never,
      members: makeMembers(),
      trustExceptionApproval: null,
      counterparties: []
    });

    expect(viewModel.trustedReminderGate.canActivate).toBe(false);
    expect(viewModel.trustedReminderGate.failures.map((failure) => failure.code)).toContain(
      "unverified_risk_approval_pending"
    );
    expect(viewModel.trustedReminderGate.auditMetadata).toEqual(
      expect.objectContaining({
        approvedUnverifiedRiskOverride: false,
        unverifiedRiskApprovalRequested: true
      })
    );
    expect(viewModel.trustExceptionApprovalState.status).toBe("requested");
    expect(viewModel.readinessScore.label).toBe("needs_review");
  });

  it("does not let legacy approved metadata unlock trusted reminders without a durable approval", async () => {
    const viewModel = await contractDetailView.buildContractDetailViewModel({
      context: {
        user: { id: "reviewer-1" },
        organizationId: "org-1",
        role: "reviewer"
      } as never,
      contract: makeContract({
        contract_metadata: {
          ...makeContract().contract_metadata,
          has_weak_evidence: true,
          accepted_unverified_risk_requested: true,
          accepted_unverified_risk_approved_at: "2026-05-25T00:00:00.000Z",
          accepted_unverified_risk_approved_by: "reviewer-1",
          accepted_unverified_risk_approval_reason: "Legacy approval marker."
        }
      }) as never,
      members: makeMembers(),
      trustExceptionApproval: null,
      counterparties: []
    });

    expect(viewModel.trustedReminderGate.canActivate).toBe(false);
    expect(viewModel.trustedReminderGate.auditMetadata.approvedUnverifiedRiskOverride).toBe(false);
    expect(viewModel.trustedReminderGate.failures.map((failure) => failure.code)).toContain(
      "unverified_risk_approval_pending"
    );
    expect(viewModel.trustExceptionApprovalState.status).toBe("requested");
    expect(viewModel.trustExceptionApprovalState.legacyApproval).toEqual(
      expect.objectContaining({
        approvedBy: "reviewer-1",
        approvalReason: "Legacy approval marker."
      })
    );
  });

  it("allows low-confidence evidence only when an approved unverified-risk override is recorded", async () => {
    const viewModel = await contractDetailView.buildContractDetailViewModel({
      context: {
        user: { id: "reviewer-1" },
        organizationId: "org-1",
        role: "reviewer"
      } as never,
      contract: makeContract({
        renewal_decision_status: "renew",
        contract_metadata: {
          ...makeContract().contract_metadata,
          has_weak_evidence: true,
          accepted_unverified_risk_requested: true
        }
      }) as never,
      members: makeMembers(),
      trustExceptionApproval: makeTrustExceptionApproval() as never,
      counterparties: []
    });

    expect(viewModel.trustedReminderGate.canActivate).toBe(true);
    expect(viewModel.trustedReminderGate.failures).toEqual([]);
    expect(viewModel.trustedReminderGate.auditMetadata.approvedUnverifiedRiskOverride).toBe(true);
    expect(viewModel.trustedReminderGate.auditMetadata.trustExceptionApprovalId).toBe("approval-1");
    expect(viewModel.trustedReminderGate.auditMetadata.approvalType).toBe("manual_without_evidence");
    expect(viewModel.trustedReminderGate.auditMetadata.approvedByUserId).toBe("reviewer-1");
    expect(viewModel.trustedReminderGate.auditMetadata.approvalReason).toBe(
      "Manual review accepted weak evidence risk."
    );
    expect(viewModel.trustedReminderGate.auditMetadata.evidenceConfidenceAtApproval).toBe(0);
    expect(viewModel.trustedReminderGate.auditMetadata.sourceFieldKeys).toEqual([
      "notice_deadline_date"
    ]);
    expect(viewModel.trustedReminderGate.auditMetadata.evidenceConfidence).toBe(0);
    expect(
      viewModel.trustedReminderGate.auditMetadata.lowConfidenceAllowedByApprovedOverride
    ).toBe(true);
    expect(viewModel.readinessScore.components.find((component) => component.key === "evidence")).toEqual(
      expect.objectContaining({
        passed: true,
        exception: "Low-confidence evidence accepted by approved human trust exception."
      })
    );
    expect(viewModel.trustExceptionApprovalState.status).toBe("active");
    expect(viewModel.trustExceptionApprovalState.approval?.id).toBe("approval-1");
    expect(viewModel.readinessScore.label).toBe("ready");
  });

  it("surfaces revoked and expired approvals without unlocking trusted reminders", async () => {
    for (const approval of [
      makeTrustExceptionApproval({
        id: "revoked-approval",
        revoked_at: "2026-05-26T00:00:00.000Z",
        revoked_by_user_id: "reviewer-1",
        revocation_reason: "Evidence changed."
      }),
      makeTrustExceptionApproval({
        id: "expired-approval",
        expires_at: "2026-05-24T00:00:00.000Z"
      })
    ]) {
      const viewModel = await contractDetailView.buildContractDetailViewModel({
        context: {
          user: { id: "reviewer-1" },
          organizationId: "org-1",
          role: "reviewer"
        } as never,
        contract: makeContract({
          contract_trust_exception_approvals: [approval],
          contract_metadata: {
            ...makeContract().contract_metadata,
            has_weak_evidence: true
          }
        }) as never,
        members: makeMembers(),
        counterparties: []
      });

      expect(viewModel.trustedReminderGate.canActivate).toBe(false);
      expect(viewModel.trustedReminderGate.auditMetadata.trustExceptionApprovalId).toBeNull();
      expect(["revoked", "expired"]).toContain(viewModel.trustExceptionApprovalState.status);
    }
  });

  it("surfaces blocked reminder readiness when review or owner state is missing", async () => {
    const viewModel = await contractDetailView.buildContractDetailViewModel({
      context: {
        user: { id: "owner-1" },
        organizationId: "org-1",
        role: "owner"
      } as never,
      contract: makeContract({
        owner_user_id: null,
        contract_metadata: {
          ...makeContract().contract_metadata,
          needs_review: true
        }
      }) as never,
      members: makeMembers(),
      trustExceptionApproval: null,
      counterparties: []
    });

    expect(viewModel.reviewBlocked).toBe(true);
    expect(viewModel.ownerBlocked).toBe(true);
    expect(viewModel.reminderBlockedReason).toBe("blocked_by_review");
    expect(viewModel.nextAction.label).toBe("Complete P0 review");
    expect(viewModel.ownerReadiness.reminderStatus).toBe("Blocked by review");
    expect(viewModel.readinessScore.label).toBe("not_ready");
    expect(viewModel.trustedReminderGate.failures.map((failure) => failure.code)).toEqual(
      expect.arrayContaining(["missing_owner", "p0_unreviewed"])
    );
    expect(viewModel.decisionLoop.stage).toBe("review_needed");
  });
});

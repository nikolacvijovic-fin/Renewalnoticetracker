import { describe, expect, it } from "vitest";
import {
  deriveCycleStatusFromDecision,
  getPhase1QueueAssignments,
  getPhase1ReviewDirtyFlags,
  getPhase1ReviewMode,
  getPhase1TrustState
} from "@/lib/contracts/phase1-pilot";

describe("phase1 pilot workflow policy", () => {
  it("uses exception review for weak P0 evidence", () => {
    expect(
      getPhase1ReviewMode({
        needs_review: true,
        notice_deadline_date: "2030-01-01",
        field_confidence: { notice_deadline_date: 0.4 },
        field_source_snippets: {}
      })
    ).toBe("exception_review");
  });

  it.each([
    ["has_conflict", { has_conflict: true }],
    ["has_derived_date", { has_derived_date: true }],
    ["is_ocr_assisted", { is_ocr_assisted: true }],
    ["is_manual_without_evidence", { is_manual_without_evidence: true }],
    ["changes_previously_verified_p0", { changes_previously_verified_p0: true }],
    ["accepted_unverified_risk_requested", { accepted_unverified_risk_requested: true }]
  ])("forces Exception Review when %s is present", (_label, dirtyMetadata) => {
    expect(
      getPhase1ReviewMode({
        needs_review: false,
        notice_deadline_date: "2030-01-01",
        field_confidence: { notice_deadline_date: 0.95 },
        field_source_snippets: { notice_deadline_date: "30 days before expiration" },
        ...dirtyMetadata
      })
    ).toBe("exception_review");
  });

  it("derives weak evidence as an explicit dirty flag", () => {
    expect(
      getPhase1ReviewDirtyFlags({
        needs_review: false,
        notice_deadline_date: "2030-01-01",
        field_confidence: { notice_deadline_date: 0.5 },
        field_source_snippets: {}
      }).has_weak_evidence
    ).toBe(true);
  });

  it("surfaces owner missing as a trust blocker before reminders can be trusted", () => {
    expect(
      getPhase1TrustState({
        owner_user_id: null,
        renewal_decision_status: "undecided",
        contract_metadata: {
          needs_review: false,
          notice_deadline_date: "2030-01-10"
        }
      })
    ).toBe("Owner Missing");
  });

  it("assigns decision-needed contracts to the weekly operator queue", () => {
    const queues = getPhase1QueueAssignments(
      {
        owner_user_id: "owner-1",
        renewal_decision_status: "undecided",
        contract_metadata: {
          needs_review: false,
          notice_deadline_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        }
      },
      new Date()
    );

    expect(queues).toContain("Decision Needed");
    expect(queues).toContain("Due Soon");
  });

  it("treats acknowledged contracts with no decision as decision-needed workflow", () => {
    expect(
      getPhase1TrustState({
        owner_user_id: "owner-1",
        renewal_decision_status: "undecided",
        cycle_status: "awaiting_decision",
        contract_metadata: {
          needs_review: false,
          notice_deadline_date: null
        }
      })
    ).toBe("Decision Needed");
  });

  it("derives workflow-only cycle status from decision truth", () => {
    expect(deriveCycleStatusFromDecision("renew", "open")).toBe("closed");
    expect(deriveCycleStatusFromDecision("defer", "open")).toBe("parked");
    expect(deriveCycleStatusFromDecision("undecided", "awaiting_acknowledgment")).toBe(
      "awaiting_acknowledgment"
    );
  });
});

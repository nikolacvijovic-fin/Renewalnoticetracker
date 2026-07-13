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
      humanReviewOverride: false
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

  it("requires high-confidence evidence unless human review explicitly accepts the risk", () => {
    expect(
      evaluateTrustedReminderGate({
        ...baseInput,
        evidenceConfidence: 0.4
      }).failures.map((failure) => failure.code)
    ).toContain("low_confidence");

    const accepted = evaluateTrustedReminderGate({
      ...baseInput,
      evidenceConfidence: 0.4,
      humanReviewOverride: true
    });

    expect(accepted.canActivate).toBe(true);
    expect(accepted.auditMetadata.humanReviewOverride).toBe(true);
  });
});

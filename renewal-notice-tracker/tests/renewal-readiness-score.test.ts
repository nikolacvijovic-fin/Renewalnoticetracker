import { describe, expect, it } from "vitest";
import {
  calculateRenewalReadiness,
  getDaysUntilDate
} from "@/lib/contracts/readiness-score";

describe("renewal readiness score", () => {
  it("scores a fully reviewed renewal loop as ready", () => {
    const score = calculateRenewalReadiness({
      ownerAssigned: true,
      renewalDateReviewed: true,
      noticeDeadlineReviewed: true,
      autoRenewReviewed: true,
      evidenceConfidence: 0.94,
      trustedReminderActive: true,
      decisionRecorded: true,
      daysToNotice: 45
    });

    expect(score.score).toBe(100);
    expect(score.label).toBe("ready");
    expect(score.blockers).toEqual([]);
    expect(score.nextAction).toBe("Keep the renewal decision history current.");
  });

  it("keeps low-confidence and unreviewed opt-out truth from looking launch-ready", () => {
    const score = calculateRenewalReadiness({
      ownerAssigned: true,
      renewalDateReviewed: true,
      noticeDeadlineReviewed: false,
      autoRenewReviewed: false,
      evidenceConfidence: 0.55,
      trustedReminderActive: false,
      decisionRecorded: false,
      daysToNotice: 12
    });

    expect(score.score).toBe(20);
    expect(score.label).toBe("not_ready");
    expect(score.blockers).toEqual(
      expect.arrayContaining([
        "Review and confirm the notice deadline.",
        "Resolve low-confidence extracted evidence before trusting the clock.",
        "Activate the trusted reminder schedule."
      ])
    );
  });

  it("caps readiness when the trusted reminder gate is blocked", () => {
    const score = calculateRenewalReadiness({
      ownerAssigned: true,
      renewalDateReviewed: true,
      noticeDeadlineReviewed: true,
      autoRenewReviewed: true,
      evidenceConfidence: 0.98,
      trustedReminderActive: true,
      trustedReminderGateBlocked: true,
      decisionRecorded: true,
      daysToNotice: 45
    });

    expect(score.score).toBe(69);
    expect(score.label).toBe("needs_review");
    expect(score.blockers).toContain("Trusted reminder gate is blocked.");
  });

  it("treats approved unverified-risk override as evidence trust without removing the gate check", () => {
    const score = calculateRenewalReadiness({
      ownerAssigned: true,
      renewalDateReviewed: true,
      noticeDeadlineReviewed: true,
      autoRenewReviewed: true,
      evidenceConfidence: 0.3,
      approvedUnverifiedRiskOverride: true,
      trustedReminderActive: true,
      decisionRecorded: false,
      daysToNotice: 45
    });

    expect(score.components.find((component) => component.key === "evidence")).toEqual(
      expect.objectContaining({
        label: "Evidence or approved override",
        passed: true,
        points: 15,
        exception: "Low-confidence evidence accepted by approved human trust exception."
      })
    );
    expect(score.blockers).not.toContain(
      "Resolve low-confidence extracted evidence before trusting the clock."
    );
  });

  it("derives days until a renewal-control date deterministically", () => {
    expect(getDaysUntilDate("2026-06-10", new Date("2026-06-01T00:00:00.000Z"))).toBe(9);
    expect(getDaysUntilDate(null, new Date("2026-06-01T00:00:00.000Z"))).toBeNull();
    expect(getDaysUntilDate("not-a-date", new Date("2026-06-01T00:00:00.000Z"))).toBeNull();
  });
});

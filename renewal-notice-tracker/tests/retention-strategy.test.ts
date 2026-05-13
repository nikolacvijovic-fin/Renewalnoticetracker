import { describe, expect, it } from "vitest";
import { getAccountHealthSummary } from "@/lib/commercial/retention";
import {
  antiChurnReportingViews,
  churnRiskScoringRules,
  cohortDashboards,
  leadingChurnIndicators,
  monthlyRetentionMetrics,
  retentionDefinitions,
  weeklyRetentionMetrics,
  workflowRetentionMetrics
} from "@/lib/commercial/retention-analytics";

describe("retention strategy helpers", () => {
  it("marks strong workflow adoption as healthy", () => {
    const health = getAccountHealthSummary({
      totalContracts: 16,
      needsReview: 1,
      renewalsDueSoon: 3,
      noticeDeadlinesDueSoon: 2,
      reviewedContracts: 15,
      ownerAssignedContracts: 14
    });

    expect(health.status).toBe("healthy");
    expect(health.score).toBeGreaterThanOrEqual(75);
  });

  it("flags weak workflow depth as at risk", () => {
    const health = getAccountHealthSummary({
      totalContracts: 2,
      needsReview: 2,
      renewalsDueSoon: 0,
      noticeDeadlinesDueSoon: 0,
      reviewedContracts: 0,
      ownerAssignedContracts: 0
    });

    expect(health.status).toBe("at_risk");
    expect(health.recommendedActions.length).toBeGreaterThan(0);
  });

  it("defines the retention analytics operating model", () => {
    expect(retentionDefinitions.some((item) => item.name === "Retained account")).toBe(true);
    expect(weeklyRetentionMetrics.some((metric) => metric.name === "Weekly active workflow accounts")).toBe(true);
    expect(monthlyRetentionMetrics.some((metric) => metric.name === "Logo retention")).toBe(true);
    expect(workflowRetentionMetrics.some((metric) => metric.name === "Due-soon decision coverage")).toBe(true);
    expect(cohortDashboards.some((dashboard) => dashboard.title === "Signup cohorts")).toBe(true);
    expect(churnRiskScoringRules.some((rule) => rule.signal === "Low owner coverage")).toBe(true);
    expect(leadingChurnIndicators.length).toBeGreaterThan(0);
    expect(antiChurnReportingViews.length).toBeGreaterThan(0);
  });
});

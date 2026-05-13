import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateOrganizationHealthSnapshot } from "@/lib/commercial/organization-health";

const createAdminSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient
}));

describe("runtime analytics instrumentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats duplicate analytics idempotency keys as safe no-ops", async () => {
    createAdminSupabaseClient.mockReturnValue({
      from() {
        return {
          async insert() {
            return { error: { code: "23505", message: "duplicate" } };
          }
        };
      }
    });

    const { trackServerAnalyticsEvent } = await import("@/lib/analytics/events");
    await expect(
      trackServerAnalyticsEvent({
        organizationId: "org-1",
        actorUserId: "user-1",
        eventName: "reminder_scheduled",
        sourceOfTruth: "event_and_state",
        idempotencyKey: "duplicate-key"
      })
    ).resolves.toEqual({ inserted: false });
  });

  it("keeps missing support telemetry explicit in organization health instead of pretending health", () => {
    const snapshot = calculateOrganizationHealthSnapshot({
      totalContracts: 1,
      reviewedContracts: 0,
      ownerAssignedContracts: 0,
      reminderCount: 0,
      decisionCount: 0,
      contractLimit: 25,
      supportMinutes30d: 0,
      onboardingMinutes30d: 0,
      ocrCost30d: 0,
      reminderFailures30d: 0,
      extractionFailures30d: 0,
      repeatedReminderFailures: false,
      repeatedExtractionFailures: false,
      checkoutStarted30d: 0,
      checkoutCompleted30d: 0,
      lowWorkflowRevisit: true,
      missingSupportTelemetry: true,
      missingOnboardingTelemetry: true,
      missingCostTelemetry: true
    });

    expect(snapshot.blockers).toEqual(
      expect.arrayContaining([
        "No reviewed contract exists yet.",
        "No accountable owner has been assigned yet.",
        "No reminder-backed obligation exists yet."
      ])
    );
    expect(snapshot.missingTelemetry).toEqual(
      expect.arrayContaining([
        "Support time telemetry is missing.",
        "Onboarding time telemetry is missing.",
        "Usage-cost telemetry is missing."
      ])
    );
    expect(snapshot.status).toBe("risk");
  });
});

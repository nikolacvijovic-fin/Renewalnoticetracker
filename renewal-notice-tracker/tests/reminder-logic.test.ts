import { describe, expect, it } from "vitest";
import { generateReminderRecommendations } from "@/lib/contracts/reminders";

describe("generateReminderRecommendations", () => {
  it("creates phase-1 reminder schedules with decision and acknowledgment requests", () => {
    const reminders = generateReminderRecommendations(
      {
        contract_title: "MSA",
        counterparty_name: "Acme",
        contract_type: "MSA",
        effective_date: "2026-01-01",
        renewal_date: "2026-12-31",
        expiration_date: "2026-12-31",
        auto_renewal: true,
        renewal_term: "12 months",
        notice_period_value: 30,
        notice_period_unit: "days",
        notice_deadline_date: "2026-12-01",
        termination_window: "30 days",
        governing_law: "New York",
        payment_terms: "Net 30",
        extracted_clauses: [],
        field_confidence: {},
        field_source_snippets: {},
        reminder_recommendations: [],
        reviewer_notes: null
      },
      ["ops@example.com", "finance@example.com"]
    );

    expect(reminders).toHaveLength(15);
    expect(reminders.some((reminder) => reminder.reminder_type === "decision_request")).toBe(true);
    expect(reminders.some((reminder) => reminder.reminder_type === "acknowledgment_request")).toBe(true);
    expect(reminders.some((reminder) => reminder.reminder_type === "renewal")).toBe(true);
    expect(reminders.some((reminder) => reminder.reminder_type === "expiration")).toBe(true);
    expect(
      reminders.some((reminder) =>
        ["custom", "renewal_date", "expiration_date"].includes(reminder.reminder_type as string)
      )
    ).toBe(false);
    expect(
      reminders.every((reminder) => reminder.recipient_emails.includes("finance@example.com"))
    ).toBe(true);
  });
});

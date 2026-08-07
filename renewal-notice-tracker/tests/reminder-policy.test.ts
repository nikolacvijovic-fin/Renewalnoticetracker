import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SHIPPED_REMINDER_DAY_OFFSETS,
  SHIPPED_REMINDER_TYPES,
  buildShippedReminderSchedule,
  formatReminderRuntimeStatusLabel,
  getReminderActivationState,
  normalizeReminderType
} from "@/lib/contracts/shipped-reminder-policy";

describe("shipped reminder policy", () => {
  it("keeps the shipped reminder types fixed and narrow", () => {
    expect(SHIPPED_REMINDER_TYPES).toEqual([
      "notice_deadline",
      "renewal",
      "expiration",
      "decision_request",
      "acknowledgment_request",
      "internal_review_needed",
      "missed_notice_deadline"
    ]);
  });

  it("uses only the fixed shipped offsets", () => {
    expect(SHIPPED_REMINDER_DAY_OFFSETS).toEqual({
      notice_deadline: [30, 14, 7, 3, 0],
      renewal: [90, 60, 30, 14],
      expiration: [90, 60, 30, 14]
    });
  });

  it("blocks trusted reminders until review and owner assignment are complete", () => {
    expect(
      getReminderActivationState({
        needsReview: true,
        ownerUserId: "owner-1",
        noticeDeadlineDate: "2030-01-01",
        recipientCount: 1
      })
    ).toBe("blocked_by_review");

    expect(
      getReminderActivationState({
        needsReview: false,
        ownerUserId: null,
        noticeDeadlineDate: "2030-01-01",
      })
    ).toBe("blocked_by_missing_owner");
  });

  it("blocks reminder activation when reviewed truth still lacks a confirmed P0 date", () => {
    expect(
      getReminderActivationState({
        needsReview: false,
        ownerUserId: "owner-1"
      })
    ).toBe("blocked_by_missing_p0");
  });

  it("schedules only when reviewed truth, owner assignment, and a confirmed P0 date exist", () => {
    expect(
      getReminderActivationState({
        needsReview: false,
        ownerUserId: "owner-1",
        noticeDeadlineDate: "2030-01-01"
      })
    ).toBe("scheduled");
  });

  it("normalizes legacy renewal aliases and operator-visible status labels", () => {
    expect(normalizeReminderType("renewal_date")).toBe("renewal");
    expect(normalizeReminderType("expiration_date")).toBe("expiration");
    expect(formatReminderRuntimeStatusLabel("retry_pending")).toBe("Retrying");
    expect(formatReminderRuntimeStatusLabel("failed_terminal")).toBe("Terminal failure");
  });

  it("moves weekend send dates to the previous business day", () => {
    const reminders = buildShippedReminderSchedule(
      {
        contract_title: "MSA",
        counterparty_name: "Acme",
        contract_type: "MSA",
        effective_date: "2026-01-01",
        renewal_date: "2026-04-12",
        expiration_date: null,
        auto_renewal: true,
        renewal_term: "12 months",
        notice_period_value: 30,
        notice_period_unit: "days",
        notice_deadline_date: "2027-05-01",
        termination_window: "30 days",
        governing_law: "New York",
        payment_terms: "Net 30",
        contract_value_amount: null,
        contract_value_currency: null,
        contract_value_period: null,
        price_change_trigger: null,
        payment_trigger: null,
        financial_data_trust_status: null,
        extracted_clauses: [],
        field_confidence: {
          notice_deadline_date: 1
        },
        field_source_snippets: {},
        reminder_recommendations: [],
        reviewer_notes: null
      },
      ["ops@example.com"]
    );

    expect(
      reminders.some(
        (reminder) =>
          reminder.reminder_type === "renewal" &&
          reminder.remind_at.startsWith("2026-03-27")
      )
    ).toBe(true);
  });

  it("keeps custom offset logic out of the shipped runtime", () => {
    const repoRoot = path.resolve(__dirname, "..");
    const shippedContractsAction = fs.readFileSync(
      path.join(repoRoot, "lib", "actions", "contracts.ts"),
      "utf8"
    );

    expect(shippedContractsAction).not.toMatch(/applyTemplateOffsets/);
    expect(shippedContractsAction).not.toMatch(/templateReminders/);
  });
});

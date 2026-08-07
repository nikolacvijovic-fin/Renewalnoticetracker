import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  INTERNAL_NOTICE_REMINDER_WINDOWS,
  buildInternalRenewalReminderPlan,
  getInternalRenewalReminderTone
} from "@/lib/contracts/internal-renewal-reminders";
import type { ExtractedContractFields } from "@/lib/validation/contract";

const now = new Date("2026-08-07T12:00:00.000Z");

function metadata(
  overrides: Partial<ExtractedContractFields & { needs_review: boolean }> = {}
): ExtractedContractFields & { needs_review: boolean } {
  return {
    contract_title: "Acme Cloud MSA",
    counterparty_name: "Acme",
    contract_type: "MSA",
    effective_date: "2026-01-01",
    renewal_date: "2026-10-01",
    expiration_date: "2026-10-01",
    auto_renewal: true,
    renewal_term: "12 months",
    notice_period_value: 30,
    notice_period_unit: "days",
    notice_deadline_date: "2026-09-06",
    termination_window: "30 days",
    governing_law: null,
    payment_terms: null,
    contract_value_amount: 50000,
    contract_value_currency: "USD",
    contract_value_period: null,
    price_change_trigger: null,
    payment_trigger: null,
    financial_data_trust_status: null,
    extracted_clauses: [],
    field_confidence: {
      notice_deadline_date: 0.95
    },
    field_source_snippets: {
      notice_deadline_date: "Notice is due September 6, 2026."
    },
    reminder_recommendations: [],
    reviewer_notes: null,
    needs_review: false,
    ...overrides
  };
}

describe("internal renewal reminders", () => {
  it("generates the required 30/14/7/3/0 notice deadline windows", () => {
    const plan = buildInternalRenewalReminderPlan({
      metadata: metadata(),
      recipientEmails: ["owner@example.com"],
      now
    });

    expect(INTERNAL_NOTICE_REMINDER_WINDOWS).toEqual([30, 14, 7, 3, 0]);
    expect(plan.status).toBe("scheduled");
    expect(plan.reminders.map((reminder) => reminder.reminder_type)).toEqual([
      "notice_deadline",
      "notice_deadline",
      "notice_deadline",
      "notice_deadline",
      "notice_deadline"
    ]);
    expect(plan.reminders.map((reminder) => reminder.remind_at.slice(0, 10))).toEqual([
      "2026-08-07",
      "2026-08-21",
      "2026-08-28",
      "2026-09-03",
      "2026-09-04"
    ]);
  });

  it("creates a missed-deadline alert instead of normal reminder language", () => {
    const plan = buildInternalRenewalReminderPlan({
      metadata: metadata({ notice_deadline_date: "2026-08-01" }),
      recipientEmails: ["owner@example.com"],
      now
    });

    expect(plan.status).toBe("missed_deadline");
    expect(plan.reminders).toEqual([
      expect.objectContaining({
        reminder_type: "missed_notice_deadline",
        recipient_email: "owner@example.com"
      })
    ]);
    expect(getInternalRenewalReminderTone({
      reminderType: "missed_notice_deadline",
      noticeDeadlineDate: "2026-08-01",
      now
    })).toBe("Opt-out deadline missed");
  });

  it("sends review-needed alerts for missing, weak, or unreviewed notice deadlines", () => {
    for (const row of [
      metadata({ notice_deadline_date: null }),
      metadata({ needs_review: true }),
      metadata({ field_confidence: { notice_deadline_date: 0.4 } })
    ]) {
      const plan = buildInternalRenewalReminderPlan({
        metadata: row,
        recipientEmails: ["admin@example.com"],
        now
      });

      expect(plan.status).toBe("review_needed");
      expect(plan.reminders).toEqual([
        expect.objectContaining({
          reminder_type: "internal_review_needed",
          recipient_email: "admin@example.com"
        })
      ]);
    }
  });

  it("skips resolved decisions, archived contracts, and unavailable internal recipients", () => {
    expect(buildInternalRenewalReminderPlan({
      metadata: metadata(),
      recipientEmails: ["owner@example.com"],
      renewalDecisionStatus: "resolved",
      now
    }).status).toBe("skipped_resolved");
    expect(buildInternalRenewalReminderPlan({
      metadata: metadata(),
      recipientEmails: ["owner@example.com"],
      contractStatus: "archived",
      now
    }).status).toBe("skipped_archived");
    expect(buildInternalRenewalReminderPlan({
      metadata: metadata(),
      recipientEmails: [],
      now
    }).status).toBe("skipped_no_internal_recipient");
  });

  it("deduplicates normalized internal recipients and never introduces vendor recipients", () => {
    const plan = buildInternalRenewalReminderPlan({
      metadata: metadata(),
      recipientEmails: ["Owner@Example.com", "owner@example.com", ""],
      now
    });

    expect(plan.reminders[0]?.recipient_emails).toEqual(["owner@example.com"]);
    expect(JSON.stringify(plan)).not.toMatch(/vendor|counterparty|prospect|sequence|cancellation notice/i);
  });

  it("keeps vendor cancellation, CRM, and outreach paths out of the reminder runtime", () => {
    const repoRoot = path.resolve(__dirname, "..");
    const files = [
      fs.readFileSync(path.join(repoRoot, "lib", "contracts", "internal-renewal-reminders.ts"), "utf8"),
      fs.readFileSync(path.join(repoRoot, "lib", "notifications", "reminders.ts"), "utf8"),
      fs.readFileSync(path.join(repoRoot, "lib", "email", "policy.ts"), "utf8")
    ].join("\n");

    expect(files).not.toMatch(/sendCancellation|vendorRecipient|counterpartyContact|sequence|crmSync|coldOutreach/i);
    expect(files).not.toMatch(/raw contract text|private notes|provider payload/i);
  });
});

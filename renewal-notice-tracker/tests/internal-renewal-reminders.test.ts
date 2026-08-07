import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  INTERNAL_NOTICE_REMINDER_ESCALATIONS,
  INTERNAL_NOTICE_REMINDER_WINDOWS,
  buildInternalRenewalReminderContent,
  buildInternalRenewalReminderPlan,
  buildRenewalReminderDeliveryKey,
  getInternalRenewalReminderTone,
  selectInternalRenewalReminderRecipients
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
      now,
      organizationId: "org-1",
      contractId: "contract-1"
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
    expect(plan.reminders.map((reminder) => reminder.escalation_level)).toEqual([1, 2, 3, 4, 5]);
    expect(plan.reminders.map((reminder) => reminder.delivery_key)).toEqual([
      "renewal-deadline:org-1:contract-1:30d:2026-09-06",
      "renewal-deadline:org-1:contract-1:14d:2026-09-06",
      "renewal-deadline:org-1:contract-1:7d:2026-09-06",
      "renewal-deadline:org-1:contract-1:3d:2026-09-06",
      "renewal-deadline:org-1:contract-1:0d:2026-09-06"
    ]);
  });

  it("maps escalation windows to labels, tone, recipient rule, and recommended action", () => {
    expect(INTERNAL_NOTICE_REMINDER_ESCALATIONS[30]).toMatchObject({
      escalationLevel: 1,
      escalationLabel: "review",
      subjectToneLabel: "Review renewal decision",
      recipientRule: "owner_or_internal_fallback"
    });
    expect(INTERNAL_NOTICE_REMINDER_ESCALATIONS[14].escalationLabel).toBe("follow_up");
    expect(INTERNAL_NOTICE_REMINDER_ESCALATIONS[7].escalationLabel).toBe("urgent");
    expect(INTERNAL_NOTICE_REMINDER_ESCALATIONS[3].escalationLabel).toBe("critical");
    expect(INTERNAL_NOTICE_REMINDER_ESCALATIONS[0].escalationLabel).toBe("deadline_today");
    expect(INTERNAL_NOTICE_REMINDER_ESCALATIONS[3].recommendedAction).toMatch(/Make the renewal decision/i);
  });

  it("creates a missed-deadline alert instead of normal reminder language", () => {
    const plan = buildInternalRenewalReminderPlan({
      metadata: metadata({ notice_deadline_date: "2026-08-01" }),
      recipientEmails: ["owner@example.com"],
      now,
      organizationId: "org-1",
      contractId: "contract-1"
    });

    expect(plan.status).toBe("missed_deadline");
    expect(plan.reminders).toEqual([
      expect.objectContaining({
        reminder_type: "missed_notice_deadline",
        recipient_email: "owner@example.com",
        escalation_level: 6,
        delivery_key: "renewal-deadline:org-1:contract-1:missed:2026-08-01"
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
        now,
        organizationId: "org-1",
        contractId: "contract-1"
      });

      expect(plan.status).toBe("review_needed");
      expect(plan.reminders).toEqual([
        expect.objectContaining({
          reminder_type: "internal_review_needed",
          recipient_email: "admin@example.com",
          delivery_key: expect.stringMatching(/^renewal-deadline:org-1:contract-1:review_needed:/)
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

  it("builds stable delivery keys for duplicate suppression", () => {
    expect(
      buildRenewalReminderDeliveryKey({
        organizationId: "org-1",
        contractId: "contract-1",
        windowLabel: "7d",
        noticeDeadlineDate: "2030-01-01T00:00:00.000Z"
      })
    ).toBe("renewal-deadline:org-1:contract-1:7d:2030-01-01");
  });

  it("selects the assigned owner before internal fallback recipients", () => {
    expect(
      selectInternalRenewalReminderRecipients({
        ownerUserId: "owner-user",
        members: [
          {
            user_id: "owner-user",
            role: "member",
            user: { notification_email: " Owner@Example.com " }
          },
          {
            user_id: "admin-user",
            role: "admin",
            user: { notification_email: "admin@example.com" }
          }
        ],
        fallbackRecipients: ["billing@example.com"]
      })
    ).toEqual(["owner@example.com"]);
  });

  it("falls back to internal owner, admin, and operator recipients when no owner email is available", () => {
    expect(
      selectInternalRenewalReminderRecipients({
        ownerUserId: "missing-owner",
        members: [
          {
            user_id: "admin-user",
            role: "admin",
            user: { notification_email: "admin@example.com" }
          },
          {
            user_id: "operator-user",
            role: "operator",
            user: { notification_email: "operator@example.com" }
          },
          {
            user_id: "member-user",
            role: "member",
            user: { notification_email: "member@example.com" }
          }
        ],
        fallbackRecipients: ["billing@example.com"]
      })
    ).toEqual(["admin@example.com", "operator@example.com", "billing@example.com"]);
  });

  it("builds safe supportable reminder content without raw customer or provider data", () => {
    const content = buildInternalRenewalReminderContent({
      contractId: "contract-1",
      contractTitle: "Acme MSA",
      counterpartyName: "Acme",
      reminderType: "notice_deadline",
      noticeDeadlineDate: "2030-01-01",
      daysRemaining: 7,
      contractValueAmount: 100000,
      contractValueCurrency: "USD",
      ownerLabel: "Finance Owner",
      appUrl: "https://app.noticecontrol.test",
      escalationLevel: 3
    });

    expect(content).toMatchObject({
      subject: "Urgent renewal action needed: Acme MSA",
      urgencyLabel: "urgent",
      actionUrl: "https://app.noticecontrol.test/dashboard/contracts/contract-1"
    });
    expect(JSON.stringify(content)).not.toMatch(
      /raw contract text|raw clauses|provider payload|private notes|cancellation email|vendor outreach/i
    );
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

import { describe, expect, it } from "vitest";
import {
  ICS_REMINDER_ALARM_OFFSETS_DAYS,
  buildCalendar,
  buildContractDateCalendarEvents,
  buildSaasOptOutCalendarEvents,
  buildTrustedUpcomingContractCalendarEvents,
  buildUrgentRenewalCalendarEvents
} from "@/lib/contracts/ics";
import type { RenewalCommandContractInput } from "@/lib/dashboard/renewal-command-center";
import type { UrgentRenewalItem } from "@/lib/dashboard/urgent-renewal-items";
import type { SaasOptOutClockItem } from "@/lib/saas/queries";

const appUrl = "https://app.noticecontrol.example";

function unfoldIcs(value: string) {
  return value.replace(/\r\n /g, "");
}

function calendarLines(value: string) {
  return value.split("\r\n").filter(Boolean);
}

function contract(overrides: Partial<RenewalCommandContractInput> = {}): RenewalCommandContractInput {
  return {
    id: "contract-1",
    title: "Acme MSA",
    counterpartyName: "Acme",
    status: "active",
    statusTag: "active",
    cycleStatus: "active",
    ownerUserId: "owner-1",
    ownerName: "Finance Owner",
    noticeDeadlineDate: "2026-09-01",
    renewalDate: "2026-10-01",
    expirationDate: "2026-10-01",
    needsReview: false,
    hasWeakEvidence: false,
    fieldConfidence: { notice_deadline_date: 0.95 },
    contractValueAmount: 12500,
    contractValueCurrency: "USD",
    reminders: [],
    ...overrides
  };
}

describe("buildCalendar", () => {
  it("creates valid all-day VCALENDAR events with standard alarm offsets", () => {
    const value = buildCalendar([
      {
        uid: "abc",
        startDate: "2026-12-01",
        summary: "Notice deadline: Acme MSA",
        description: "Open in NoticeControl.",
        alarms: ICS_REMINDER_ALARM_OFFSETS_DAYS
      }
    ]);

    expect(value).toContain("BEGIN:VCALENDAR");
    expect(value).toContain("BEGIN:VEVENT");
    expect(value).toContain("DTSTART;VALUE=DATE:20261201");
    expect(value).toContain("DTEND;VALUE=DATE:20261202");
    expect(value).toContain("SUMMARY:Notice deadline: Acme MSA");
    expect(value).toContain("UID:abc@noticecontrol.app");
    expect(value).toContain("TRIGGER:-P30D");
    expect(value).toContain("TRIGGER:-P14D");
    expect(value).toContain("TRIGGER:-P7D");
    expect(value).toContain("TRIGGER:-P3D");
    expect(value).toContain("TRIGGER:PT0S");
    expect(value.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("preserves safe app links and minimizes owner/spend metadata in rendered ICS descriptions", () => {
    const events = buildContractDateCalendarEvents({
      contractId: "contract-1",
      ownerLabel: "Finance Owner",
      appUrl,
      metadata: {
        contract_title: "Acme MSA",
        counterparty_name: "Acme",
        notice_deadline_date: "2026-12-01",
        field_confidence: { notice_deadline_date: 0.96 },
        contract_value_amount: 25000,
        contract_value_currency: "USD"
      }
    });
    const value = buildCalendar(events);

    expect(unfoldIcs(value)).toContain("https://app.noticecontrol.example/dashboard/contracts/contract-1");
    expect(value).not.toContain("Finance Owner");
    expect(value).not.toContain("25000");
  });

  it("keeps legacy timestamp event input working", () => {
    const value = buildCalendar([
      {
        uid: "legacy",
        start: "2026-12-01T00:00:00.000Z",
        summary: "Reminder",
        description: "Check contract"
      }
    ]);

    expect(value).toContain("DTSTART:20261201T000000Z");
  });

  it("rejects impossible date-only values instead of relying on JavaScript rollover", () => {
    const value = buildCalendar([
      {
        uid: "bad-date",
        startDate: "2026-02-31",
        summary: "Notice deadline: Impossible Date",
        description: "This should not export."
      },
      {
        uid: "good-date",
        startDate: "2026-02-28",
        summary: "Notice deadline: Real Date",
        description: "This should export."
      }
    ]);

    expect(value).not.toContain("Impossible Date");
    expect(value).not.toContain("20260303");
    expect(value).toContain("Real Date");
    expect(value).toContain("DTSTART;VALUE=DATE:20260228");
  });

  it("folds long ASCII and Unicode content lines at 75 UTF-8 octets without splitting code points", () => {
    const value = buildCalendar([
      {
        uid: "folding",
        startDate: "2026-12-01",
        summary: `Notice deadline: ${"A".repeat(90)} €漢字 ${"B".repeat(40)}`,
        description: `Open NoticeControl ${"safe ".repeat(80)} €漢字`
      }
    ]);

    const lines = calendarLines(value);
    expect(lines.some((line) => line.startsWith(" "))).toBe(true);
    for (const line of lines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(unfoldIcs(value)).toContain("€漢字");
    expect(unfoldIcs(value)).toContain("SUMMARY:Notice deadline:");
  });

  it("preserves CRLF formatting and escaped text values", () => {
    const value = buildCalendar([
      {
        uid: "escaping",
        startDate: "2026-12-01",
        summary: "Renewal, deadline; check \\ path",
        description: "Line one\nLine two, with; punctuation \\ safe"
      }
    ]);

    expect(value).toContain("\r\n");
    expect(value).not.toMatch(/(?<!\r)\n/);
    expect(unfoldIcs(value)).toContain("SUMMARY:Renewal\\, deadline\\; check \\\\ path");
    expect(unfoldIcs(value)).toContain("Line one\\nLine two\\, with\\; punctuation \\\\ safe");
  });

  it("does not generate alarms for historical events", () => {
    const value = buildCalendar([
      {
        uid: "historical",
        startDate: "2000-01-01",
        summary: "Notice deadline: Old Contract",
        description: "Open NoticeControl.",
        alarms: ICS_REMINDER_ALARM_OFFSETS_DAYS
      }
    ]);

    expect(value).toContain("Old Contract");
    expect(value).not.toContain("BEGIN:VALARM");
  });
});

describe("contract calendar events", () => {
  it("exports notice, renewal, and expiration dates with safe metadata and app links", () => {
    const events = buildContractDateCalendarEvents({
      contractId: "contract-1",
      ownerLabel: "Finance Owner",
      appUrl,
      metadata: {
        contract_title: "Acme MSA",
        counterparty_name: "Acme",
        notice_deadline_date: "2026-09-01",
        renewal_date: "2026-10-01",
        expiration_date: "2026-10-31",
        field_confidence: { notice_deadline_date: 0.96 },
        contract_value_amount: 25000,
        contract_value_currency: "USD"
      }
    });

    expect(events.map((event) => event.summary)).toEqual([
      "Notice deadline: Acme MSA",
      "Renewal date: Acme MSA",
      "Expiration date: Acme MSA"
    ]);
    expect(events[0]?.description).toContain("Open in NoticeControl: https://app.noticecontrol.example/dashboard/contracts/contract-1");
    expect(events[0]?.description).not.toContain("Spend at risk");
    expect(events[0]?.description).not.toContain("Finance Owner");
  });

  it("labels weak individual notice deadlines as review-needed instead of trusted truth", () => {
    const events = buildContractDateCalendarEvents({
      contractId: "contract-weak",
      appUrl,
      metadata: {
        contract_title: "Weak Renewal",
        counterparty_name: "Beta",
        notice_deadline_date: "2026-09-01",
        renewal_date: null,
        expiration_date: null,
        needs_review: true,
        has_weak_evidence: true,
        field_confidence: { notice_deadline_date: 0.3 }
      }
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe("Needs review: Notice deadline: Beta - Weak Renewal");
    expect(events[0]?.description).toContain("Trust status: Needs review");
  });

  it("does not create fake notice deadline events when the deadline is missing", () => {
    const events = buildContractDateCalendarEvents({
      contractId: "contract-missing",
      appUrl,
      metadata: {
        contract_title: "Missing Notice",
        counterparty_name: "Gamma",
        notice_deadline_date: null,
        renewal_date: "2026-10-01",
        expiration_date: null,
        field_confidence: {}
      }
    });

    expect(events.map((event) => event.summary).join("\n")).not.toContain("Notice deadline");
    expect(events.map((event) => event.summary)).toEqual(["Renewal date: Gamma - Missing Notice"]);
  });

  it("excludes raw contract text, clauses, provider payloads, private notes, and cancellation copy", () => {
    const sensitiveMarker = "RAW-CONTRACT-CLAUSE provider_payload private note cancellation email body";
    const events = buildContractDateCalendarEvents({
      contractId: "contract-sensitive",
      appUrl,
      metadata: {
        contract_title: "Sensitive MSA",
        counterparty_name: "Delta",
        notice_deadline_date: "2026-09-01",
        renewal_date: null,
        expiration_date: null,
        field_confidence: { notice_deadline_date: 0.99 },
        extracted_clauses: sensitiveMarker,
        private_notes: sensitiveMarker,
        provider_payload: sensitiveMarker,
        cancellation_email_body: sensitiveMarker
      } as never
    });

    expect(JSON.stringify(events)).not.toContain(sensitiveMarker);
  });
});

describe("bulk calendar exports", () => {
  it("includes only eligible upcoming trusted notice deadlines in trusted bulk exports", () => {
    const events = buildTrustedUpcomingContractCalendarEvents({
      now: new Date("2026-08-07T12:00:00.000Z"),
      maxDays: 30,
      appUrl,
      contracts: [
        contract({ id: "trusted", noticeDeadlineDate: "2026-08-20" }),
        contract({
          id: "weak",
          noticeDeadlineDate: "2026-08-20",
          needsReview: true,
          fieldConfidence: { notice_deadline_date: 0.2 }
        }),
        contract({ id: "missing", noticeDeadlineDate: null }),
        contract({ id: "too-far", noticeDeadlineDate: "2026-12-20" })
      ]
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.uid).toContain("trusted");
    expect(JSON.stringify(events)).not.toContain("weak");
    expect(JSON.stringify(events)).not.toContain("missing");
  });

  it("exports urgent dashboard dates only when trusted and inside the action window", () => {
    const items: UrgentRenewalItem[] = [
      {
        contractId: "urgent-1",
        contractTitle: "Acme MSA",
        counterpartyName: "Acme",
        noticeDeadlineDate: "2026-08-10",
        renewalDate: null,
        expirationDate: null,
        daysLeft: 3,
        contractValueAmount: 30000,
        contractValueCurrency: "USD",
        ownerName: "Owner",
        ownerUserId: "owner-1",
        trustStatus: "trusted",
        primaryReason: "notice_deadline_due_7_days",
        reasonCodes: ["notice_deadline_due_7_days"],
        primaryActionHref: "/dashboard/contracts/urgent-1",
        sortRank: 3
      },
      {
        contractId: "missed-1",
        contractTitle: "Missed",
        counterpartyName: "Missed Vendor",
        noticeDeadlineDate: "2026-08-01",
        renewalDate: null,
        expirationDate: null,
        daysLeft: -6,
        contractValueAmount: 90000,
        contractValueCurrency: "USD",
        ownerName: "Owner",
        ownerUserId: "owner-1",
        trustStatus: "trusted",
        primaryReason: "missed_notice_deadline",
        reasonCodes: ["missed_notice_deadline"],
        primaryActionHref: "/dashboard/contracts/missed-1",
        sortRank: 1
      },
      {
        contractId: "review-1",
        contractTitle: "Review",
        counterpartyName: "Beta",
        noticeDeadlineDate: "2026-08-10",
        renewalDate: null,
        expirationDate: null,
        daysLeft: null,
        contractValueAmount: 0,
        contractValueCurrency: "USD",
        ownerName: null,
        ownerUserId: null,
        trustStatus: "needs_review",
        primaryReason: "missing_or_weak_notice_deadline",
        reasonCodes: ["missing_or_weak_notice_deadline"],
        primaryActionHref: "/dashboard/contracts/review-1",
        sortRank: 7
      }
    ];

    const events = buildUrgentRenewalCalendarEvents({ items, appUrl });

    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe("Notice deadline: Acme MSA");
    expect(JSON.stringify(events)).not.toContain("review-1");
    expect(JSON.stringify(events)).not.toContain("missed-1");
  });

  it("exports SaaS opt-out deadlines without resolved items or missing dates", () => {
    const baseItem = {
      software: { id: "software-1", name: "Acme SaaS", vendor_name: "Acme" },
      effectiveOptOutDeadline: "2026-08-20",
      workflowStatus: "open",
      ownerLabel: "Finance Owner",
      spendAtRiskAmount: 50000,
      spendAtRiskCurrency: "USD",
      contractId: "contract-1",
      metadataConflicts: [],
      openFindings: [],
      latestTerm: null,
      optOutWindow: null,
      ownerUserId: "owner-1",
      linkedContractOwnerUserId: "owner-1",
      nextAction: null,
      nextActionDueAt: null,
      daysUntilOptOut: 13,
      urgency: "high",
      deadlineWindow: "due_30_days",
      resolvedMetadataConflicts: [],
      trustedValueDetails: [],
      trustedValueExplanations: []
    } as unknown as SaasOptOutClockItem;

    const events = buildSaasOptOutCalendarEvents({
      appUrl,
      items: [
        baseItem,
        { ...baseItem, software: { id: "software-2", name: "Missing", vendor_name: "Missing" }, effectiveOptOutDeadline: null },
        { ...baseItem, software: { id: "software-3", name: "Resolved", vendor_name: "Resolved" }, workflowStatus: "resolved" }
      ] as SaasOptOutClockItem[]
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe("Opt-out deadline: Acme SaaS");
    expect(events[0]?.description).toContain("/dashboard/saas-opt-out-clock");
  });
});

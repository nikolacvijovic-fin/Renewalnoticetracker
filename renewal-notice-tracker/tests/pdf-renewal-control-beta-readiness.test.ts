import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeAiProposedFact } from "@/lib/ai/ai-fact-normalizer";
import { buildCalendar, buildContractDateCalendarEvents, buildUrgentRenewalCalendarEvents } from "@/lib/contracts/ics";
import {
  buildInternalRenewalReminderContent,
  buildInternalRenewalReminderPlan,
  selectInternalRenewalReminderRecipients
} from "@/lib/contracts/internal-renewal-reminders";
import { buildRenewalManualActionTemplate } from "@/lib/contracts/renewal-action-templates";
import { buildUrgentRenewalDashboard } from "@/lib/dashboard/urgent-renewal-items";
import type { RenewalCommandContractInput } from "@/lib/dashboard/renewal-command-center";
import {
  calculateSaasContractRiskFindings,
  deriveSaasOptOutWorkflowStatus
} from "@/lib/saas/renewal-defense";

const now = new Date("2026-08-07T12:00:00.000Z");
const appUrl = "https://app.noticecontrol.example";

function contract(overrides: Partial<RenewalCommandContractInput> = {}): RenewalCommandContractInput {
  return {
    id: "contract-1",
    title: "Acme Cloud MSA",
    counterpartyName: "Acme",
    status: "active",
    statusTag: "active",
    cycleStatus: "active",
    ownerUserId: "owner-1",
    ownerName: "Finance Owner",
    noticeDeadlineDate: "2026-08-14",
    renewalDate: "2026-09-15",
    expirationDate: "2026-09-15",
    autoRenewal: true,
    needsReview: false,
    hasWeakEvidence: false,
    fieldConfidence: {
      notice_deadline_date: 0.96,
      renewal_date: 0.96,
      expiration_date: 0.96,
      auto_renewal: 0.96
    },
    contractValueAmount: 75000,
    contractValueCurrency: "USD",
    reminders: [],
    ...overrides
  };
}

describe("PDF Renewal Control beta readiness path", () => {
  it("keeps weak extraction out of trusted operations until reviewed, then supports dashboard, reminders, ICS, and copy-only action", () => {
    const proposedDeadline = normalizeAiProposedFact({
      organizationId: "org-1",
      entityType: "contract",
      entityId: "contract-1",
      field: "notice_deadline_date",
      value: "2026-08-14",
      source: "extraction",
      confidence: 0.42,
      evidenceReference: { sourceLabel: "PDF extraction evidence", sourceId: "evidence-1" },
      reviewStatus: "proposed"
    });

    expect(proposedDeadline.trustStatus).toBe("needs_review");
    expect(proposedDeadline.requiresReview).toBe(true);

    const weakDashboard = buildUrgentRenewalDashboard({
      now,
      contracts: [
        contract({
          needsReview: true,
          hasWeakEvidence: true,
          fieldConfidence: { notice_deadline_date: proposedDeadline.confidence }
        })
      ]
    });
    expect(weakDashboard.allActionItems[0]).toMatchObject({
      trustStatus: "needs_review",
      daysLeft: null
    });
    expect(weakDashboard.allActionItems[0]?.reasonCodes).toContain("missing_or_weak_notice_deadline");

    const reviewedContract = contract();
    const trustedDashboard = buildUrgentRenewalDashboard({
      now,
      contracts: [
        reviewedContract,
        contract({
          id: "resolved",
          cycleStatus: "resolved",
          noticeDeadlineDate: "2026-08-10"
        }),
        contract({
          id: "missing",
          title: "Missing Notice",
          noticeDeadlineDate: null,
          needsReview: true
        })
      ]
    });

    expect(trustedDashboard.allActionItems.map((item) => item.contractId)).toContain("contract-1");
    expect(trustedDashboard.allActionItems.map((item) => item.contractId)).not.toContain("resolved");
    expect(trustedDashboard.summary.urgentThisWeek).toBe(1);
    expect(trustedDashboard.summary.missingNoticeDeadlines).toBe(1);

    const recipients = selectInternalRenewalReminderRecipients({
      ownerUserId: "owner-1",
      members: [
        { user_id: "owner-1", role: "member", user: { notification_email: "Owner@Example.com" } },
        { user_id: "admin-1", role: "admin", user: { notification_email: "admin@example.com" } }
      ]
    });
    expect(recipients).toEqual(["owner@example.com"]);

    const reminderPlan = buildInternalRenewalReminderPlan({
      metadata: {
        contract_title: reviewedContract.title,
        counterparty_name: reviewedContract.counterpartyName ?? null,
        contract_type: "MSA",
        effective_date: null,
        renewal_date: reviewedContract.renewalDate ?? null,
        expiration_date: reviewedContract.expirationDate ?? null,
        auto_renewal: true,
        renewal_term: null,
        notice_period_value: 30,
        notice_period_unit: "days",
        notice_deadline_date: reviewedContract.noticeDeadlineDate ?? null,
        termination_window: null,
        governing_law: null,
        payment_terms: null,
        contract_value_amount: reviewedContract.contractValueAmount ?? null,
        contract_value_currency: reviewedContract.contractValueCurrency ?? null,
        contract_value_period: null,
        price_change_trigger: null,
        payment_trigger: null,
        financial_data_trust_status: null,
        extracted_clauses: [],
        field_confidence: { notice_deadline_date: 0.96 },
        field_source_snippets: { notice_deadline_date: "Short evidence snippet." },
        reminder_recommendations: [],
        reviewer_notes: null,
        needs_review: false
      },
      recipientEmails: recipients,
      now,
      organizationId: "org-1",
      contractId: reviewedContract.id
    });

    expect(reminderPlan.status).toBe("scheduled");
    expect(reminderPlan.reminders[0]?.recipient_email).toBe("owner@example.com");
    expect(reminderPlan.reminders.every((reminder) => reminder.delivery_key?.includes("org-1:contract-1"))).toBe(true);

    const resolvedReminderPlan = buildInternalRenewalReminderPlan({
      metadata: {
        ...reminderPlanMetadataFromContract(reviewedContract),
        needs_review: false
      },
      recipientEmails: recipients,
      now,
      renewalDecisionStatus: "resolved"
    });
    expect(resolvedReminderPlan.status).toBe("skipped_resolved");

    const reminderContent = buildInternalRenewalReminderContent({
      contractId: reviewedContract.id,
      contractTitle: reviewedContract.title,
      counterpartyName: reviewedContract.counterpartyName,
      noticeDeadlineDate: reviewedContract.noticeDeadlineDate,
      daysRemaining: 7,
      ownerLabel: "Finance Owner",
      appUrl,
      contractValueAmount: reviewedContract.contractValueAmount,
      contractValueCurrency: reviewedContract.contractValueCurrency,
      reminderType: "notice_deadline",
      escalationLevel: 3
    });
    expect(JSON.stringify(reminderContent)).not.toMatch(/raw contract|provider payload|private note|vendor outreach/i);

    const calendarEvents = buildUrgentRenewalCalendarEvents({
      appUrl,
      items: trustedDashboard.allActionItems
    });
    const calendar = buildCalendar(calendarEvents);
    expect(calendar).toContain("BEGIN:VCALENDAR");
    expect(calendar).toContain("Notice deadline");
    expect(calendar).not.toContain("Missing Notice");

    const template = buildRenewalManualActionTemplate({
      templateType: "cancellation_notice",
      contractTitle: reviewedContract.title,
      counterpartyName: reviewedContract.counterpartyName,
      renewalDate: reviewedContract.renewalDate,
      expirationDate: reviewedContract.expirationDate,
      noticeDeadlineDate: reviewedContract.noticeDeadlineDate
    });
    expect(template.body).toContain("Please confirm in writing");
    expect(template.boundaryNotice).toContain("does not send");
    expect(JSON.stringify(template)).not.toMatch(/recipient_email|vendor_email|provider payload|raw contract/i);
  });

  it("keeps SaaS Opt-Out Clock truth aligned with reviewed deadline, owner, spend, and weak evidence", () => {
    const findings = calculateSaasContractRiskFindings({
      renewalDate: "2026-09-15",
      expirationDate: "2026-09-15",
      noticeDeadlineDate: "2026-08-14",
      autoRenewal: true,
      ownerUserId: "owner-1",
      evidenceConfidence: 0.96,
      contractValueAmount: 75000,
      contractValueCurrency: "USD",
      today: "2026-08-07"
    });

    expect(findings.map((finding) => finding.findingType)).toEqual(
      expect.arrayContaining(["auto_renewal", "critical_opt_out", "high_spend_at_risk"])
    );

    expect(deriveSaasOptOutWorkflowStatus({
      noticeDeadline: "2026-08-14",
      ownerUserId: "owner-1",
      openFindingTypes: findings.map((finding) => finding.findingType),
      today: "2026-08-07"
    })).toBe("decision_needed");

    expect(deriveSaasOptOutWorkflowStatus({
      noticeDeadline: "2026-08-14",
      ownerUserId: "owner-1",
      openFindingTypes: ["weak_evidence"],
      today: "2026-08-07"
    })).toBe("needs_review");
  });

  it("keeps MVP cancellation and renegotiation templates copy-only with no provider/send path", () => {
    const repoRoot = process.cwd();
    const focusedFiles = [
      "lib/contracts/renewal-action-templates.ts",
      "lib/actions/contracts/manual-templates.ts",
      "components/contracts/manual-renewal-template-panel.tsx",
      "app/dashboard/contracts/[id]/page.tsx"
    ];
    const content = focusedFiles
      .map((file) => fs.readFileSync(path.join(repoRoot, file), "utf8"))
      .join("\n");

    expect(content).toContain("does not send");
    expect(content).not.toMatch(/sendCancellation|sendRenegotiation|sendVendor|vendorEmail|recipient_email|provider_payload|sequence|cadence|crm sync/i);
    expect(content).not.toMatch(/notice_sent|sent_at|delivery_provider/i);
  });

  it("documents the manual beta QA checklist and launch acceptance criteria", () => {
    const doc = fs.readFileSync(path.join(process.cwd(), "docs", "PDF_RENEWAL_CONTROL_BETA_QA.md"), "utf8");

    expect(doc).toContain("Upload a fake PDF contract");
    expect(doc).toContain("Copy the cancellation notice template");
    expect(doc).toContain("Copy the renegotiation request template");
    expect(doc).toContain("Weak AI dates are never treated as trusted operational deadlines before review");
    expect(doc).toContain("No reviewed path enables vendor sending or cross-organization access");
    expect(doc).not.toMatch(/enable auto-send|automated vendor notice|production vendor notice/i);
  });
});

function reminderPlanMetadataFromContract(contractInput: RenewalCommandContractInput) {
  return {
    contract_title: contractInput.title,
    counterparty_name: contractInput.counterpartyName ?? null,
    contract_type: "MSA",
    effective_date: null,
    renewal_date: contractInput.renewalDate ?? null,
    expiration_date: contractInput.expirationDate ?? null,
    auto_renewal: contractInput.autoRenewal ?? null,
    renewal_term: null,
    notice_period_value: 30,
    notice_period_unit: "days" as const,
    notice_deadline_date: contractInput.noticeDeadlineDate ?? null,
    termination_window: null,
    governing_law: null,
    payment_terms: null,
    contract_value_amount: contractInput.contractValueAmount ?? null,
    contract_value_currency: contractInput.contractValueCurrency ?? null,
    contract_value_period: null,
    price_change_trigger: null,
    payment_trigger: null,
    financial_data_trust_status: null,
    extracted_clauses: [],
    field_confidence: { notice_deadline_date: 0.96 },
    field_source_snippets: { notice_deadline_date: "Short evidence snippet." },
    reminder_recommendations: [],
    reviewer_notes: null
  };
}

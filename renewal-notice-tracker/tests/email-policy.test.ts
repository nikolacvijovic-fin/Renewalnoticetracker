import { describe, expect, it } from "vitest";
import {
  buildReminderActionLinks,
  buildReminderEmailPayload,
  getEmailInfrastructureGateStatus,
  PHASE1_EMAIL_SENDER
} from "@/lib/email/policy";

describe("phase-1 email policy", () => {
  it("builds signed action links instead of raw query intents", () => {
    const links = buildReminderActionLinks({
      appUrl: "https://app.noticecontrol.com",
      organizationId: "org-1",
      recipientIdentity: "owner@example.com",
      contractId: "contract-1",
      reminderId: "reminder-1"
    });

    expect(links.contractUrl).toContain("/dashboard/contracts/contract-1");
    expect(links.acknowledgeUrl).toContain("/api/email-actions/acknowledge/");
    expect(links.decisionUrl).toContain("/api/email-actions/decision/");
    expect(links.acknowledgeUrl).not.toContain("intent=acknowledge");
    expect(links.decisionUrl).not.toContain("intent=decision");
  });

  it("escapes dynamic HTML fields and warns against reply-based workflows", () => {
    const payload = buildReminderEmailPayload({
      organizationId: "org-1",
      recipientIdentity: "owner@example.com",
      contractId: "contract-1",
      reminderId: "reminder-1",
      contractTitle: `<img src=x onerror="alert('xss')"> MSA`,
      counterpartyName: `<b>Acme</b>`,
      remindAt: "2030-01-01T00:00:00.000Z",
      reminderTypeLabel: `<script>alert('x')</script> notice deadline`,
      noticeDeadlineDate: "2030-01-15",
      renewalDate: "2030-02-15",
      daysRemaining: 7,
      ownerLabel: "Owner One",
      contractValueAmount: 50000,
      contractValueCurrency: "USD",
      internalReminderTone: "Urgent renewal action needed",
      appUrl: "https://app.noticecontrol.com",
      legalDisclaimer: `<strong>Not legal advice.</strong>`,
      replyToEmail: "support@noticecontrol.com"
    });

    expect(payload.from).toBe(PHASE1_EMAIL_SENDER);
    expect(payload.replyTo).toBe("support@noticecontrol.com");
    expect(payload.html).toContain("&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt; MSA");
    expect(payload.html).toContain("&lt;b&gt;Acme&lt;/b&gt;");
    expect(payload.html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; notice deadline");
    expect(payload.subject).toBe("Urgent renewal action needed: <img src=x onerror=\"alert('xss')\"> MSA");
    expect(payload.html).toContain("This is an internal NoticeControl renewal-control reminder");
    expect(payload.html).toContain("<strong>Notice deadline:</strong> 2030-01-15");
    expect(payload.html).toContain("<strong>Renewal or expiration:</strong> 2030-02-15");
    expect(payload.html).toContain("<strong>Timing:</strong> 7 days remaining");
    expect(payload.html).toContain("<strong>Owner:</strong> Owner One");
    expect(payload.html).toContain("<strong>Spend at risk:</strong> $50,000");
    expect(payload.html).not.toMatch(/vendor outreach|cancellation email|sequence|CRM/i);
    expect(payload.html).toContain("&lt;strong&gt;Not legal advice.&lt;/strong&gt;");
    expect(payload.html).not.toContain("<script>alert('x')</script>");
    expect(payload.html).toContain("Acknowledge in NoticeControl");
    expect(payload.html).toContain("Record decision in NoticeControl");
    expect(payload.html).toContain("Replies to this email do not record acknowledgment or decisions");
    expect(payload.html).not.toContain("mailto:acknowledge");
  });

  it("fails release readiness when sender-domain plumbing is incomplete", () => {
    expect(
      getEmailInfrastructureGateStatus({
        fromEmail: "notifications@noticecontrol.com",
        sendingDomain: "noticecontrol.com",
        replyToEmail: "support@noticecontrol.com",
        webhookSigningSecret: "whsec_123"
      }).releaseReady
    ).toBe(true);

    expect(
      getEmailInfrastructureGateStatus({
        fromEmail: "alerts@example.com",
        sendingDomain: "",
        replyToEmail: "",
        webhookSigningSecret: ""
      }).releaseReady
    ).toBe(false);
  });
});

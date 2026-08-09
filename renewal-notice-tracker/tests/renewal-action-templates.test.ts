import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildRenewalManualActionTemplate } from "@/lib/contracts/renewal-action-templates";

describe("renewal manual action templates", () => {
  it("builds a cancellation template from safe contract metadata", () => {
    const template = buildRenewalManualActionTemplate({
      templateType: "cancellation_notice",
      contractTitle: "Acme MSA",
      counterpartyName: "Acme",
      renewalDate: "2026-10-01",
      expirationDate: "2026-10-31",
      noticeDeadlineDate: "2026-09-01",
      senderOrganizationName: "NoticeControl Customer"
    });

    expect(template.subject).toContain("cancellation / opt-out");
    expect(template.body).toContain("Acme MSA");
    expect(template.body).toContain("Acme");
    expect(template.body).toContain("Renewal date: 2026-10-01");
    expect(template.body).toContain("Expiration date: 2026-10-31");
    expect(template.body).toContain("Notice deadline: 2026-09-01");
    expect(template.body).toContain("Please confirm in writing");
    expect(template.body).toContain("[Sender name]");
    expect(template.boundaryNotice).toContain("does not send");
  });

  it("builds a renegotiation request from safe contract metadata", () => {
    const template = buildRenewalManualActionTemplate({
      templateType: "renegotiation_request",
      tone: "friendly",
      contractTitle: "Beta Subscription",
      counterpartyName: "Beta",
      renewalDate: "2026-11-15",
      noticeDeadlineDate: "2026-10-15"
    });

    expect(template.subject).toContain("renewal discussion");
    expect(template.body).toContain("discuss pricing, terms");
    expect(template.body).toContain("Beta Subscription");
    expect(template.body).toContain("Renewal date: 2026-11-15");
    expect(template.body).toContain("Notice deadline: 2026-10-15");
    expect(template.body).not.toMatch(/guarantee|ROI|savings|urgent/i);
  });

  it("handles missing and impossible dates gracefully", () => {
    const template = buildRenewalManualActionTemplate({
      templateType: "cancellation_notice",
      contractTitle: "Gamma Agreement",
      counterpartyName: "Gamma",
      renewalDate: "2026-02-31",
      expirationDate: null,
      noticeDeadlineDate: null
    });

    expect(template.body).toContain("Renewal date: not available in NoticeControl");
    expect(template.body).toContain("Expiration date: not available in NoticeControl");
    expect(template.body).toContain("Notice deadline: not available in NoticeControl");
    expect(template.safeMetadataUsed).toMatchObject({
      hasNoticeDeadline: false,
      hasRenewalDate: false,
      hasExpirationDate: false
    });
  });

  it("does not include raw contract text, clauses, provider payloads, or private notes", () => {
    const sensitiveMarker = "RAW CONTRACT TEXT provider_payload private note raw extracted clause";
    const template = buildRenewalManualActionTemplate({
      templateType: "renegotiation_request",
      contractTitle: "Safe Title",
      counterpartyName: "Safe Vendor",
      renewalDate: "2026-10-01",
      rawContractText: sensitiveMarker,
      extractedClauses: sensitiveMarker,
      privateNotes: sensitiveMarker,
      providerPayload: sensitiveMarker
    } as never);

    expect(JSON.stringify(template)).not.toContain(sensitiveMarker);
  });

  it("keeps the template slice free of delivery providers, recipient fields, and sequences", () => {
    const repoRoot = process.cwd();
    const files = [
      "lib/contracts/renewal-action-templates.ts",
      "lib/actions/contracts/manual-templates.ts",
      "components/contracts/manual-renewal-template-panel.tsx"
    ];
    const content = files.map((file) => fs.readFileSync(path.join(repoRoot, file), "utf8")).join("\n");

    expect(content).not.toMatch(/sendRenewal|sendEmail|smtp|resend|sequence|cadence|recipient_email|vendor_email/i);
  });
});

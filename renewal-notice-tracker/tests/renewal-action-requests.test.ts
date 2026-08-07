import { describe, expect, it } from "vitest";
import {
  assertRenewalActionResponseStatus,
  canRespondToRenewalActionRequest,
  getRenewalOwnerAuditAction,
  sanitizeRenewalActionAuditMetadata,
  sanitizeRenewalActionFreeText
} from "@/lib/contracts/renewal-action-requests";
import { buildRenewalActionRequestEmailPayload } from "@/lib/email/policy";

describe("renewal action request helpers", () => {
  it("selects owner assignment audit events from the owner transition", () => {
    expect(
      getRenewalOwnerAuditAction({ previousOwnerUserId: null, newOwnerUserId: "user-1" })
    ).toBe("renewal.owner_assigned");
    expect(
      getRenewalOwnerAuditAction({ previousOwnerUserId: "user-1", newOwnerUserId: "user-2" })
    ).toBe("renewal.owner_changed");
    expect(
      getRenewalOwnerAuditAction({ previousOwnerUserId: "user-1", newOwnerUserId: null })
    ).toBe("renewal.owner_removed");
  });

  it("allows only assigned owners or operator roles to respond", () => {
    expect(
      canRespondToRenewalActionRequest({
        role: "member",
        actorUserId: "owner-1",
        requestedToUserId: "owner-1"
      })
    ).toBe(true);
    expect(
      canRespondToRenewalActionRequest({
        role: "operator",
        actorUserId: "operator-1",
        requestedToUserId: "owner-1"
      })
    ).toBe(true);
    expect(
      canRespondToRenewalActionRequest({
        role: "member",
        actorUserId: "member-2",
        requestedToUserId: "owner-1"
      })
    ).toBe(false);
  });

  it("bounds free-text notes before persistence or audit", () => {
    const note = sanitizeRenewalActionFreeText(`  ${"x".repeat(520)}  `);
    expect(note).toHaveLength(500);
  });

  it("rejects unsupported response statuses", () => {
    expect(() => assertRenewalActionResponseStatus("renew")).not.toThrow();
    expect(() => assertRenewalActionResponseStatus("send_vendor_notice")).toThrow(
      "Unsupported renewal action response."
    );
  });

  it("allowlists audit metadata and strips sensitive content keys", () => {
    const metadata = sanitizeRenewalActionAuditMetadata({
      organizationId: "org-1",
      contractId: "contract-1",
      actorUserId: "user-1",
      responseStatus: "renew",
      rawContractText: "CONFIDENTIAL CONTRACT BODY",
      privateNote: "private note",
      providerPayload: { raw: true },
      storagePath: "/bucket/secret.pdf",
      token: "secret-token"
    });

    expect(metadata).toEqual({
      organizationId: "org-1",
      contractId: "contract-1",
      actorUserId: "user-1",
      responseStatus: "renew"
    });
    expect(JSON.stringify(metadata)).not.toContain("CONFIDENTIAL");
    expect(JSON.stringify(metadata)).not.toContain("secret-token");
  });

  it("builds an internal-only request email without vendor delivery language or raw content", () => {
    const payload = buildRenewalActionRequestEmailPayload({
      organizationId: "org-1",
      contractId: "contract-1",
      contractTitle: "Acme MSA",
      counterpartyName: "Acme",
      requestedActionLabel: "Decide renewal",
      noticeDeadlineDate: "2030-01-01",
      renewalDate: "2030-02-01",
      expirationDate: null,
      dueAt: "2030-01-01T00:00:00.000Z",
      ownerLabel: "Finance Owner",
      contractValueAmount: 120000,
      contractValueCurrency: "USD",
      requesterLabel: "Operator",
      message: "Please review the renewal path.",
      appUrl: "https://app.noticecontrol.test",
      legalDisclaimer: "Internal workflow only.",
      replyToEmail: "support@example.com"
    });

    expect(payload.subject).toContain("Renewal decision requested");
    expect(payload.html).toContain("This is an internal NoticeControl workflow message");
    expect(payload.html).toContain("https://app.noticecontrol.test/dashboard/contracts/contract-1");
    expect(payload.html).not.toMatch(/vendor notice|cancellation email|send to vendor/i);
    expect(payload.html).not.toContain("CONFIDENTIAL CONTRACT BODY");
  });
});

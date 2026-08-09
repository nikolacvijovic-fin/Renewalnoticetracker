import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrganization = vi.fn();
const assertCanUseShippedAction = vi.fn();
const createAuditLog = vi.fn();
const requireScopedContract = vi.fn();
const getContractById = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireOrganization,
  assertCanUseShippedAction
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("@/lib/contracts/kernel-queries", () => ({
  requireScopedContract,
  getContractById
}));

describe("recordRenewalManualTemplateCopyAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOrganization.mockResolvedValue({
      organizationId: "org-1",
      role: "owner",
      user: { id: "user-1" }
    });
    assertCanUseShippedAction.mockImplementation(async (context, _action, target) => {
      await target.assertScoped(context.organizationId);
      return context;
    });
    requireScopedContract.mockResolvedValue({ id: "contract-1" });
    getContractById.mockResolvedValue({
      id: "contract-1",
      contract_metadata: {
        renewal_date: "2026-10-01",
        expiration_date: null,
        notice_deadline_date: "2026-09-01",
        extracted_clauses: "RAW CONTRACT TEXT",
        reviewer_notes: "private note",
        provider_payload: "provider payload"
      }
    });
    createAuditLog.mockResolvedValue({ ok: true });
  });

  it("records metadata-only copy audit events for cancellation templates", async () => {
    const { recordRenewalManualTemplateCopyAction } = await import("@/lib/actions/contracts/manual-templates");

    await recordRenewalManualTemplateCopyAction("contract-1", "cancellation_notice");

    expect(assertCanUseShippedAction).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      "record_decision",
      expect.objectContaining({ organizationId: "org-1" })
    );
    expect(requireScopedContract).toHaveBeenCalledWith("contract-1", "org-1");
    expect(createAuditLog).toHaveBeenCalledTimes(2);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "renewal.template_copied",
        organizationId: "org-1",
        actorUserId: "user-1",
        contractId: "contract-1",
        details: {
          templateType: "cancellation_notice",
          hasNoticeDeadline: true,
          hasRenewalDate: true,
          hasExpirationDate: false
        }
      })
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "renewal.cancellation_template_copied" })
    );
    const auditPayload = JSON.stringify(createAuditLog.mock.calls);
    expect(auditPayload).not.toMatch(/RAW CONTRACT TEXT|private note|provider payload|Subject:|Please treat this message/i);
  });

  it("records the renegotiation-specific event without marking notice sent", async () => {
    const { recordRenewalManualTemplateCopyAction } = await import("@/lib/actions/contracts/manual-templates");

    await recordRenewalManualTemplateCopyAction("contract-1", "renegotiation_request");

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "renewal.renegotiation_template_copied" })
    );
    expect(JSON.stringify(createAuditLog.mock.calls)).not.toMatch(/notice_sent|sent_at|delivery|provider/i);
  });

  it("rejects unsupported template types before audit", async () => {
    const { recordRenewalManualTemplateCopyAction } = await import("@/lib/actions/contracts/manual-templates");

    await expect(recordRenewalManualTemplateCopyAction("contract-1", "send_vendor_email")).rejects.toThrow(
      "Unsupported renewal manual template type"
    );

    expect(createAuditLog).not.toHaveBeenCalled();
  });
});

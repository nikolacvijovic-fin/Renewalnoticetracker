import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrganization = vi.fn();
const requireShippedRuntimeAction = vi.fn();
const requireScopedContract = vi.fn();
const getBillingSnapshot = vi.fn();
const createServerSupabaseClient = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    requireOrganization,
    requireShippedRuntimeAction
  };
});

vi.mock("@/lib/contracts/kernel-queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/contracts/kernel-queries")>(
    "@/lib/contracts/kernel-queries"
  );
  return {
    ...actual,
    requireScopedContract
  };
});

vi.mock("@/lib/billing/entitlements", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/entitlements")>(
    "@/lib/billing/entitlements"
  );
  return {
    ...actual,
    getBillingSnapshot
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient
}));

vi.mock("next/cache", () => ({
  revalidatePath
}));

describe("contract action tenant enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOrganization.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      organizationId: "org-1",
      role: "operator"
    });
    requireShippedRuntimeAction.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      organizationId: "org-1",
      role: "operator"
    });
    requireScopedContract.mockRejectedValue(new Error("Contract not found for active organization."));
  });

  it(
    "stops manual reminder creation before billing or writes when the contract is outside the active org",
    async () => {
      const { createReminderAction } = await import("@/lib/actions/contracts");
      const formData = new FormData();
      formData.append("recipient_emails", "owner@example.com");
      formData.append("reminder_type", "renewal");
      formData.append("remind_at", "2030-01-01T00:00:00.000Z");

    await expect(
      createReminderAction("foreign-contract-id", formData)
    ).rejects.toThrow("Contract not found for active organization.");

      expect(requireScopedContract).toHaveBeenCalledWith("foreign-contract-id", "org-1");
      expect(getBillingSnapshot).not.toHaveBeenCalled();
      expect(createServerSupabaseClient).not.toHaveBeenCalled();
    },
    15000
  );

  it("stops note creation before any insert when the contract is outside the active org", async () => {
    const { createNoteAction } = await import("@/lib/actions/contracts");
    const formData = new FormData();
    formData.append("body", "Hidden foreign-org note");

    await expect(createNoteAction("foreign-contract-id", formData)).rejects.toThrow(
      "Contract not found for active organization."
    );

    expect(requireScopedContract).toHaveBeenCalledWith("foreign-contract-id", "org-1");
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("stops review updates before any writes when the contract is outside the active org", async () => {
    const { updateContractReviewAction } = await import("@/lib/actions/contracts");
    const formData = new FormData();
    formData.append("contract_title", "Foreign contract");
    formData.append("counterparty_name", "Foreign counterparty");
    formData.append("contract_type", "MSA");
    formData.append("renewal_term", "Annual");
    formData.append("governing_law", "Serbia");
    formData.append("payment_terms", "Net 30");
    formData.append("extracted_clauses", "[]");
    formData.append("field_confidence", "{}");
    formData.append("field_source_snippets", "{}");
    formData.append("reminder_recommendations", "[]");
    formData.append("reviewer_notes", "");
    formData.append("status_tag", "active");
    formData.append("renewal_decision_status", "undecided");

    await expect(updateContractReviewAction("foreign-contract-id", formData)).rejects.toThrow(
      "Contract not found for active organization."
    );

    expect(requireScopedContract).toHaveBeenCalledWith("foreign-contract-id", "org-1");
    expect(getBillingSnapshot).not.toHaveBeenCalled();
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("stops renewal decision creation before any insert when the contract is outside the active org", async () => {
    const { createRenewalDecisionAction } = await import("@/lib/actions/contracts");
    const formData = new FormData();
    formData.append("status", "renew");
    formData.append("summary", "Should not be saved");

    await expect(createRenewalDecisionAction("foreign-contract-id", formData)).rejects.toThrow(
      "Contract not found for active organization."
    );

    expect(requireScopedContract).toHaveBeenCalledWith("foreign-contract-id", "org-1");
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("stops acknowledgment before any update when the contract is outside the active org", async () => {
    const { acknowledgeContractAction } = await import("@/lib/actions/contracts");

    await expect(acknowledgeContractAction("foreign-contract-id")).rejects.toThrow(
      "Contract not found for active organization."
    );

    expect(requireScopedContract).toHaveBeenCalledWith("foreign-contract-id", "org-1");
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("stops cycle updates before any write when the contract is outside the active org", async () => {
    const { updateRenewalCycleAction } = await import("@/lib/actions/contracts");
    const formData = new FormData();
    formData.append("cycle_status", "reopened");

    await expect(updateRenewalCycleAction("foreign-contract-id", formData)).rejects.toThrow(
      "Contract not found for active organization."
    );

    expect(requireScopedContract).toHaveBeenCalledWith("foreign-contract-id", "org-1");
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("blocks owner attempts to change reviewed P0 truth directly", async () => {
    requireOrganization.mockResolvedValueOnce({
      user: { id: "user-1", email: "owner@example.com" },
      organizationId: "org-1",
      role: "owner"
    });
    const { updateContractReviewAction } = await import("@/lib/actions/contracts");
    const formData = new FormData();
    formData.append("contract_title", "Owned contract");
    formData.append("counterparty_name", "Acme");
    formData.append("contract_type", "MSA");
    formData.append("renewal_term", "Annual");
    formData.append("governing_law", "Serbia");
    formData.append("payment_terms", "Net 30");
    formData.append("extracted_clauses", "[]");
    formData.append("field_confidence", "{}");
    formData.append("field_source_snippets", "{}");
    formData.append("reminder_recommendations", "[]");
    formData.append("reviewer_notes", "");
    formData.append("status_tag", "active");
    formData.append("renewal_decision_status", "undecided");

    await expect(updateContractReviewAction("contract-1", formData)).rejects.toThrow(
      'Role "owner" is not allowed to use permission "review_p0".'
    );

    expect(requireScopedContract).not.toHaveBeenCalled();
  });

  it("blocks reviewer attempts to record business decisions", async () => {
    requireOrganization.mockResolvedValueOnce({
      user: { id: "user-2", email: "reviewer@example.com" },
      organizationId: "org-1",
      role: "reviewer"
    });
    const { createRenewalDecisionAction } = await import("@/lib/actions/contracts");
    const formData = new FormData();
    formData.append("status", "renew");
    formData.append("summary", "Should be denied");

    await expect(createRenewalDecisionAction("contract-1", formData)).rejects.toThrow(
      'Role "reviewer" is not allowed to use permission "record_decision".'
    );

    expect(requireScopedContract).not.toHaveBeenCalled();
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireOrganization: vi.fn(),
  assertCanUseShippedAction: vi.fn()
}));
const queries = vi.hoisted(() => ({
  requireScopedContract: vi.fn(),
  getContractById: vi.fn()
}));
const runner = vi.hoisted(() => ({
  runPythonRenewalQuoteComparison: vi.fn()
}));
const persisted = vi.hoisted(() => ({
  runPersistedCommercialComparison: vi.fn()
}));
const proposalRepository = vi.hoisted(() => ({
  getLatestAdminCommercialBaseline: vi.fn(),
  uploadAdminRenewalProposalFile: vi.fn()
}));
const proposalIngestion = vi.hoisted(() => ({
  parseCommercialProposalSpreadsheet: vi.fn(),
  proposalTermsFromCommercialCandidates: vi.fn()
}));
const revalidatePath = vi.fn();
const enforceDesignPartnerBetaMutation = vi.fn();
const recalculateEvidenceReadiness = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/contracts/kernel-queries", () => queries);
vi.mock("@/lib/quote-comparison/python-quote-comparison-runner", () => runner);
vi.mock("@/lib/quote-comparison/persisted-commercial-comparison", () => persisted);
vi.mock("@/lib/quote-comparison/repositories/admin-quote-comparison-repository", () => proposalRepository);
vi.mock("@/lib/quote-comparison/proposal-ingestion", () => ({
  COMMERCIAL_PROPOSAL_MIME_TYPES: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ],
  ...proposalIngestion
}));
vi.mock("@/lib/billing/design-partner-beta", () => ({ enforceDesignPartnerBetaMutation }));
vi.mock("@/lib/evidence-readiness/evidence-readiness-service", () => ({ recalculateEvidenceReadiness }));
vi.mock("@/lib/quote-comparison/quote-comparison", () => ({
  createRenewalQuoteComparison: vi.fn(),
  createSavingsOpportunityFromFinding: vi.fn(),
  getRenewalQuoteComparison: vi.fn(),
  reviewQuoteFinding: vi.fn(),
  updateSavingsOpportunityStatus: vi.fn()
}));

describe("quote comparison actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireOrganization.mockResolvedValue({
      organizationId: "org-1",
      role: "reviewer",
      user: { id: "user-1" }
    });
    auth.assertCanUseShippedAction.mockResolvedValue(undefined);
    enforceDesignPartnerBetaMutation.mockResolvedValue({ allowed: true });
    recalculateEvidenceReadiness.mockResolvedValue({});
    queries.requireScopedContract.mockResolvedValue({ id: "contract-1", organization_id: "org-1" });
    queries.getContractById.mockResolvedValue({
      id: "contract-1",
      contract_metadata: {
        contract_value_amount: 10000,
        contract_value_currency: "USD",
        payment_terms: "Net 30",
        renewal_term: "12 months",
        auto_renewal: true,
        notice_deadline_date: "2030-01-01",
        price_change_trigger: null
      }
    });
    runner.runPythonRenewalQuoteComparison.mockResolvedValue({ ok: true });
    persisted.runPersistedCommercialComparison.mockResolvedValue({ comparisonId: "comparison-1" });
    proposalRepository.getLatestAdminCommercialBaseline.mockResolvedValue({ data: { id: "baseline-1" }, error: null });
    proposalRepository.uploadAdminRenewalProposalFile.mockResolvedValue({
      data: { id: "quote-file-1", file_name: "renewal.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size_bytes: 10 },
      error: null
    });
    proposalIngestion.parseCommercialProposalSpreadsheet.mockReturnValue({
      documentType: "renewal_quote",
      terms: { lineItems: [{ lineKey: "sku", productName: "Seats", chargeType: "recurring", pricingModel: "per_unit", billingPeriod: "annual", quantity: 10, unitPrice: 100, totalAmount: 1000, currency: "EUR", evidence: [] }], currency: "EUR", evidence: [] },
      warnings: [], requiresReview: true
    });
  });

  it("requires dedicated proposal upload and comparison permissions before running manual quote comparison", async () => {
    const { createAndRunQuoteComparisonFormAction } = await import("@/lib/actions/contracts/quote-comparison");
    const formData = new FormData();
    formData.set("proposed_total_amount", "12500");
    formData.set("currency", "USD");
    formData.set("product_name", "Platform subscription");

    await createAndRunQuoteComparisonFormAction("contract-1", formData);

    expect(auth.assertCanUseShippedAction).toHaveBeenNthCalledWith(
      1, expect.objectContaining({ organizationId: "org-1" }), "upload_renewal_proposal"
    );
    expect(auth.assertCanUseShippedAction).toHaveBeenNthCalledWith(
      2, expect.objectContaining({ organizationId: "org-1" }), "run_commercial_comparison"
    );
    expect(enforceDesignPartnerBetaMutation).toHaveBeenCalledWith({
      organizationId: "org-1",
      action: "upload_quote"
    });
    expect(queries.requireScopedContract).toHaveBeenCalledWith("contract-1", "org-1");
    expect(persisted.runPersistedCommercialComparison).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        contractId: "contract-1",
        actorUserId: "user-1",
        proposalTerms: expect.objectContaining({
          statedAnnualTotal: 12500,
          currency: "USD",
          lineItems: [expect.objectContaining({ productName: "Platform subscription", totalAmount: 12500 })]
        })
      })
    );
    expect(runner.runPythonRenewalQuoteComparison).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/contracts/contract-1");
  });

  it("stores and compares an organization-scoped XLSX proposal without applying it to contract truth", async () => {
    const { uploadAndRunCommercialProposalFormAction } = await import("@/lib/actions/contracts/quote-comparison");
    const formData = new FormData();
    const proposalFile = new File(["xlsx-bytes"], "renewal.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    Object.defineProperty(proposalFile, "arrayBuffer", { value: async () => Buffer.from("xlsx-bytes") });
    formData.set("proposal_file", proposalFile);

    await uploadAndRunCommercialProposalFormAction("contract-1", formData);

    expect(queries.requireScopedContract).toHaveBeenCalledWith("contract-1", "org-1");
    expect(proposalRepository.uploadAdminRenewalProposalFile).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1", contractId: "contract-1", actorUserId: "user-1", fileName: "renewal.xlsx"
    }));
    expect(persisted.runPersistedCommercialComparison).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1", contractId: "contract-1", quoteFileId: "quote-file-1",
      proposalDocumentType: "renewal_quote"
    }));
  });

  it("denies proposal upload before storage when contract scope fails", async () => {
    queries.requireScopedContract.mockRejectedValueOnce(new Error("not_found"));
    const { uploadAndRunCommercialProposalFormAction } = await import("@/lib/actions/contracts/quote-comparison");
    const formData = new FormData();
    formData.set("proposal_file", new File(["xlsx-bytes"], "renewal.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }));
    await expect(uploadAndRunCommercialProposalFormAction("foreign-contract", formData)).rejects.toThrow("not_found");
    expect(proposalRepository.uploadAdminRenewalProposalFile).not.toHaveBeenCalled();
  });
});

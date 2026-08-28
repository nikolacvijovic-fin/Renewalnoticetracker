import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeCommercialTerms } from "@/lib/quote-comparison/commercial-comparison-engine";

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
  failAdminRenewalProposalUpload: vi.fn(),
  getAdminRecoverablePendingCommercialProposal: vi.fn(),
  getAdminReadyCommercialProposal: vi.fn(),
  getLatestAdminCommercialBaseline: vi.fn(),
  markAdminRenewalProposalUploadReady: vi.fn(),
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
      data: { id: "quote-file-1", file_name: "renewal.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size_bytes: 10, proposal_upload_status: "pending", idempotentReplay: false },
      error: null
    });
    proposalRepository.markAdminRenewalProposalUploadReady.mockResolvedValue({
      data: { id: "quote-file-1", proposal_upload_status: "ready" },
      error: null
    });
    proposalRepository.failAdminRenewalProposalUpload.mockResolvedValue({ cleaned: true, error: null });
    proposalRepository.getAdminRecoverablePendingCommercialProposal.mockResolvedValue({ data: null, error: null });
    proposalRepository.getAdminReadyCommercialProposal.mockResolvedValue({ data: null, error: null });
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
          currency: "USD",
          lineItems: [expect.objectContaining({ productName: "Platform subscription", totalAmount: 12500 })]
        })
      })
    );
    expect(persisted.runPersistedCommercialComparison.mock.calls[0]?.[0].proposalTerms)
      .not.toHaveProperty("statedAnnualTotal");
    expect(runner.runPythonRenewalQuoteComparison).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/contracts/contract-1");
  });

  it.each([
    { billingPeriod: "monthly", chargeType: "recurring", annual: 1_200, oneTime: 0, commitment: 1_200 },
    { billingPeriod: "quarterly", chargeType: "recurring", annual: 400, oneTime: 0, commitment: 400 },
    { billingPeriod: "annual", chargeType: "recurring", annual: 100, oneTime: 0, commitment: 100 },
    { billingPeriod: "annual", chargeType: "one_time", annual: 0, oneTime: 100, commitment: 100 }
  ] as const)(
    "lets the engine calculate $billingPeriod $chargeType manual pricing",
    async ({ billingPeriod, chargeType, annual, oneTime, commitment }) => {
      const { createAndRunQuoteComparisonFormAction } = await import("@/lib/actions/contracts/quote-comparison");
      const formData = new FormData();
      formData.set("proposed_total_amount", "100");
      formData.set("currency", "EUR");
      formData.set("product_name", "Manual proposal line");
      formData.set("billing_period", billingPeriod);
      formData.set("charge_type", chargeType);
      formData.set("term_months", "12");

      await createAndRunQuoteComparisonFormAction("contract-1", formData);

      const proposalTerms = persisted.runPersistedCommercialComparison.mock.calls[0]?.[0]
        .proposalTerms;
      expect(proposalTerms).not.toHaveProperty("statedAnnualTotal");
      const normalized = normalizeCommercialTerms(proposalTerms, { requireAcceptedEvidence: false });
      expect(normalized.calculatedAnnualTotal).toBe(annual);
      expect(normalized.calculatedOneTimeTotal).toBe(oneTime);
      expect(normalized.calculatedCommitmentTotal).toBe(commitment);
    }
  );

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
    const file = new File(["xlsx-bytes"], "renewal.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    Object.defineProperty(file, "arrayBuffer", { value: async () => Buffer.from("xlsx-bytes") });
    formData.set("proposal_file", file);
    await expect(uploadAndRunCommercialProposalFormAction("foreign-contract", formData)).rejects.toThrow("not_found");
    expect(proposalRepository.uploadAdminRenewalProposalFile).not.toHaveBeenCalled();
  });

  it("cleans up a stored proposal when extraction fails", async () => {
    proposalIngestion.parseCommercialProposalSpreadsheet.mockImplementationOnce(() => {
      throw new Error("SENSITIVE_PROVIDER_PAYLOAD");
    });
    const { uploadAndRunCommercialProposalFormAction } = await import("@/lib/actions/contracts/quote-comparison");
    const formData = new FormData();
    const file = new File(["xlsx-bytes"], "renewal.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    Object.defineProperty(file, "arrayBuffer", { value: async () => Buffer.from("xlsx-bytes") });
    formData.set("proposal_file", file);

    await expect(uploadAndRunCommercialProposalFormAction("contract-1", formData))
      .rejects.toThrow("Proposal extraction could not complete safely");
    expect(proposalRepository.failAdminRenewalProposalUpload).toHaveBeenCalledWith({
      organizationId: "org-1",
      contractId: "contract-1",
      quoteFileId: "quote-file-1",
      failureCode: "proposal_extraction_failed"
    });
  });

  it("marks a proposal failed when atomic comparison persistence fails", async () => {
    persisted.runPersistedCommercialComparison.mockRejectedValueOnce(new Error("SENSITIVE_DATABASE_ERROR"));
    const { uploadAndRunCommercialProposalFormAction } = await import("@/lib/actions/contracts/quote-comparison");
    const formData = new FormData();
    const file = new File(["xlsx-bytes"], "renewal.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    Object.defineProperty(file, "arrayBuffer", { value: async () => Buffer.from("xlsx-bytes") });
    formData.set("proposal_file", file);

    await expect(uploadAndRunCommercialProposalFormAction("contract-1", formData))
      .rejects.toThrow("Proposal comparison could not complete safely");
    expect(proposalRepository.failAdminRenewalProposalUpload).toHaveBeenCalledWith(expect.objectContaining({
      failureCode: "proposal_comparison_failed"
    }));
    expect(proposalRepository.markAdminRenewalProposalUploadReady).not.toHaveBeenCalled();
  });

  it("reuses a ready proposal without repeating extraction or comparison persistence", async () => {
    proposalRepository.uploadAdminRenewalProposalFile.mockResolvedValueOnce({
      data: { id: "quote-file-1", file_name: "renewal.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size_bytes: 10, proposal_upload_status: "ready", idempotentReplay: true },
      error: null
    });
    proposalRepository.getAdminReadyCommercialProposal.mockResolvedValueOnce({
      data: {
        comparisonId: "comparison-1",
        proposalVersionId: "proposal-version-1",
        proposal_upload_status: "ready"
      },
      error: null
    });
    const { uploadAndRunCommercialProposalFormAction } = await import("@/lib/actions/contracts/quote-comparison");
    const formData = new FormData();
    const file = new File(["xlsx-bytes"], "renewal.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    Object.defineProperty(file, "arrayBuffer", { value: async () => Buffer.from("xlsx-bytes") });
    formData.set("proposal_file", file);

    await expect(uploadAndRunCommercialProposalFormAction("contract-1", formData)).resolves.toEqual({
      comparisonId: "comparison-1",
      proposalVersionId: "proposal-version-1",
      isNew: false
    });
    expect(proposalIngestion.parseCommercialProposalSpreadsheet).not.toHaveBeenCalled();
    expect(proposalRepository.markAdminRenewalProposalUploadReady).not.toHaveBeenCalled();
    expect(persisted.runPersistedCommercialComparison).not.toHaveBeenCalled();
  });

  it("recovers a persisted pending proposal after its initial finalization fails", async () => {
    proposalRepository.uploadAdminRenewalProposalFile
      .mockResolvedValueOnce({
        data: { id: "quote-file-1", file_name: "renewal.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size_bytes: 10, proposal_upload_status: "pending", idempotentReplay: false },
        error: null
      })
      .mockResolvedValueOnce({
        data: { id: "quote-file-1", file_name: "renewal.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size_bytes: 10, proposal_upload_status: "pending", idempotentReplay: true },
        error: null
      });
    proposalRepository.markAdminRenewalProposalUploadReady
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: { id: "quote-file-1", proposal_upload_status: "ready", idempotentReplay: false },
        error: null
      });
    proposalRepository.getAdminRecoverablePendingCommercialProposal.mockResolvedValueOnce({
      data: {
        comparisonId: "comparison-1",
        proposalVersionId: "proposal-version-1",
        proposal_upload_status: "pending"
      },
      error: null
    });
    const { uploadAndRunCommercialProposalFormAction } = await import("@/lib/actions/contracts/quote-comparison");
    const makeFormData = () => {
      const formData = new FormData();
      const file = new File(["xlsx-bytes"], "renewal.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      Object.defineProperty(file, "arrayBuffer", { value: async () => Buffer.from("xlsx-bytes") });
      formData.set("proposal_file", file);
      return formData;
    };

    await expect(uploadAndRunCommercialProposalFormAction("contract-1", makeFormData()))
      .rejects.toThrow("upload state changed before finalization");
    await expect(uploadAndRunCommercialProposalFormAction("contract-1", makeFormData())).resolves.toEqual({
      comparisonId: "comparison-1",
      proposalVersionId: "proposal-version-1",
      isNew: false
    });

    expect(proposalIngestion.parseCommercialProposalSpreadsheet).toHaveBeenCalledTimes(1);
    expect(persisted.runPersistedCommercialComparison).toHaveBeenCalledTimes(1);
    expect(proposalRepository.failAdminRenewalProposalUpload).not.toHaveBeenCalled();
  });

  it("keeps an incomplete pending proposal blocked as already processing", async () => {
    proposalRepository.uploadAdminRenewalProposalFile.mockResolvedValueOnce({
      data: { id: "quote-file-1", file_name: "renewal.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size_bytes: 10, proposal_upload_status: "pending", idempotentReplay: true },
      error: null
    });
    proposalRepository.getAdminRecoverablePendingCommercialProposal.mockResolvedValueOnce({ data: null, error: null });
    const { uploadAndRunCommercialProposalFormAction } = await import("@/lib/actions/contracts/quote-comparison");
    const formData = new FormData();
    const file = new File(["xlsx-bytes"], "renewal.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    Object.defineProperty(file, "arrayBuffer", { value: async () => Buffer.from("xlsx-bytes") });
    formData.set("proposal_file", file);

    await expect(uploadAndRunCommercialProposalFormAction("contract-1", formData))
      .rejects.toThrow("already being processed");
    expect(proposalRepository.markAdminRenewalProposalUploadReady).not.toHaveBeenCalled();
    expect(persisted.runPersistedCommercialComparison).not.toHaveBeenCalled();
  });

  it("lets concurrent recovery attempts share one completed graph without new artifacts", async () => {
    proposalRepository.uploadAdminRenewalProposalFile.mockResolvedValue({
      data: { id: "quote-file-1", file_name: "renewal.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size_bytes: 10, proposal_upload_status: "pending", idempotentReplay: true },
      error: null
    });
    proposalRepository.getAdminRecoverablePendingCommercialProposal.mockResolvedValue({
      data: {
        comparisonId: "comparison-1",
        proposalVersionId: "proposal-version-1",
        proposal_upload_status: "pending"
      },
      error: null
    });
    proposalRepository.markAdminRenewalProposalUploadReady
      .mockResolvedValueOnce({
        data: { id: "quote-file-1", proposal_upload_status: "ready", idempotentReplay: false },
        error: null
      })
      .mockResolvedValueOnce({
        data: { id: "quote-file-1", proposal_upload_status: "ready", idempotentReplay: true },
        error: null
      });
    const { uploadAndRunCommercialProposalFormAction } = await import("@/lib/actions/contracts/quote-comparison");
    const makeFormData = () => {
      const formData = new FormData();
      const file = new File(["identical-xlsx-bytes"], "renewal.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      Object.defineProperty(file, "arrayBuffer", { value: async () => Buffer.from("identical-xlsx-bytes") });
      formData.set("proposal_file", file);
      return formData;
    };

    const results = await Promise.all([
      uploadAndRunCommercialProposalFormAction("contract-1", makeFormData()),
      uploadAndRunCommercialProposalFormAction("contract-1", makeFormData())
    ]);

    expect(results).toEqual([
      { comparisonId: "comparison-1", proposalVersionId: "proposal-version-1", isNew: false },
      { comparisonId: "comparison-1", proposalVersionId: "proposal-version-1", isNew: false }
    ]);
    expect(proposalIngestion.parseCommercialProposalSpreadsheet).not.toHaveBeenCalled();
    expect(persisted.runPersistedCommercialComparison).not.toHaveBeenCalled();
    expect(proposalRepository.markAdminRenewalProposalUploadReady).toHaveBeenCalledTimes(2);
  });

  it("allows only one identical pending upload to execute extraction and comparison", async () => {
    proposalRepository.uploadAdminRenewalProposalFile
      .mockResolvedValueOnce({
        data: { id: "quote-file-1", file_name: "renewal.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size_bytes: 10, proposal_upload_status: "pending", idempotentReplay: false },
        error: null
      })
      .mockResolvedValueOnce({
        data: { id: "quote-file-1", file_name: "renewal.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size_bytes: 10, proposal_upload_status: "pending", idempotentReplay: true },
        error: null
      });
    let finishComparison!: (value: { comparisonId: string }) => void;
    persisted.runPersistedCommercialComparison.mockImplementationOnce(() => new Promise((resolve) => {
      finishComparison = resolve;
    }));
    const { uploadAndRunCommercialProposalFormAction } = await import("@/lib/actions/contracts/quote-comparison");
    const makeFormData = () => {
      const formData = new FormData();
      const file = new File(["identical-xlsx-bytes"], "renewal.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      Object.defineProperty(file, "arrayBuffer", { value: async () => Buffer.from("identical-xlsx-bytes") });
      formData.set("proposal_file", file);
      return formData;
    };

    const first = uploadAndRunCommercialProposalFormAction("contract-1", makeFormData());
    await vi.waitFor(() => expect(persisted.runPersistedCommercialComparison).toHaveBeenCalledTimes(1));
    await expect(uploadAndRunCommercialProposalFormAction("contract-1", makeFormData()))
      .rejects.toThrow("already being processed");
    finishComparison({ comparisonId: "comparison-1" });
    await expect(first).resolves.toEqual({ comparisonId: "comparison-1" });

    expect(proposalIngestion.parseCommercialProposalSpreadsheet).toHaveBeenCalledTimes(1);
    expect(persisted.runPersistedCommercialComparison).toHaveBeenCalledTimes(1);
    expect(proposalRepository.markAdminRenewalProposalUploadReady).toHaveBeenCalledTimes(1);
  });

  it("fails closed when finalization returns no transitioned upload row", async () => {
    proposalRepository.markAdminRenewalProposalUploadReady.mockResolvedValueOnce({ data: null, error: null });
    const { uploadAndRunCommercialProposalFormAction } = await import("@/lib/actions/contracts/quote-comparison");
    const formData = new FormData();
    const file = new File(["xlsx-bytes"], "renewal.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    Object.defineProperty(file, "arrayBuffer", { value: async () => Buffer.from("xlsx-bytes") });
    formData.set("proposal_file", file);

    await expect(uploadAndRunCommercialProposalFormAction("contract-1", formData))
      .rejects.toThrow("upload state changed before finalization");
  });
});

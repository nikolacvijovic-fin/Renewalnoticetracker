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
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/contracts/kernel-queries", () => queries);
vi.mock("@/lib/quote-comparison/python-quote-comparison-runner", () => runner);
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
  });

  it("requires shipped review permission and scoped contract before running manual quote comparison", async () => {
    const { createAndRunQuoteComparisonFormAction } = await import("@/lib/actions/contracts/quote-comparison");
    const formData = new FormData();
    formData.set("proposed_total_amount", "12500");
    formData.set("currency", "USD");
    formData.set("quote_text", "Renewal quote total is USD 12,500.");

    await createAndRunQuoteComparisonFormAction("contract-1", formData);

    expect(auth.assertCanUseShippedAction).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      "review_p0"
    );
    expect(queries.requireScopedContract).toHaveBeenCalledWith("contract-1", "org-1");
    expect(runner.runPythonRenewalQuoteComparison).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        contractId: "contract-1",
        currentTerms: expect.objectContaining({
          total_amount: 10000,
          currency: "USD"
        }),
        proposedTerms: expect.objectContaining({
          total_amount: 12500,
          currency: "USD"
        })
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/contracts/contract-1");
  });
});
